import { describe, expect, it } from 'vitest';
import { computeScores, effectivePairs, findInconsistencies, maxCyclicTriads, recompareQueue, resolvePairs } from './analysis';
import { answeredCount, buildQuestionOrder, comparisonCount } from './pairs';
import {
  answerCurrent,
  createProject,
  parseBulkNames,
  previewItemsChange,
  resetAnswers,
  resolveManually,
  setAskReverse,
  setItems,
  startRecompare,
  undoLast,
} from './project';
import { pairKey } from './types';
import type { Answer, Item, Project } from './types';

const NOW = '2026-10-18T00:00:00.000Z';

/** Deterministic pseudo-random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function items(...names: string[]): Item[] {
  return names.map((name) => ({ id: name, name }));
}

/** Project where each listed relation is answered in both directions consistently. */
function projectWith(list: Item[], relations: [string, Answer, string][], askReverse = true): Project {
  const project = { ...createProject('test', 'p', NOW), items: list, settings: { askReverse } };
  for (const [a, answer, b] of relations) {
    project.responses.push({ first: a, second: b, answer, round: 1, answeredAt: NOW });
    if (askReverse) {
      const reverse: Answer = answer === 'better' ? 'worse' : answer === 'worse' ? 'better' : 'equal';
      project.responses.push({ first: b, second: a, answer: reverse, round: 1, answeredAt: NOW });
    }
  }
  return project;
}

/** Answers every pending question using a lookup of intended relations. */
function answerAll(project: Project, decide: (first: string, second: string) => Answer): Project {
  let p = project;
  while (p.pending.length > 0) p = answerCurrent(p, decide(p.pending[0].first, p.pending[0].second), NOW);
  return p;
}

const round1 = (x: number) => Math.round(x * 1000) / 10;

describe('comparisonCount (spec 4.1, 7)', () => {
  it.each([
    [0, 0, 0],
    [1, 0, 0],
    [2, 2, 1],
    [3, 6, 3],
    [20, 380, 190],
    [30, 870, 435],
  ])('n=%i → %i / %i', (n, withReverse, without) => {
    expect(comparisonCount(n, true)).toBe(withReverse);
    expect(comparisonCount(n, false)).toBe(without);
  });
});

describe('buildQuestionOrder (spec 4.2)', () => {
  it('asks every direction once and separates the passes', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const list = items('A', 'B', 'C', 'D');
      const order = buildQuestionOrder(list, true, seeded(seed));
      expect(order).toHaveLength(12);
      expect(new Set(order.map((q) => `${q.first}>${q.second}`)).size).toBe(12);
      const half = order.length / 2;
      expect(pairKey(order[half - 1].first, order[half - 1].second)).not.toBe(pairKey(order[half].first, order[half].second));
      expect(new Set(order.slice(0, half).map((q) => pairKey(q.first, q.second))).size).toBe(6);
    }
  });

  it('asks each pair once without reverse questions', () => {
    const order = buildQuestionOrder(items('A', 'B', 'C'), false, seeded(7));
    expect(order).toHaveLength(3);
    expect(new Set(order.map((q) => pairKey(q.first, q.second))).size).toBe(3);
  });

  it('handles 0, 1 and 2 items', () => {
    expect(buildQuestionOrder(items(), true, seeded(1))).toEqual([]);
    expect(buildQuestionOrder(items('A'), true, seeded(1))).toEqual([]);
    expect(buildQuestionOrder(items('A', 'B'), true, seeded(1))).toHaveLength(2);
  });
});

