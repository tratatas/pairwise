import { useState } from 'react';
import { computeScores, effectivePairs, findInconsistencies } from '../core/analysis';
import type { Project } from '../core/types';
import { navigate } from './App';
import { formatNumber, formatPercent } from './format';

interface Props {
  project: Project;
  saveFile: () => void;
}

const CELL_CLASS: Record<string, string> = { '1': 'win', '0.5': 'tie', '0': 'loss' };

export function ResultsScreen({ project, saveFile }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pairs = effectivePairs(project);
  const scores = computeScores(project.items, pairs);

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

  return (
    <>
      <div className="row wrap">
        <button onClick={saveFile}>Сохранить файл проекта</button>
        <button className="secondary" onClick={exportPdf} disabled={busy}>
          {busy ? 'Формирую PDF…' : 'Экспорт в PDF'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <p className="muted">
        ζ Кендалла: <strong>{formatNumber(inc.zeta, 3)}</strong> · строгих циклов: {inc.d} · нестрогих противоречий: {inc.weak.length}
        {inc.d + inc.weak.length > 0 && (
          <>
            {' '}
            · <button className="link inline" onClick={() => navigate(project.id, 'check')}>подробнее</button>
          </>
        )}
      </p>

      <table className="results">
        <thead>
          <tr>
            <th>Место</th>
            <th>Элемент</th>
            <th className="num">Очки</th>
            <th className="num">Вес</th>
          </tr>
        </thead>
        <tbody>
          {scores.rows.map((r) => (
            <tr key={r.id}>
              <td className="center">{r.place}</td>
              <td>
                {r.name}
                <div className="bar" style={{ width: `${r.weight * 100}%` }} />
              </td>
              <td className="num">{formatNumber(r.score)}</td>
              <td className="num">{formatPercent(r.weight)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Матрица</h2>
      <p className="muted small-text">Строка относительно столбца: 1 — важнее, 0,5 — равны, 0 — менее важен.</p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {project.items.map((item, i) => (
                <th key={item.id} title={item.name}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {project.items.map((item, i) => (
              <tr key={item.id}>
                <th className="row-head" title={item.name}>
                  {i + 1}. {item.name}
                </th>
                {scores.matrix[i].map((v, j) => (
                  <td key={j} className={v === null ? 'diag' : CELL_CLASS[String(v)]}>
                    {v === null ? '' : formatNumber(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
