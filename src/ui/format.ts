import type { PairState } from '../core/analysis';
import { pairKey } from '../core/types';

export function formatNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** «Скорость > Стоимость > Вес > Скорость» for a strict cycle [x, y, z]. */
export function cycleText(cycle: string[], names: Map<string, string>): string {
  return [...cycle, cycle[0]].map((id) => names.get(id) ?? id).join(' > ');
}

/** «A > B» / «A = B» / «B > A» for a pair with an agreed value. */
export function relationText(state: PairState, names: Map<string, string>): string {
  const a = names.get(state.a) ?? state.a;
  const b = names.get(state.b) ?? state.b;
  if (state.value === 'better') return `${a} > ${b}`;
  if (state.value === 'worse') return `${b} > ${a}`;
  return `${a} = ${b}`;
}

/** Relations inside a triad, e.g. «A > B, B > C, A = C». */
export function triadText(triad: string[], pairs: Map<string, PairState>, names: Map<string, string>): string {
  const [x, y, z] = triad;
  return [pairKey(x, y), pairKey(y, z), pairKey(x, z)]
    .map((key) => pairs.get(key))
    .filter((s): s is PairState => !!s)
    .map((s) => relationText(s, names))
    .join(', ');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/** Russian plural: plural(5, ['сравнение', 'сравнения', 'сравнений']). */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
