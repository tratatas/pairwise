import type { Answer, Project } from '../core/types';

export const FILE_EXTENSION = '.pairwise.json';

export class ImportError extends Error {}

const ANSWERS: Answer[] = ['better', 'equal', 'worse'];

const isString = (v: unknown): v is string => typeof v === 'string';
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(message: string): never {
  throw new ImportError(message);
}

/** Parses and validates the contents of a project file. Throws ImportError with a Russian message. */
export function parseProjectFile(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('Файл повреждён или не является файлом проекта (ошибка чтения JSON).');
  }
  if (!isObject(data)) fail('Файл не является файлом проекта.');
  if (data.schemaVersion !== 1) {
    fail(`Неподдерживаемая версия файла: ${String(data.schemaVersion ?? 'не указана')}. Ожидается версия 1.`);
  }
  for (const field of ['id', 'name', 'createdAt', 'updatedAt'] as const) {
    if (!isString(data[field])) fail(`В файле отсутствует поле «${field}».`);
  }
  if (!isObject(data.settings) || typeof data.settings.askReverse !== 'boolean') fail('В файле повреждены настройки проекта.');
  if (!Array.isArray(data.items)) fail('В файле отсутствует список элементов.');
  const ids = new Set<string>();
  for (const item of data.items) {
    if (!isObject(item) || !isString(item.id) || !isString(item.name)) fail('В файле повреждён список элементов.');
    if (ids.has(item.id)) fail('В файле повторяются элементы.');
    ids.add(item.id);
  }
  const known = (id: unknown) => isString(id) && ids.has(id);
  const isQuestion = (q: unknown) =>
    isObject(q) && known(q.first) && known(q.second) && q.first !== q.second && typeof q.round === 'number';
  if (!Array.isArray(data.responses)) fail('В файле отсутствуют ответы.');
  for (const r of data.responses) {
    if (!isQuestion(r) || !ANSWERS.includes((r as Record<string, unknown>).answer as Answer)) fail('В файле повреждены ответы.');
  }
  if (!Array.isArray(data.resolutions)) fail('В файле отсутствуют ручные решения.');
  for (const r of data.resolutions) {
    if (!isObject(r) || !known(r.a) || !known(r.b) || !ANSWERS.includes(r.value as Answer)) fail('В файле повреждены ручные решения.');
  }
  if (!Array.isArray(data.pending) || !data.pending.every(isQuestion)) fail('В файле повреждена очередь вопросов.');
  return data as unknown as Project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
}

/** Triggers a download of a blob (works in all target browsers, no File System Access API). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadProject(project: Project): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  downloadBlob(blob, safeFileName(project.name) + FILE_EXTENSION);
}

/** Reads a file chosen with <input type="file">. */
export async function readProjectFile(file: File): Promise<Project> {
  return parseProjectFile(await file.text());
}
