import { effectivePairs, findInconsistencies, recompareQueue } from './analysis';
import { missingPairs, orderQuestions, shuffle } from './pairs';
import type { Random } from './pairs';
import { pairKey } from './types';
import type { Answer, Item, Project, Question } from './types';

/** Maximum number of items in a project (requirements). */
export const MAX_ITEMS = 30;
/** Pairs offered per re-comparison batch. */
export const RECOMPARE_BATCH = 10;

export function createProject(name: string, id: string, now: string): Project {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    settings: { askReverse: true },
    items: [],
    responses: [],
    resolutions: [],
    pending: [],
  };
}

/** Questions for everything required and not yet answered: new pairs first, then missing reverse directions. */
function rebuildPending(project: Project, random: Random): Question[] {
  const { pairs, reverseOnly } = missingPairs(project.items, project.responses, project.settings.askReverse);
  const main = orderQuestions(pairs, project.settings.askReverse, random);
  const reverse = shuffle(reverseOnly, random).map(([first, second]) => ({ first, second, round: 1 }));
  return [...main, ...reverse];
}

export interface ItemsChange {
  removedResponses: number;
  questionsBefore: number;
  questionsAfter: number;
}

/** What replacing the item list would do to existing answers, for the confirmation dialog. */
export function previewItemsChange(project: Project, items: readonly Item[], askReverse = project.settings.askReverse): ItemsChange {
  const ids = new Set(items.map((i) => i.id));
  const kept = project.responses.filter((r) => ids.has(r.first) && ids.has(r.second));
  const count = (list: readonly Item[], responses: Project['responses'], reverse: boolean) => {
    const { pairs, reverseOnly } = missingPairs(list, responses, reverse);
    return pairs.length * (reverse ? 2 : 1) + reverseOnly.length;
  };
  return {
    removedResponses: project.responses.length - kept.length,
    questionsBefore: count(project.items, project.responses, project.settings.askReverse),
    questionsAfter: count(items, kept, askReverse),
  };
}

export function setItems(project: Project, items: Item[], random: Random, now: string): Project {
  const ids = new Set(items.map((i) => i.id));
  const next: Project = {
    ...project,
    items,
    responses: project.responses.filter((r) => ids.has(r.first) && ids.has(r.second)),
    resolutions: project.resolutions.filter((r) => ids.has(r.a) && ids.has(r.b)),
    recompareAsked: undefined,
    updatedAt: now,
  };
  next.pending = rebuildPending(next, random);
  return next;
}

export function setAskReverse(project: Project, askReverse: boolean, random: Random, now: string): Project {
  const next: Project = { ...project, settings: { ...project.settings, askReverse }, updatedAt: now };
  next.pending = rebuildPending(next, random);
  return next;
}

export function renameProject(project: Project, name: string, now: string): Project {
  return { ...project, name, updatedAt: now };
}

/** Records the answer to the first pending question. */
export function answerCurrent(project: Project, answer: Answer, now: string): Project {
  const [question, ...rest] = project.pending;
  if (!question) return project;
  const key = pairKey(question.first, question.second);
  return {
    ...project,
    responses: [...project.responses, { ...question, answer, answeredAt: now }],
    resolutions: project.resolutions.filter((r) => pairKey(r.a, r.b) !== key),
    pending: rest,
    updatedAt: now,
  };
}

/** Takes back the last answer and asks that question again. */
export function undoLast(project: Project, now: string): Project {
  const last = project.responses[project.responses.length - 1];
  if (!last) return project;
  const question: Question = { first: last.first, second: last.second, round: last.round };
  return {
    ...project,
    responses: project.responses.slice(0, -1),
    pending: [question, ...project.pending],
    updatedAt: now,
  };
}

/**
 * Queues the next batch of disputed pairs for re-comparison (spec 4.6): both directions again
 * when askReverse is on, in priority order for the first pass.
 * Returns null when there is nothing left to re-compare.
 */
export function startRecompare(project: Project, random: Random, now: string, restart = false): Project | null {
  const pairs = effectivePairs(project);
  const asked = restart ? [] : (project.recompareAsked ?? []);
  const candidates = recompareQueue(pairs, findInconsistencies(project.items, pairs), asked).slice(0, RECOMPARE_BATCH);
  if (candidates.length === 0) return null;
  const round = Math.max(1, ...project.responses.map((r) => r.round)) + 1;
  const questions = orderQuestions(
    candidates.map((c) => [c.a, c.b] as [string, string]),
    project.settings.askReverse,
    random,
    round,
    true,
  );
  return {
    ...project,
    pending: [...questions, ...project.pending],
    recompareAsked: [...asked, ...candidates.map((c) => c.key)],
    updatedAt: now,
  };
}

/** Sets the value of a pair by hand; `value` is `a` relative to `b`. */
export function resolveManually(project: Project, a: string, b: string, value: Answer, now: string): Project {
  const key = pairKey(a, b);
  return {
    ...project,
    resolutions: [...project.resolutions.filter((r) => pairKey(r.a, r.b) !== key), { a, b, value, by: 'manual' }],
    pending: project.pending.filter((q) => pairKey(q.first, q.second) !== key),
    updatedAt: now,
  };
}

export function markExported(project: Project, now: string): Project {
  return { ...project, lastExportedAt: now };
}

/** True when the project changed after the last time it was saved to a file. */
export function needsFileSave(project: Project): boolean {
  if (project.items.length === 0) return false;
  return !project.lastExportedAt || project.lastExportedAt < project.updatedAt;
}

export interface BulkNames {
  /** Names to add, in input order. */
  names: string[];
  /** Names skipped because they repeat an existing item or an earlier line. */
  duplicates: string[];
  /** Names that did not fit under MAX_ITEMS. */
  overLimit: string[];
}

/**
 * Splits pasted text into item names: one per line or per tab-separated cell (rows and columns
 * copied from a spreadsheet), without list markers such as «1.», «-» or «•».
 */
export function parseBulkNames(text: string, existing: readonly Item[], max = MAX_ITEMS): BulkNames {
  const seen = new Set(existing.map((i) => normalizeName(i.name)));
  const result: BulkNames = { names: [], duplicates: [], overLimit: [] };
  for (const raw of text.split(/[\r\n\t]+/)) {
    const name = raw.replace(/^\s*(?:\d+[.)]|[-–—•*·])\s+/, '').trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) {
      result.duplicates.push(name);
      continue;
    }
    seen.add(key);
    if (existing.length + result.names.length >= max) result.overLimit.push(name);
    else result.names.push(name);
  }
  return result;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}
