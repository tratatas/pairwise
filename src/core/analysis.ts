import { answerValue, mirror, pairKey } from './types';
import type { Answer, Item, Project } from './types';

export type PairStatus = 'missing' | 'ok' | 'conflict';

export interface PairState {
  /** Item ids in item-list order. */
  a: string;
  b: string;
  status: PairStatus;
  /** Value of `a` relative to `b` when status is 'ok'. */
  value?: Answer;
  /** Latest answer to (a, b), as given. */
  ab?: Answer;
  /** Latest answer to (b, a), as given. */
  ba?: Answer;
  manual: boolean;
}

/**
 * Value of every pair from the answer history and manual resolutions (spec 4.3).
 * Only the latest round in which a pair was asked counts, so a re-comparison replaces earlier answers.
 */
export function resolvePairs(project: Pick<Project, 'items' | 'responses' | 'resolutions'>): Map<string, PairState> {
  const lastRound = new Map<string, number>();
  for (const r of project.responses) {
    const key = pairKey(r.first, r.second);
    lastRound.set(key, Math.max(lastRound.get(key) ?? 0, r.round));
  }
  const latest = new Map<string, Answer>();
  for (const r of project.responses) {
    if (r.round === lastRound.get(pairKey(r.first, r.second))) latest.set(`${r.first}>${r.second}`, r.answer);
  }
  const manual = new Map(project.resolutions.map((r) => [pairKey(r.a, r.b), r]));

  const result = new Map<string, PairState>();
  const ids = project.items.map((i) => i.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const key = pairKey(a, b);
      const ab = latest.get(`${a}>${b}`);
      const ba = latest.get(`${b}>${a}`);
      const resolution = manual.get(key);
      const state: PairState = { a, b, ab, ba, status: 'missing', manual: false };
      if (resolution) {
        state.status = 'ok';
        state.value = resolution.a === a ? resolution.value : mirror(resolution.value);
        state.manual = true;
      } else if (ab && ba) {
        if (ab === mirror(ba)) {
          state.status = 'ok';
          state.value = ab;
        } else {
          state.status = 'conflict';
        }
      } else if (ab || ba) {
        state.status = 'ok';
        state.value = ab ?? mirror(ba!);
      }
      result.set(key, state);
    }
  }
  return result;
}

/**
 * Pair values to use for results. A pair with only one direction answered while the other
 * direction is still pending counts as missing.
 */
export function effectivePairs(project: Project): Map<string, PairState> {
  const pairs = resolvePairs(project);
  const pendingKeys = new Set(project.pending.map((q) => pairKey(q.first, q.second)));
  for (const [key, state] of pairs) {
    if (state.status === 'ok' && !state.manual && pendingKeys.has(key)) state.status = 'missing';
  }
  return pairs;
}

export interface ScoreRow {
  id: string;
  name: string;
  score: number;
  weight: number;
  place: number;
}

export interface Scores {
  rows: ScoreRow[];
  /** matrix[i][j]: value of items[i] against items[j]; null on the diagonal. */
  matrix: (number | null)[][];
}

/** Scores, weights and places (spec 4.4). Returns null while any pair lacks an agreed value. */
export function computeScores(items: readonly Item[], pairs: Map<string, PairState>): Scores | null {
  const n = items.length;
  const matrix: (number | null)[][] = items.map(() => items.map(() => null));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const state = pairs.get(pairKey(items[i].id, items[j].id));
      if (!state || state.status !== 'ok' || !state.value) return null;
      const v = answerValue[state.a === items[i].id ? state.value : mirror(state.value)];
      matrix[i][j] = v;
      matrix[j][i] = 1 - v;
    }
  }
  const total = (n * (n - 1)) / 2;
  const rows: ScoreRow[] = items.map((item, i) => {
    const score = matrix[i].reduce<number>((sum, v) => sum + (v ?? 0), 0);
    return { id: item.id, name: item.name, score, weight: total > 0 ? score / total : 0, place: 0 };
  });
  const sorted = [...rows].sort((x, y) => y.score - x.score);
  sorted.forEach((row, index) => {
    const prev = sorted[index - 1];
    row.place = prev && prev.score === row.score ? prev.place : index + 1;
  });
  return { rows: sorted, matrix };
}

