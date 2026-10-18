import { useEffect, useRef } from 'react';
import { answeredCount, comparisonCount } from '../core/pairs';
import { answerCurrent, undoLast } from '../core/project';
import type { Answer, Project } from '../core/types';
import { navigate, now } from './App';

interface Props {
  project: Project;
  update: (p: Project) => void;
}

export function CompareScreen({ project, update }: Props) {
  const question = project.pending[0];
  const items = new Map(project.items.map((i) => [i.id, i]));
  const total = comparisonCount(project.items.length, project.settings.askReverse);
  const done = answeredCount(project.items, project.responses, project.settings.askReverse);
  const recomparing = question !== undefined && question.round > 1;
  const recompareLeft = project.pending.filter((q) => q.round > 1).length;

  const answer = (value: Answer) => {
    if (!question) return;
    const next = answerCurrent(project, value, now());
    update(next);
    if (next.pending.length === 0) navigate(project.id, 'check');
  };

  // Keyboard on a laptop: ← first more important, ↓ or space equal, → second more important.
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
      const map: Record<string, Answer> = { ArrowLeft: 'better', ArrowDown: 'equal', ' ': 'equal', ArrowRight: 'worse' };
      const value = map[e.key];
      if (value) {
        e.preventDefault();
        answerRef.current(value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (project.items.length < 2) {
    return (
      <>
        <p>Для сравнения нужно хотя бы два элемента.</p>
        <button onClick={() => navigate(project.id, 'items')}>К элементам</button>
      </>
    );
  }

  if (!question) {
    return (
      <>
        <p>Все вопросы отвечены: {done} из {total}.</p>
        <button className="wide" onClick={() => navigate(project.id, 'check')}>
          К проверке противоречий
        </button>
        {project.responses.length > 0 && (
          <button className="wide secondary" onClick={() => update(undoLast(project, now()))}>
            ← Изменить последний ответ
          </button>
        )}
      </>
    );
  }

  const first = items.get(question.first) ?? { id: question.first, name: '?' };
  const second = items.get(question.second) ?? { id: question.second, name: '?' };
  const progress = recomparing ? null : total > 0 ? done / total : 0;

  return (
    <section className="compare">
      {recomparing ? (
        <p className="muted">Повторное сравнение спорных пар: осталось {recompareLeft}</p>
      ) : (
        <>
          <p className="muted">
            Сравнение {Math.min(done + 1, total)} из {total}
          </p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <div style={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
        </>
      )}

      <h2 className="question">Что важнее?</h2>
      <div className="answers">
        <button className="answer" onClick={() => answer('better')}>
          <span className="answer-name">{first.name}</span>
          {first.note && <span className="answer-note">{first.note}</span>}
        </button>
        <button className="answer equal" onClick={() => answer('equal')}>
          Равны
        </button>
        <button className="answer" onClick={() => answer('worse')}>
          <span className="answer-name">{second.name}</span>
          {second.note && <span className="answer-note">{second.note}</span>}
        </button>
      </div>

      <div className="row between">
        <button className="link" disabled={project.responses.length === 0} onClick={() => update(undoLast(project, now()))}>
          ← Назад
        </button>
        <span className="muted hint">Клавиши: ← · ↓ · →</span>
      </div>
    </section>
  );
}