describe('Example 1: consistent (spec 7)', () => {
  const list = items('Скорость', 'Стоимость', 'Вес');
  const project = projectWith(list, [
    ['Скорость', 'better', 'Стоимость'],
    ['Скорость', 'better', 'Вес'],
    ['Стоимость', 'equal', 'Вес'],
  ]);

  it('scores and weights', () => {
    const scores = computeScores(list, resolvePairs(project))!;
    const byName = Object.fromEntries(scores.rows.map((r) => [r.name, r]));
    expect(byName['Скорость'].score).toBe(2);
    expect(byName['Стоимость'].score).toBe(0.5);
    expect(byName['Вес'].score).toBe(0.5);
    expect(round1(byName['Скорость'].weight)).toBe(66.7);
    expect(round1(byName['Вес'].weight)).toBe(16.7);
    expect(byName['Скорость'].place).toBe(1);
    expect(byName['Стоимость'].place).toBe(2);
    expect(byName['Вес'].place).toBe(2);
  });

  it('has no cycles and zeta = 1', () => {
    const inc = findInconsistencies(list, resolvePairs(project));
    expect(inc.strict).toHaveLength(0);
    expect(inc.weak).toHaveLength(0);
    expect(inc.zeta).toBe(1);
  });
});

describe('Example 2: cycle and direct contradiction (spec 7)', () => {
  const list = items('Скорость', 'Стоимость', 'Вес', 'Надёжность');
  const base = projectWith(list, [
    ['Скорость', 'better', 'Стоимость'],
    ['Стоимость', 'better', 'Вес'],
    ['Вес', 'better', 'Скорость'],
    ['Надёжность', 'better', 'Скорость'],
    ['Надёжность', 'better', 'Вес'],
  ]);
  base.responses.push(
    { first: 'Надёжность', second: 'Стоимость', answer: 'better', round: 1, answeredAt: NOW },
    { first: 'Стоимость', second: 'Надёжность', answer: 'better', round: 1, answeredAt: NOW },
  );

  it('detects the contradiction and blocks results', () => {
    const pairs = resolvePairs(base);
    expect(pairs.get(pairKey('Надёжность', 'Стоимость'))!.status).toBe('conflict');
    expect(computeScores(list, pairs)).toBeNull();
  });

  it('offers the contradiction first, then the three cycle pairs', () => {
    const pairs = effectivePairs(base);
    const queue = recompareQueue(pairs, findInconsistencies(list, pairs));
    expect(queue[0].key).toBe(pairKey('Надёжность', 'Стоимость'));
    expect(queue[0].reason).toBe('conflict');
    expect(new Set(queue.slice(1, 4).map((c) => c.key))).toEqual(
      new Set([pairKey('Скорость', 'Стоимость'), pairKey('Стоимость', 'Вес'), pairKey('Вес', 'Скорость')]),
    );
  });

  it('after re-comparison gives the expected scores, one cycle and zeta = 0.5', () => {
    let p = startRecompare(base, seeded(3), NOW)!;
    expect(p.pending).toHaveLength(8); // 4 pairs × 2 directions
    p = answerAll(p, (first, second) => {
      // Keep earlier opinions, settle the contradiction as Надёжность > Стоимость.
      const wins: Record<string, string> = {
        [pairKey('Скорость', 'Стоимость')]: 'Скорость',
        [pairKey('Стоимость', 'Вес')]: 'Стоимость',
        [pairKey('Вес', 'Скорость')]: 'Вес',
        [pairKey('Надёжность', 'Стоимость')]: 'Надёжность',
      };
      return wins[pairKey(first, second)] === first ? 'better' : 'worse';
    });
    const pairs = effectivePairs(p);
    const scores = computeScores(list, pairs)!;
    const byName = Object.fromEntries(scores.rows.map((r) => [r.name, r]));
    expect(byName['Надёжность'].score).toBe(3);
    expect(byName['Надёжность'].weight).toBe(0.5);
    for (const name of ['Скорость', 'Стоимость', 'Вес']) {
      expect(byName[name].score).toBe(1);
      expect(round1(byName[name].weight)).toBe(16.7);
    }
    const inc = findInconsistencies(list, pairs);
    expect(inc.strict).toEqual([['Скорость', 'Стоимость', 'Вес']]);
    expect(inc.dMax).toBe(2);
    expect(inc.zeta).toBe(0.5);
  });
});

