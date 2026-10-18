import { effectivePairs, findInconsistencies } from '../core/analysis';
import type { PairState } from '../core/analysis';
import { RECOMPARE_BATCH, resolveManually, startRecompare } from '../core/project';
import type { Answer, Project } from '../core/types';
import { navigate, now } from './App';
import { cycleText, formatPercent, plural, triadText } from './format';

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
  const triads = inc.strict.length + inc.weak.length;

  const recompare = (restart: boolean) => {
    const next = startRecompare(project, Math.random, now(), restart);
    if (!next) return;
    update(next);
    navigate(project.id, 'compare');
  };
  const canContinue = startRecompare(project, () => 0, now()) !== null;
  const resolve = (state: PairState, value: Answer) => update(resolveManually(project, state.a, state.b, value, now()));

  if (project.items.length < 2) return <p>Добавьте хотя бы два элемента.</p>;

  const status =
    missing > 0
      ? { kind: 'notice', title: 'Сравнение не завершено', text: `Без ответа ${missing} ${plural(missing, ['пара', 'пары', 'пар'])}.` }
      : conflicts.length > 0
        ? {
            kind: 'error',
            title: `${conflicts.length} ${plural(conflicts.length, ['пара требует', 'пары требуют', 'пар требуют'])} решения`,
            text: 'Ответы на прямой и обратный вопрос не совпали. Пока это так, результат не рассчитывается.',
          }
        : triads > 0
          ? {
              kind: 'notice',
              title: 'Результат готов, но есть несогласованные ответы',
              text: 'Некоторые ответы нельзя выстроить в один порядок. Места этих элементов в рейтинге условны. Исправлять не обязательно.',
            }
          : { kind: 'ok', title: 'Ответы согласованы', text: 'Противоречий нет, результат надёжен.' };

  return (
    <>
      <div className={`status ${status.kind}`}>
        <strong>{status.title}</strong>
        <p>{status.text}</p>
        <div className="row wrap">
          {missing > 0 && <button onClick={() => navigate(project.id, 'compare')}>Продолжить сравнение</button>}
          {missing === 0 && conflicts.length === 0 && (
            <button onClick={() => navigate(project.id, 'results')}>К результатам</button>
          )}
          {missing === 0 && conflicts.length + triads > 0 && (
            <button className={conflicts.length > 0 ? '' : 'secondary'} onClick={() => recompare(!canContinue)}>
              {conflicts.length > 0 ? 'Сравнить спорные пары ещё раз' : 'Уточнить спорные пары'}
            </button>
          )}
        </div>
      </div>

      <div className="consistency" title="Коэффициент согласованности Кендалла ζ (Kendall & Babington Smith, 1940)">
        <span>Согласованность ответов</span>
        <strong>{formatPercent(inc.zeta)}</strong>
        <div className="meter">
          <div style={{ width: `${inc.zeta * 100}%` }} />
        </div>
        <small className="muted">
          100% — все ответы выстраиваются в один порядок. Считается по числу замкнутых кругов среди возможных (коэффициент
          Кендалла).
        </small>
      </div>

      {conflicts.length > 0 && (
        <section>
          <h2>Прямые противоречия</h2>
          <p className="muted small-text">Сравните пару ещё раз кнопкой выше или выберите ответ здесь.</p>
          <ul className="problems">
            {conflicts.map((s) => (
              <li key={s.a + s.b}>
                <div className="small-text">
                  Вы ответили: важнее «{s.ab === 'better' ? name(s.a) : s.ab === 'worse' ? name(s.b) : 'равны'}», а при обратном
                  вопросе — «{s.ba === 'better' ? name(s.b) : s.ba === 'worse' ? name(s.a) : 'равны'}».
                </div>
                <div className="choice">
                  <button className="small secondary" onClick={() => resolve(s, 'better')}>
                    {name(s.a)}
                  </button>
                  <button className="small secondary" onClick={() => resolve(s, 'equal')}>
                    Равны
                  </button>
                  <button className="small secondary" onClick={() => resolve(s, 'worse')}>
                    {name(s.b)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {triads > 0 && (
        <details className="triads">
          <summary>
            Несогласованные тройки: {triads}
            <span className="muted small-text"> — что это?</span>
          </summary>
          <p className="muted small-text">
            Например: «Скорость важнее Стоимости, Стоимость важнее Веса, но Вес важнее Скорости». Такие ответы замыкаются в круг,
            и их нельзя расставить по порядку. Кнопка «Уточнить спорные пары» предложит до {RECOMPARE_BATCH} пар, которые чаще
            всего входят в такие круги.
          </p>
          <ul className="problems">
            {inc.strict.slice(0, LIST_LIMIT).map((c) => (
              <li key={'s' + c.join()}>{cycleText(c, names)}</li>
            ))}
            {inc.weak.slice(0, Math.max(0, LIST_LIMIT - inc.strict.length)).map((t) => (
              <li key={'w' + t.join()}>{triadText(t, pairs, names)}</li>
            ))}
          </ul>
          {triads > LIST_LIMIT && <p className="muted">и ещё {triads - LIST_LIMIT}</p>}
        </details>
      )}
    </>
  );
}
