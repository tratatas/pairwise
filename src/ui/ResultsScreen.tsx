import { useMemo, useState } from 'react';
import { computeScores, effectivePairs, findInconsistencies } from '../core/analysis';
import type { Project } from '../core/types';
import { navigate } from './App';
import { ResetAnswers } from './ItemsScreen';
import { formatNumber, formatPercent } from './format';

interface Props {
  project: Project;
  saveFile: () => void;
  update: (p: Project) => void;
}

const CELL_CLASS: Record<string, string> = { '1': 'win', '0.5': 'tie', '0': 'loss' };

type SortKey = 'name' | 'score' | 'weight';
interface Sort {
  key: SortKey;
  desc: boolean;
}

export function ResultsScreen({ project, saveFile, update }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'score', desc: true });
  const pairs = useMemo(() => effectivePairs(project), [project]);
  const scores = useMemo(() => computeScores(project.items, pairs), [project.items, pairs]);

  if (project.items.length < 2) return <p>Добавьте хотя бы два элемента.</p>;
  if (!scores) {
    const states = [...pairs.values()];
    const conflicts = states.filter((s) => s.status === 'conflict').length;
    const missing = states.filter((s) => s.status === 'missing').length;
    return (
      <div className="notice">
        <p>Результаты пока недоступны.</p>
        {missing > 0 && <p>Нет ответа по {missing} парам.</p>}
        {conflicts > 0 && <p>Прямых противоречий: {conflicts}. Их нужно разрешить на экране «Проверка».</p>}
        <div className="row wrap">
          {missing > 0 && <button onClick={() => navigate(project.id, 'compare')}>К сравнению</button>}
          {conflicts > 0 && <button onClick={() => navigate(project.id, 'check')}>К проверке</button>}
        </div>
      </div>
    );
  }

  const inc = findInconsistencies(project.items, pairs);
  const index = new Map(project.items.map((item, i) => [item.id, i]));
  const rowById = new Map(scores.rows.map((r) => [r.id, r]));
  const order = [...project.items]
    .map((item) => rowById.get(item.id)!)
    .sort((x, y) => {
      const diff =
        sort.key === 'name' ? x.name.localeCompare(y.name, 'ru') : sort.key === 'score' ? x.score - y.score : x.weight - y.weight;
      const tie = diff === 0 ? x.name.localeCompare(y.name, 'ru') : 0;
      return (sort.desc ? -diff : diff) || tie;
    });
  const leader = scores.rows[0];
  const sharedLead = scores.rows.filter((r) => r.place === 1).length > 1;

  const exportPdf = async () => {
    setBusy(true);
    setError('');
    try {
      const { exportPdf: run } = await import('../pdf/exportPdf');
      await run(project, pairs, scores, inc);
    } catch (err) {
      console.error(err);
      setError('Не удалось сформировать PDF.');
    } finally {
      setBusy(false);
    }
  };

  const sortButton = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <button
        className={active ? 'sort active' : 'sort'}
        onClick={() => setSort({ key, desc: active ? !sort.desc : key !== 'name' })}
        title="Сортировать"
      >
        {label}
        <span aria-hidden="true">{active ? (sort.desc ? ' ▼' : ' ▲') : ' ↕'}</span>
      </button>
    );
  };
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none');

  return (
    <>
      <div className="summary">
        <div>
          <span className="muted small-text">{sharedLead ? 'Лидеры' : 'Лидер'}</span>
          <strong>
            {scores.rows
              .filter((r) => r.place === 1)
              .map((r) => r.name)
              .join(', ')}
          </strong>
          <span className="muted small-text">вес {formatPercent(leader.weight)}</span>
        </div>
        <div>
          <span className="muted small-text">Согласованность</span>
          <strong>{formatPercent(inc.zeta)}</strong>
          {inc.d + inc.weak.length > 0 && (
            <button className="link inline small-text" onClick={() => navigate(project.id, 'check')}>
              несогласованных троек: {inc.d + inc.weak.length}
            </button>
          )}
        </div>
      </div>

      <p className="muted small-text">
        Клетка показывает, как элемент строки соотносится с элементом столбца: 1 — важнее, 0,5 — равны, 0 — менее важен. Очки —
        сумма по строке, вес — доля очков от общего числа. Нажмите на заголовок, чтобы отсортировать.
      </p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="corner" aria-sort={ariaSort('name')}>
                {sortButton('name', 'Элемент')}
              </th>
              {order.map((r) => (
                <th key={r.id} className="col-head" title={r.name}>
                  <span>{r.name}</span>
                </th>
              ))}
              <th className="num-head" aria-sort={ariaSort('score')}>
                {sortButton('score', 'Очки')}
              </th>
              <th className="num-head" aria-sort={ariaSort('weight')}>
                {sortButton('weight', 'Вес')}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.map((row) => {
              const i = index.get(row.id)!;
              return (
                <tr key={row.id}>
                  <th className="row-head" title={row.name}>
                    {row.name}
                  </th>
                  {order.map((col) => {
                    const v = scores.matrix[i][index.get(col.id)!];
                    return (
                      <td key={col.id} className={v === null ? 'diag' : CELL_CLASS[String(v)]}>
                        {v === null ? '' : formatNumber(v)}
                      </td>
                    );
                  })}
                  <td className="num">{formatNumber(row.score)}</td>
                  <td className="num weight">
                    {formatPercent(row.weight)}
                    <div className="bar" style={{ width: `${row.weight * 100}%` }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row wrap actions">
        <button onClick={exportPdf} disabled={busy}>
          {busy ? 'Формирую PDF…' : 'Экспорт в PDF'}
        </button>
        <button className="secondary" onClick={saveFile}>
          Сохранить файл проекта
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <ResetAnswers project={project} update={update} />
    </>
  );
}
