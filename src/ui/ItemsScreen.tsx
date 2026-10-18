import { useState } from 'react';
import { comparisonCount } from '../core/pairs';
import { MAX_ITEMS, previewItemsChange, renameProject, setAskReverse, setItems } from '../core/project';
import type { Item, Project } from '../core/types';
import { navigate, now } from './App';
import { newId } from './ids';
import { plural } from './format';

interface Props {
  project: Project;
  update: (p: Project) => void;
}

const normalize = (name: string) => name.trim().toLocaleLowerCase('ru-RU');

/** Asks for confirmation when a change affects existing answers. */
function confirmChange(project: Project, items: Item[], askReverse = project.settings.askReverse): boolean {
  if (project.responses.length === 0) return true;
  const change = previewItemsChange(project, items, askReverse);
  const parts: string[] = [];
  if (change.removedResponses > 0) parts.push(`будет удалено ответов: ${change.removedResponses}`);
  const added = change.questionsAfter - change.questionsBefore;
  if (added > 0) parts.push(`к опросу добавится вопросов: ${added}`);
  if (added < 0) parts.push(`из опроса уйдёт вопросов: ${-added}`);
  if (parts.length === 0) return true;
  return window.confirm(`Изменение затронет уже данные ответы: ${parts.join(', ')}. Продолжить?`);
}

export function ItemsScreen({ project, update }: Props) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const items = project.items;
  const askReverse = project.settings.askReverse;

  const validateName = (name: string, exceptId?: string): string => {
    if (!name.trim()) return 'Название не может быть пустым.';
    if (items.some((i) => i.id !== exceptId && normalize(i.name) === normalize(name))) return 'Элемент с таким названием уже есть.';
    return '';
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length >= MAX_ITEMS) return setError(`Можно сравнивать не больше ${MAX_ITEMS} элементов.`);
    const message = validateName(newName);
    if (message) return setError(message);
    const next = [...items, { id: newId(), name: newName.trim() }];
    if (!confirmChange(project, next)) return;
    update(setItems(project, next, Math.random, now()));
    setNewName('');
    setError('');
  };

  const remove = (item: Item) => {
    const next = items.filter((i) => i.id !== item.id);
    if (project.responses.length === 0 ? !window.confirm(`Удалить «${item.name}»?`) : !confirmChange(project, next)) return;
    update(setItems(project, next, Math.random, now()));
  };

  const saveRename = () => {
    if (!editing) return;
    const message = validateName(editing.name, editing.id);
    if (message) return setError(message);
    update({ ...project, items: items.map((i) => (i.id === editing.id ? { ...i, name: editing.name.trim() } : i)), updatedAt: now() });
    setEditing(null);
    setError('');
  };

  const move = (index: number, delta: number) => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update({ ...project, items: next, updatedAt: now() });
  };

  const toggleReverse = (value: boolean) => {
    if (!confirmChange(project, items, value)) return;
    update(setAskReverse(project, value, Math.random, now()));
  };

  const total = comparisonCount(items.length, askReverse);

  return (
    <>
      <label className="field">
        <span>Название проекта</span>
        <input
          defaultValue={project.name}
          maxLength={120}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== project.name) update(renameProject(project, name, now()));
          }}
        />
      </label>

      <div className="counter" aria-live="polite">
        <strong>
          {items.length} {plural(items.length, ['элемент', 'элемента', 'элементов'])} → {total}{' '}
          {plural(total, ['сравнение', 'сравнения', 'сравнений'])}
        </strong>
        <span className="muted">
          {askReverse
            ? `Без обратных пар было бы ${comparisonCount(items.length, false)}.`
            : `С обратными парами было бы ${comparisonCount(items.length, true)}.`}
        </span>
      </div>

      <label className="switch">
        <input type="checkbox" checked={askReverse} onChange={(e) => toggleReverse(e.target.checked)} />
        <span>
          Опрашивать обратные пары
          <small className="muted">Каждая пара задаётся дважды (A–B и B–A), чтобы находить противоречия.</small>
        </span>
      </label>

      <form className="row" onSubmit={add}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={items.length >= MAX_ITEMS ? `Достигнут предел: ${MAX_ITEMS}` : 'Новый элемент, например «Скорость»'}
          disabled={items.length >= MAX_ITEMS}
          maxLength={80}
        />
        <button type="submit" disabled={!newName.trim() || items.length >= MAX_ITEMS}>
          Добавить
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <ol className="items">
        {items.map((item, index) => (
          <li key={item.id}>
            {editing?.id === item.id ? (
              <form
                className="row grow"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRename();
                }}
              >
                <input autoFocus value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <button type="submit" className="small">
                  OK
                </button>
                <button type="button" className="small secondary" onClick={() => setEditing(null)}>
                  Отмена
                </button>
              </form>
            ) : (
              <>
                <span className="item-name">{item.name}</span>
                <span className="item-actions">
                  <button className="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Выше">
                    ↑
                  </button>
                  <button className="icon" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label="Ниже">
                    ↓
                  </button>
                  <button className="icon" onClick={() => setEditing({ id: item.id, name: item.name })} aria-label="Переименовать">
                    ✎
                  </button>
                  <button className="icon danger" onClick={() => remove(item)} aria-label="Удалить">
                    ✕
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ol>

      {items.length >= 2 && (
        <button className="wide" onClick={() => navigate(project.id, 'compare')}>
          {project.pending.length > 0 ? 'Перейти к сравнению' : 'Все сравнения выполнены — к проверке'}
        </button>
      )}
      {items.length < 2 && <p className="muted">Добавьте хотя бы два элемента.</p>}
    </>
  );
}
