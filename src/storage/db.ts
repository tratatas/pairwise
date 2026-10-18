import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Project } from '../core/types';

interface PairwiseDB extends DBSchema {
  projects: { key: string; value: Project };
}

let dbPromise: Promise<IDBPDatabase<PairwiseDB>> | null = null;

function db(): Promise<IDBPDatabase<PairwiseDB>> {
  dbPromise ??= openDB<PairwiseDB>('pairwise', 1, {
    upgrade(database) {
      database.createObjectStore('projects', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** All projects, most recently changed first. */
export async function listProjects(): Promise<Project[]> {
  const projects = await (await db()).getAll('projects');
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

/** Asks the browser not to evict stored projects under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported: data is still stored, only without the eviction guarantee.
  }
}