export interface Inconsistencies {
  /** Strict cycles, each as [x, y, z] meaning x > y > z > x. */
  strict: string[][];
  /** Triads with ties that admit no ranking, e.g. A > B, B > C, A = C. */
  weak: string[][];
  d: number;
  dMax: number;
  zeta: number;
  /** Number of inconsistent triads each pair (by pairKey) takes part in. */
  pairCounts: Map<string, number>;
}

export function maxCyclicTriads(n: number): number {
  if (n < 3) return 0;
  return n % 2 === 1 ? (n ** 3 - n) / 24 : (n ** 3 - 4 * n) / 24;
}

const RANKINGS: number[][] = [];
for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) RANKINGS.push([x, y, z]);

/** True if some ranking with ties reproduces all three values (v[i][j] of member i vs j). */
function isTransitive(v: (i: number, j: number) => number): boolean {
  return RANKINGS.some((rank) =>
    [
      [0, 1],
      [0, 2],
      [1, 2],
    ].every(([i, j]) => {
      const value = v(i, j);
      if (value === 1) return rank[i] < rank[j];
      if (value === 0) return rank[i] > rank[j];
      return rank[i] === rank[j];
    }),
  );
}

/** Cycles, weak contradictions and Kendall's coefficient of consistence (spec 4.5). */
export function findInconsistencies(items: readonly Item[], pairs: Map<string, PairState>): Inconsistencies {
  const n = items.length;
  const value = new Map<string, number>();
  for (const state of pairs.values()) {
    if (state.status !== 'ok' || !state.value) continue;
    value.set(`${state.a}>${state.b}`, answerValue[state.value]);
    value.set(`${state.b}>${state.a}`, 1 - answerValue[state.value]);
  }
  const strict: string[][] = [];
  const weak: string[][] = [];
  const pairCounts = new Map<string, number>();
  const bump = (a: string, b: string) => pairCounts.set(pairKey(a, b), (pairCounts.get(pairKey(a, b)) ?? 0) + 1);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const t = [items[i].id, items[j].id, items[k].id];
        const v = (x: number, y: number) => value.get(`${t[x]}>${t[y]}`);
        if (v(0, 1) === undefined || v(0, 2) === undefined || v(1, 2) === undefined) continue;
        if (isTransitive((x, y) => v(x, y)!)) continue;
        const hasTie = [v(0, 1), v(0, 2), v(1, 2)].includes(0.5);
        if (hasTie) {
          weak.push(t);
        } else {
          // Orient the cycle so that each member beats the next one.
          strict.push(v(0, 1) === 1 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]);
        }
        bump(t[0], t[1]);
        bump(t[0], t[2]);
        bump(t[1], t[2]);
      }
    }
  }
  const dMax = maxCyclicTriads(n);
  const d = strict.length;
  return { strict, weak, d, dMax, zeta: dMax > 0 ? 1 - d / dMax : 1, pairCounts };
}

export interface RecompareCandidate {
  key: string;
  a: string;
  b: string;
  reason: 'conflict' | 'cycle';
  cycles: number;
}

/**
 * Pairs to re-compare (spec 4.6): direct contradictions first, then pairs by the number of
 * inconsistent triads they take part in. Pairs already re-asked in this session are skipped.
 */
export function recompareQueue(
  pairs: Map<string, PairState>,
  inconsistencies: Inconsistencies,
  alreadyAsked: readonly string[] = [],
): RecompareCandidate[] {
  const asked = new Set(alreadyAsked);
  const conflicts: RecompareCandidate[] = [];
  const cycles: RecompareCandidate[] = [];
  for (const [key, state] of pairs) {
    if (asked.has(key)) continue;
    const count = inconsistencies.pairCounts.get(key) ?? 0;
    if (state.status === 'conflict') conflicts.push({ key, a: state.a, b: state.b, reason: 'conflict', cycles: count });
    else if (count > 0) cycles.push({ key, a: state.a, b: state.b, reason: 'cycle', cycles: count });
  }
  cycles.sort((x, y) => y.cycles - x.cycles);
  return [...conflicts, ...cycles];
}
