/** Rating of the first item of a question relative to the second one. */
export type Answer = 'better' | 'equal' | 'worse';

export interface Item {
  id: string;
  name: string;
  note?: string;
}

/** One question shown to the user: is `first` more important than `second`? */
export interface Question {
  first: string;
  second: string;
  round: number;
}

export interface Response extends Question {
  answer: Answer;
  answeredAt: string;
}

export interface Settings {
  /** Ask both directions of every pair (A–B and B–A). */
  askReverse: boolean;
}

export interface Resolution {
  a: string;
  b: string;
  /** Value of `a` relative to `b`. */
  value: Answer;
  by: 'recompare' | 'manual';
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastExportedAt?: string;
  settings: Settings;
  items: Item[];
  /** Full answer history, in the order answers were given. */
  responses: Response[];
  resolutions: Resolution[];
  /** Questions still to be asked, in order. */
  pending: Question[];
  /** Pair keys already re-asked during the current re-comparison session. */
  recompareAsked?: string[];
}

/** Matrix value of a row item against a column item. */
export const answerValue: Record<Answer, number> = { better: 1, equal: 0.5, worse: 0 };

export function mirror(answer: Answer): Answer {
  return answer === 'better' ? 'worse' : answer === 'worse' ? 'better' : 'equal';
}

/** Order-independent key of a pair of item ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
