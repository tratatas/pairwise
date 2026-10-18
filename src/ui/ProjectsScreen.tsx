import { useEffect, useRef, useState } from 'react';
import { answeredCount, comparisonCount } from '../core/pairs';
import { createProject } from '../core/project';
import type { Project } from '../core/types';
import { deleteProject, getProject, listProjects, saveProject } from '../storage/db';
import { FILE_EXTENSION, ImportError, readProjectFile } from '../storage/file';
import { navigate, now } from './App';
import { newId } from './ids';
import { formatDate } from './format';

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () => listProjects().then(setProjects);
  useEffect(() => {
    void reload();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = createProject(trimmed, newId(), now());
    await saveProject(project);
    navigate(project.id, 'items');
  };

  const importFile = async (file: File) => {
    setError('');
    try {
      let project = await readProjectFile(file);
      if (await getProject(project.id)) {
        const replace = window.confirm(
          `Проект «${project.name}» уже есть на этом устройстве.\n\nОК — заменить его данными из файла.\nОтмена — сохранить файл как отдельную копию.`,
        );
        if (!replace) project = { ...project, id: newId(), name: `${project.name} (копия)` };
      }
      // The imported file is itself an up-to-date copy.
      await saveProject({ ...project, lastExportedAt: project.updatedAt });
      await reload();
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Не удалось прочитать файл.');
    }
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Удалить проект «${project.name}» с этого устройства? Действие нельзя отменить.`)) return;
    await deleteProject(project.id);
    await reload();
  };

  return (
    <main className="page">
      <h1>Матрица парных сравнений</h1>

      <form className="row" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название нового проекта" maxLength={120} />
        <button type="submit" disabled={!name.trim()}>
          Создать
        </button>
      </form>

      <div className="row">
        <button className="secondary" onClick={() => fileInput.current?.click()}>
          Открыть файл проекта
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={`${FILE_EXTENSION},.json,application/json`}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Проекты на этом устройстве</h2>
      {projects === null && <p>Загрузка…</p>}
      {projects?.length === 0 && <p className="muted">Проектов пока нет. Создайте новый или откройте файл проекта.</p>}
      <ul className="cards">
        {projects?.map((p) => {
          const total = comparisonCount(p.items.length, p.settings.askReverse);
          const done = answeredCount(p.items, p.responses, p.settings.askReverse);
          return (
            <li key={p.id} className="card">
              <button className="card-main" onClick={() => navigate(p.id, p.items.length < 2 ? 'items' : 'compare')}>
                <strong>{p.name}</strong>
                <span className="muted">
                  Элементов: {p.items.length} · сравнений: {done} из {total} · изменён {formatDate(p.updatedAt)}
                </span>
              </button>
              <button className="link danger" onClick={() => remove(p)} aria-label={`Удалить проект ${p.name}`}>
                Удалить
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
