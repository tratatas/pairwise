import type { Item, Question, Response } from './types';

export type Random = () => number;

/** Number of questions for n items (spec 4.1). */
export function comparisonCount(n: number, askReverse: boolean): number {
  if (n < 2) return 0;
  const pairs = (n * (n - 1)) / 2;
  return askReverse ? pairs * 2 : pairs;
}

export function shuffle<T>(list: readonly T[], random: Random): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function allPairs(ids: readonly string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  }
  return pairs;
}

/**
 * Orders a set of pairs as questions (spec 4.2): a shuffled first pass with random orientation,
 * then, if askReverse, the reversed questions in a new random order. The last question of the
 * first pass and the first of the second never belong to the same pair.
 */
export function orderQuestions(
  pairs: readonly [string, string][],
  askReverse: boolean,
  random: Random,
  round = 1,
  keepOrder = false,
): Question[] {
  const first: Question[] = (keepOrder ? [...pairs] : shuffle(pairs, random)).map(([a, b]) =>
    random() < 0.5 ? { first: a, second: b, round } : { first: b, second: a, round },
  );
  if (!askReverse) return first;
  const second = shuffle(
    first.map((q) => ({ first: q.second, second: q.first, round })),
    random,
  );
  const last = first[first.length - 1];
  if (second.length > 1 && last && second[0].first === last.second && second[0].second === last.first) {
    [second[0], second[1]] = [second[1], second[0]];
  }
  return [...first, ...second];
}

/** Full question order for a fresh survey. */
export function buildQuestionOrder(items: readonly Item[], askReverse: boolean, random: Random): Question[] {
  return orderQuestions(
    allPairs(items.map((i) => i.id)),
    askReverse,
    random,
  );
}

/** Directions that are required by the settings and already answered. */
function answeredDirections(responses: readonly Response[]): Set<string> {
  return new Set(responses.map((r) => `${r.first}>${r.second}`));
}

/**
 * Questions still required by the current items and settings and not yet answered,
 * as pairs with the direction that must be asked. Used after items or settings change.
 */
export function missingPairs(
  items: readonly Item[],
  responses: readonly Response[],
  askReverse: boolean,
): { pairs: [string, string][]; reverseOnly: [string, string][] } {
  const done = answeredDirections(responses);
  const pairs: [string, string][] = [];
  const reverseOnly: [string, string][] = [];
  for (const [a, b] of allPairs(items.map((i) => i.id))) {
    const ab = done.has(`${a}>${b}`);
    const ba = done.has(`${b}>${a}`);
    if (!ab && !ba) pairs.push([a, b]);
    else if (askReverse && !(ab && ba)) reverseOnly.push(ab ? [b, a] : [a, b]);
  }
  return { pairs, reverseOnly };
}

/** Number of required questions already answered (spec 4.1 progress). */
export function answeredCount(items: readonly Item[], responses: readonly Response[], askReverse: boolean): number {
  const done = answeredDirections(responses);
  let count = 0;
  for (const [a, b] of allPairs(items.map((i) => i.id))) {
    const ab = done.has(`${a}>${b}`);
    const ba = done.has(`${b}>${a}`);
    if (askReverse) count += Number(ab) + Number(ba);
    else count += Number(ab || ba);
  }
  return count;
}
