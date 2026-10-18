import { useCallback, useEffect, useState } from 'react';
import type { Project } from '../core/types';
import { needsFileSave, markExported } from '../core/project';
import { getProject, requestPersistence, saveProject } from '../storage/db';
import { downloadProject } from '../storage/file';
import { CheckScreen } from './CheckScreen';
import { CompareScreen } from './CompareScreen';
import { ItemsScreen } from './ItemsScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { ResultsScreen } from './ResultsScreen';
import { UpdatePrompt } from './UpdatePrompt';

export type Tab = 'items' | 'compare' | 'check' | 'results';

const TABS: { id: Tab; label: string }[] = [
  { id: 'items', label: 'Элементы' },
  { id: 'compare', label: 'Сравнение' },
  { id: 'check', label: 'Проверка' },
  { id: 'results', label: 'Результаты' },
];

type Route = { projectId: null } | { projectId: string; tab: Tab };

function parseHash(): Route {
  const match = /^#\/p\/([^/]+)\/(items|compare|check|results)$/.exec(window.location.hash);
  return match ? { projectId: decodeURIComponent(match[1]), tab: match[2] as Tab } : { projectId: null };
}

export function navigate(projectId: string | null, tab: Tab = 'items'): void {
  window.location.hash = projectId ? `#/p/${encodeURIComponent(projectId)}/${tab}` : '#/';
}

export const now = () => new Date().toISOString();

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    void requestPersistence();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const projectId = route.projectId;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void getProject(projectId).then((p) => {
      if (cancelled) return;
      setProject(p ?? null);
      setMissing(!p);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** Applies a change, shows it at once and stores it on the device. */
  const update = useCallback((next: Project) => {
    setProject(next);
    void saveProject(next);
  }, []);

  const saveFile = useCallback(() => {
    if (!project) return;
    downloadProject(project);
    update(markExported(project, now()));
  }, [project, update]);

  if (!route.projectId) {
    return (
      <>
        <ProjectsScreen />
        <UpdatePrompt />
      </>
    );
  }

  if (missing) {
    return (
      <main className="page">
        <p>Проект не найден на этом устройстве.</p>
        <button onClick={() => navigate(null)}>К списку проектов</button>
      </main>
    );
  }
  if (!project || project.id !== route.projectId) return <main className="page">Загрузка…</main>;

  const tab = route.tab;
  return (
    <>
      <header className="topbar">
        <button className="link back" onClick={() => navigate(null)} aria-label="К списку проектов">
          ← Проекты
        </button>
        <h1 className="title">{project.name}</h1>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => navigate(project.id, t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {needsFileSave(project) && (
        <div className="banner">
          <span>Изменения не сохранены в файл. Файл нужен для переноса на другое устройство и как резервная копия.</span>
          <button className="small" onClick={saveFile}>
            Сохранить файл
          </button>
        </div>
      )}
      <main className="page">
        {tab === 'items' && <ItemsScreen project={project} update={update} />}
        {tab === 'compare' && <CompareScreen project={project} update={update} />}
        {tab === 'check' && <CheckScreen project={project} update={update} />}
        {tab === 'results' && <ResultsScreen project={project} saveFile={saveFile} />}
      </main>
      <UpdatePrompt />
    </>
  );
}