describe('Example 3: weak contradiction (spec 7)', () => {
  const list = items('A', 'B', 'C');
  const project = projectWith(list, [
    ['A', 'better', 'B'],
    ['B', 'better', 'C'],
    ['A', 'equal', 'C'],
  ]);

  it('scores, zeta and one weak contradiction', () => {
    const pairs = resolvePairs(project);
    const scores = computeScores(list, pairs)!;
    expect(scores.rows.map((r) => [r.name, r.score])).toEqual([
      ['A', 1.5],
      ['B', 1],
      ['C', 0.5],
    ]);
    expect(round1(scores.rows[1].weight)).toBe(33.3);
    const inc = findInconsistencies(list, pairs);
    expect(inc.strict).toHaveLength(0);
    expect(inc.weak).toHaveLength(1);
    expect(inc.zeta).toBe(1);
  });
});

describe('Kendall maximum (spec 4.5)', () => {
  it.each([
    [2, 0],
    [3, 1],
    [4, 2],
    [5, 5],
    [30, 1120],
  ])('n=%i → %i', (n, max) => expect(maxCyclicTriads(n)).toBe(max));

  it('matches the score formula for a random tournament', () => {
    const list = items(...'ABCDEFGHIJK'.split(''));
    const random = seeded(11);
    const relations: [string, Answer, string][] = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) relations.push([list[i].id, random() < 0.5 ? 'better' : 'worse', list[j].id]);
    const pairs = resolvePairs(projectWith(list, relations));
    const n = list.length;
    const scores = computeScores(list, pairs)!;
    const d = (n * (n - 1) * (2 * n - 1)) / 12 - scores.rows.reduce((s, r) => s + r.score ** 2, 0) / 2;
    expect(findInconsistencies(list, pairs).d).toBe(d);
  });
});

describe('project operations', () => {
  it('runs a full survey with progress and undo', () => {
    let p = setItems(createProject('x', 'p', NOW), items('A', 'B', 'C'), seeded(5), NOW);
    expect(p.pending).toHaveLength(6);
    p = answerCurrent(p, 'better', NOW);
    expect(answeredCount(p.items, p.responses, true)).toBe(1);
    const asked = p.responses[0];
    p = undoLast(p, NOW);
    expect(p.responses).toHaveLength(0);
    expect(p.pending[0]).toMatchObject({ first: asked.first, second: asked.second });
    p = answerAll(p, (first, second) => (first < second ? 'better' : 'worse'));
    expect(answeredCount(p.items, p.responses, true)).toBe(6);
    expect(computeScores(p.items, effectivePairs(p))!.rows[0].name).toBe('A');
  });

  it('keeps answers when an item is added and asks only the new pairs', () => {
    let p = setItems(createProject('x', 'p', NOW), items('A', 'B'), seeded(5), NOW);
    p = answerAll(p, (first) => (first === 'A' ? 'better' : 'worse'));
    const change = previewItemsChange(p, items('A', 'B', 'C'));
    expect(change).toEqual({ removedResponses: 0, questionsBefore: 0, questionsAfter: 4 });
    p = setItems(p, items('A', 'B', 'C'), seeded(6), NOW);
    expect(p.responses).toHaveLength(2);
    expect(p.pending).toHaveLength(4);
    expect(p.pending.every((q) => q.first === 'C' || q.second === 'C')).toBe(true);
  });

  it('drops answers of a removed item', () => {
    let p = setItems(createProject('x', 'p', NOW), items('A', 'B', 'C'), seeded(5), NOW);
    p = answerAll(p, () => 'equal');
    expect(previewItemsChange(p, items('A', 'B')).removedResponses).toBe(4);
    p = setItems(p, items('A', 'B'), seeded(5), NOW);
    expect(p.responses).toHaveLength(2);
    expect(p.pending).toHaveLength(0);
  });

  it('switching reverse questions on adds the missing directions', () => {
    let p = setAskReverse(createProject('x', 'p', NOW), false, seeded(1), NOW);
    p = setItems(p, items('A', 'B', 'C'), seeded(1), NOW);
    expect(p.pending).toHaveLength(3);
    p = answerAll(p, () => 'equal');
    p = setAskReverse(p, true, seeded(2), NOW);
    expect(p.pending).toHaveLength(3);
    for (const q of p.pending) expect(p.responses.some((r) => r.first === q.second && r.second === q.first)).toBe(true);
  });

  it('re-comparison without reverse questions replaces the earlier answer', () => {
    let p = setAskReverse(createProject('x', 'p', NOW), false, seeded(1), NOW);
    p = setItems(p, items('A', 'B', 'C'), seeded(1), NOW);
    // A > B > C > A
    const cycle: Record<string, string> = { [pairKey('A', 'B')]: 'A', [pairKey('B', 'C')]: 'B', [pairKey('A', 'C')]: 'C' };
    p = answerAll(p, (f, s) => (cycle[pairKey(f, s)] === f ? 'better' : 'worse'));
    expect(findInconsistencies(p.items, effectivePairs(p)).strict).toHaveLength(1);
    p = startRecompare(p, seeded(4), NOW)!;
    expect(p.pending).toHaveLength(3);
    p = answerAll(p, (f, s) => (f < s ? 'better' : 'worse'));
    const pairs = effectivePairs(p);
    expect([...pairs.values()].every((s) => s.status === 'ok')).toBe(true);
    expect(findInconsistencies(p.items, pairs).strict).toHaveLength(0);
    expect(startRecompare(p, seeded(4), NOW)).toBeNull();
  });

  it('manual resolution settles a contradiction and is cleared by a new answer', () => {
    let p = setItems(createProject('x', 'p', NOW), items('A', 'B'), seeded(1), NOW);
    p = answerAll(p, () => 'better'); // A>B and B>A: contradiction
    expect(resolvePairs(p).get(pairKey('A', 'B'))!.status).toBe('conflict');
    p = resolveManually(p, 'B', 'A', 'worse', NOW);
    const state = resolvePairs(p).get(pairKey('A', 'B'))!;
    expect(state).toMatchObject({ status: 'ok', value: 'better', manual: true });
    expect(startRecompare(p, seeded(1), NOW, true)).toBeNull();
  });
});

