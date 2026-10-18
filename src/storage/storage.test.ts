import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { answerCurrent, createProject, setItems } from '../core/project';
import { deleteProject, getProject, listProjects, saveProject } from './db';
import { ImportError, parseProjectFile, safeFileName, serializeProject } from './file';

const NOW = '2026-10-18T10:00:00.000Z';

function sample() {
  let p = createProject('Выбор ноутбука', 'id-1', NOW);
  p = setItems(p, [{ id: 'a', name: 'Скорость' }, { id: 'b', name: 'Вес' }], () => 0.3, NOW);
  return answerCurrent(p, 'better', NOW);
}

describe('project file', () => {
  it('round-trips export and import', () => {
    const project = sample();
    expect(parseProjectFile(serializeProject(project))).toEqual(project);
  });

  it('rejects broken JSON', () => {
    expect(() => parseProjectFile('{oops')).toThrow(ImportError);
  });

  it('rejects an unsupported version', () => {
    const text = serializeProject({ ...sample(), schemaVersion: 2 as 1 });
    expect(() => parseProjectFile(text)).toThrow(/версия/);
  });

  it('rejects missing fields', () => {
    const data = JSON.parse(serializeProject(sample()));
    delete data.items;
    expect(() => parseProjectFile(JSON.stringify(data))).toThrow(/элементов/);
  });

  it('rejects answers about unknown items', () => {
    const data = JSON.parse(serializeProject(sample()));
    data.responses[0].first = 'zzz';
    expect(() => parseProjectFile(JSON.stringify(data))).toThrow(/ответы/);
  });

  it('makes safe file names', () => {
    expect(safeFileName('a/b:c?')).toBe('a_b_c_');
    expect(safeFileName('  ')).toBe('project');
  });
});

describe('IndexedDB storage', () => {
  it('saves, lists, reads and deletes projects', async () => {
    const first = sample();
    const second = { ...createProject('Второй', 'id-2', '2026-10-18T11:00:00.000Z') };
    await saveProject(first);
    await saveProject(second);
    expect((await listProjects()).map((p) => p.id)).toEqual(['id-2', 'id-1']);
    expect(await getProject('id-1')).toEqual(first);
    await deleteProject('id-1');
    expect(await getProject('id-1')).toBeUndefined();
  });
});
