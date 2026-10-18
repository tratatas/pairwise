import { useState } from 'react';
import { comparisonCount } from '../core/pairs';
import { MAX_ITEMS, normalizeName, parseBulkNames, previewItemsChange, renameProject, setAskReverse, setItems } from '../core/project';
import type { Item, Project } from '../core/types';
import { navigate, now } from './App';
import { newId } from './ids';
import { plural } from './format';

interface Props {
  project: Project;
  update: (p: Project) => void;
}


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
  const [newNames, setNewNames] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; note: string } | null>(null);
  const items = project.items;
  const askReverse = project.settings.askReverse;

  const validateName = (name: string, exceptId?: string): string => {
    if (!name.trim()) return 'Название не может быть пустым.';
    if (items.some((i) => i.id !== exceptId && normalizeName(i.name) === normalizeName(name))) return 'Элемент с таким названием уже есть.';
    return '';
  };

  const add = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    if (items.length >= MAX_ITEMS) return setError(`Можно сравнивать не больше ${MAX_ITEMS} элементов.`);
    const parsed = parseBulkNames(newNames, items);
    const notes: string[] = [];
    if (parsed.duplicates.length) notes.push(`пропущены повторы: ${parsed.duplicates.join(', ')}`);
    if (parsed.overLimit.length) notes.push(`не поместились (предел ${MAX_ITEMS}): ${parsed.overLimit.join(', ')}`);
    if (parsed.names.length === 0) return setError(notes.length ? `Нечего добавить: ${notes.join('; ')}.` : 'Введите название.');
    const next = [...items, ...parsed.names.map((name) => ({ id: newId(), name }))];
    if (!confirmChange(project, next)) return;
    update(setItems(project, next, Math.random, now()));
    setNewNames('');
    setInfo(`Добавлено: ${parsed.names.length}${notes.length ? `; ${notes.join('; ')}` : ''}.`);
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
    const note = editing.note.trim() || undefined;
    update({
      ...project,
      items: items.map((i) => (i.id === editing.id ? { ...i, name: editing.name.trim(), note } : i)),
      updatedAt: now(),
    });
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

      <form className="add-form" onSubmit={add}>
        <label className="field">
          <span>Добавить элементы — по одному на строке. Можно вставить список или столбец из таблицы.</span>
          <textarea
            value={newNames}
            onChange={(e) => setNewNames(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !newNames.includes('\n')) {
                e.preventDefault();
                add();
              }
            }}
            placeholder={items.length >= MAX_ITEMS ? `Достигнут предел: ${MAX_ITEMS}` : 'Например:\nСкорость\nСтоимость\nВес'}
            disabled={items.length >= MAX_ITEMS}
            rows={Math.min(8, Math.max(2, newNames.split('\n').length))}
          />
        </label>
        <button type="submit" disabled={!newNames.trim() || items.length >= MAX_ITEMS}>
          Добавить
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {info && <p className="muted small-text">{info}</p>}

      <ol className="items">
        {items.map((item, index) => (
          <li key={item.id}>
            {editing?.id === item.id ? (
              <form
                className="edit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRename();
                }}
              >
                <input
                  autoFocus
                  value={editing.name}
                  maxLength={80}
                  aria-label="Название"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <textarea
                  value={editing.note}
                  maxLength={1000}
                  rows={3}
                  aria-label="Описание"
                  placeholder="Описание (необязательно): уточнения, характеристики, источник"
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
                <div className="row">
                  <button type="submit" className="small">
                    Сохранить
                  </button>
                  <button type="button" className="small secondary" onClick={() => setEditing(null)}>
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <>
                <button
                  className="item-main"
                  onClick={() => setEditing({ id: item.id, name: item.name, note: item.note ?? '' })}
                  title="Изменить название и описание"
                >
                  <span className="item-name">{item.name}</span>
                  {item.note ? (
                    <span className="item-note">{item.note}</span>
                  ) : (
                    <span className="item-note add">+ описание</span>
                  )}
                </button>
                <span className="item-actions">
                  <button className="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Выше">
                    ↑
                  </button>
                  <button className="icon" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label="Ниже">
                    ↓
                  </button>
                  <button className="icon danger" onClick={() => remove(item)} aria-label={`Удалить ${item.name}`}>
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