describe('performance', () => {
  it('analyses 30 items quickly', () => {
    const list = items(...Array.from({ length: 30 }, (_, i) => `I${i}`));
    const random = seeded(2);
    const relations: [string, Answer, string][] = [];
    for (let i = 0; i < 30; i++)
      for (let j = i + 1; j < 30; j++) relations.push([list[i].id, (['better', 'equal', 'worse'] as Answer[])[Math.floor(random() * 3)], list[j].id]);
    const project = projectWith(list, relations);
    const start = performance.now();
    const pairs = effectivePairs(project);
    computeScores(list, pairs);
    const inc = findInconsistencies(list, pairs);
    recompareQueue(pairs, inc);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('parseBulkNames', () => {
  it('splits lines and spreadsheet cells, strips list markers', () => {
    const r = parseBulkNames('1. Скорость\n- Вес\t• Цена\r\n\n  Надёжность  ', []);
    expect(r.names).toEqual(['Скорость', 'Вес', 'Цена', 'Надёжность']);
  });

  it('skips duplicates of existing items and of earlier lines', () => {
    const r = parseBulkNames('Вес\nцена\nЦена', [{ id: '1', name: 'вес' }]);
    expect(r.names).toEqual(['цена']);
    expect(r.duplicates).toEqual(['Вес', 'Цена']);
  });

  it('respects the item limit', () => {
    const r = parseBulkNames('A\nB\nC', [{ id: '1', name: 'X' }], 3);
    expect(r.names).toEqual(['A', 'B']);
    expect(r.overLimit).toEqual(['C']);
  });
});

describe('resetAnswers', () => {
  it('clears answers and decisions and asks everything again', () => {
    let p = setItems(createProject('x', 'p', NOW), items('A', 'B', 'C'), seeded(1), NOW);
    p = answerAll(p, () => 'better');
    p = resolveManually(p, 'A', 'B', 'equal', NOW);
    p = resetAnswers(p, seeded(2), NOW);
    expect(p.responses).toHaveLength(0);
    expect(p.resolutions).toHaveLength(0);
    expect(p.pending).toHaveLength(6);
    expect(p.items).toHaveLength(3);
  });
});
