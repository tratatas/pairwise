import { effectivePairs, findInconsistencies } from '../core/analysis';
import type { PairState } from '../core/analysis';
import { RECOMPARE_BATCH, resolveManually, startRecompare } from '../core/project';
import type { Answer, Project } from '../core/types';
import { navigate, now } from './App';
import { cycleText, formatNumber, triadText } from './format';

interface Props {
  project: Project;
  update: (p: Project) => void;
}

const LIST_LIMIT = 50;

export function CheckScreen({ project, update }: Props) {
  const pairs = effectivePairs(project);
  const states = [...pairs.values()];
  const conflicts = states.filter((s) => s.status === 'conflict');
  const missing = states.filter((s) => s.status === 'missing').length;
  const inc = findInconsistencies(project.items, pairs);
  const names = new Map(project.items.map((i) => [i.id, i.name]));
  const name = (id: string) => names.get(id) ?? id;
  const problems = conflicts.length + inc.strict.length + inc.weak.length;

  const recompare = (restart: boolean) => {
    const next = startRecompare(project, Math.random, now(), restart);
    if (!next) return;
    update(next);
    navigate(project.id, 'compare');
  };
  const canContinue = startRecompare(project, () => 0, now()) !== null;

  const resolve = (state: PairState, value: Answer) => update(resolveManually(project, state.a, state.b, value, now()));

  if (project.items.length < 2) return <p>Добавьте хотя бы два элемента.</p>;

  return (
    <>
      {missing > 0 && (
        <div className="notice">
          <p>
            Опрос не завершён: без ответа {missing} {missing === 1 ? 'пара' : 'пар(ы)'}. Проверка ниже учитывает только отвеченные пары.
          </p>
          <button onClick={() => navigate(project.id, 'compare')}>Продолжить сравнение</button>
        </div>
      )}

      <div className="stats">
        <div>
          <strong>{conflicts.length}</strong>
          <span>прямых противоречий</span>
        </div>
        <div>
          <strong>{inc.strict.length}</strong>
          <span>строгих циклов</span>
        </div>
        <div>
          <strong>{inc.weak.length}</strong>
          <span>нестрогих противоречий</span>
        </div>
        <div>
          <strong>{formatNumber(inc.zeta, 3)}</strong>
          <span>ζ Кендалла</span>
        </div>
      </div>
      <p className="muted small-text">
        ζ = 1 − d / d<sub>max</sub>: доля возможных строгих циклов, которых нет; 1 — полная согласованность. Kendall &amp; Babington Smith, 1940.
      </p>

      {problems === 0 && missing === 0 && (
        <div className="notice ok">
          <p>Противоречий нет.</p>
          <button onClick={() => navigate(project.id, 'results')}>К результатам</button>
        </div>
      )}

      {problems > 0 && (
        <div className="row wrap">
          {canContinue ? (
            <button onClick={() => recompare(false)}>Повторно сравнить спорные пары</button>
          ) : (
            <button onClick={() => recompare(true)}>Сравнить спорные пары ещё раз</button>
          )}
          {conflicts.length === 0 && missing === 0 && (
            <button className="secondary" onClick={() => navigate(project.id, 'results')}>
              Принять и перейти к результатам
            </button>
          )}
        </div>
      )}
      {problems > 0 && (
        <p className="muted small-text">
          За один раз предлагается до {RECOMPARE_BATCH} пар: сначала прямые противоречия, затем пары, входящие в наибольшее число
          циклов. После ответов проверка пересчитывается.
        </p>
      )}

      {conflicts.length > 0 && (
        <section>
          <h2>Прямые противоречия</h2>
          <p className="muted small-text">Ответы на A–B и B–A не совпадают. Пока они есть, результаты не рассчитываются.</p>
          <ul className="problems">
            {conflicts.map((s) => (
              <li key={s.a + s.b}>
                <div>
                  <strong>
                    {name(s.a)} — {name(s.b)}
                  </strong>
                  <div className="muted small-text">
                    Ответы: «{name(s.a)} относительно {name(s.b)}»: {label(s.ab)}; «{name(s.b)} относительно {name(s.a)}»: {label(s.ba)}
                  </div>
                </div>
                <div className="row wrap">
                  <span className="muted small-text">Решить вручную:</span>
                  <button className="small secondary" onClick={() => resolve(s, 'better')}>
                    {name(s.a)} важнее
                  </button>
                  <button className="small secondary" onClick={() => resolve(s, 'equal')}>
                    Равны
                  </button>
                  <button className="small secondary" onClick={() => resolve(s, 'worse')}>
                    {name(s.b)} важнее
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inc.strict.length > 0 && (
        <section>
          <h2>Строгие циклы</h2>
          <ul className="problems">
            {inc.strict.slice(0, LIST_LIMIT).map((c) => (
              <li key={c.join()}>{cycleText(c, names)}</li>
            ))}
          </ul>
          {inc.strict.length > LIST_LIMIT && <p className="muted">и ещё {inc.strict.length - LIST_LIMIT}</p>}
        </section>
      )}

      {inc.weak.length > 0 && (
        <section>
          <h2>Нестрогие противоречия</h2>
          <p className="muted small-text">Тройки с «равно», которые нельзя упорядочить. В ζ не входят.</p>
          <ul className="problems">
            {inc.weak.slice(0, LIST_LIMIT).map((t) => (
              <li key={t.join()}>{triadText(t, pairs, names)}</li>
            ))}
          </ul>
          {inc.weak.length > LIST_LIMIT && <p className="muted">и ещё {inc.weak.length - LIST_LIMIT}</p>}
        </section>
      )}
    </>
  );
}

function label(answer: Answer | undefined): string {
  return answer === 'better' ? 'важнее' : answer === 'worse' ? 'менее важен' : answer === 'equal' ? 'равны' : 'нет ответа';
}
