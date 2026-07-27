import { saveAs } from 'file-saver';
import { normalizeProgram, type ProgramData } from '../data/program';
import { list, read } from '../data/library';

/**
 * Сохранение и загрузка программы файлом.
 *
 * Оригинальный конструктор держит программы на сервере, поэтому учитель
 * открывает их с любого компьютера. Здесь всё лежит в браузере, и без файла
 * программу нельзя ни перенести на другой компьютер, ни отдать коллеге, ни
 * положить в резервную копию. Формат — обычный JSON: он читаемый и его можно
 * открыть спустя годы без этого приложения.
 */

const FORMAT = 'fgos-program';
const BACKUP_FORMAT = 'fgos-library';
const VERSION = 1;

interface ProgramFile {
  format: string;
  version: number;
  savedAt: string;
  program: ProgramData;
}

export function exportProgramFile(data: ProgramData): void {
  const payload: ProgramFile = {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    program: data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const sanitize = (s: string) => s.replace(/[^а-яА-ЯёЁa-zA-Z0-9_-]/g, '_').substring(0, 50);
  saveAs(
    blob,
    `programma_${sanitize(data.subject || 'predmet')}_${sanitize(data.grade || 'x')}_klass.json`,
  );
}

export class ProgramFileError extends Error {}

export async function importProgramFile(file: File): Promise<ProgramData> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new ProgramFileError('Файл повреждён или это не файл программы.');
  }

  const doc = parsed as Partial<ProgramFile>;
  if (!doc || doc.format !== FORMAT) {
    throw new ProgramFileError(
      'Это не файл программы конструктора. Выберите файл, сохранённый кнопкой «Сохранить в файл».',
    );
  }
  if (typeof doc.version !== 'number' || doc.version > VERSION) {
    throw new ProgramFileError(
      'Файл сохранён более новой версией конструктора. Обновите страницу и попробуйте снова.',
    );
  }

  return normalizeProgram(doc.program);
}

// ===================== резервная копия всей библиотеки =====================

interface BackupFile {
  format: string;
  version: number;
  savedAt: string;
  programs: { title: string; program: ProgramData }[];
}

/**
 * Резервная копия всех программ одним файлом.
 *
 * Файл на программу хорош, чтобы отдать её коллеге, но переносить работу
 * на другой компьютер по одному файлу — занятие на полчаса. Здесь всё
 * выгружается разом и так же разом восстанавливается.
 */
export function exportLibraryFile(): void {
  const programs: BackupFile['programs'] = [];
  for (const entry of list()) {
    const program = read(entry.id);
    if (program) programs.push({ title: entry.title, program });
  }

  const payload: BackupFile = {
    format: BACKUP_FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    programs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const day = new Date().toISOString().slice(0, 10);
  saveAs(blob, `programmy_${day}.json`);
}

/** Программы из резервной копии; вызывающий сам решает, что с ними делать. */
export async function importLibraryFile(
  file: File,
): Promise<{ title: string; program: ProgramData }[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new ProgramFileError('Файл повреждён или это не файл конструктора.');
  }

  const doc = parsed as Partial<BackupFile>;
  if (!doc || doc.format !== BACKUP_FORMAT) {
    throw new ProgramFileError(
      'Это не резервная копия программ. Для одной программы есть «Загрузить из файла».',
    );
  }
  if (typeof doc.version !== 'number' || doc.version > VERSION) {
    throw new ProgramFileError(
      'Копия сохранена более новой версией конструктора. Обновите страницу и попробуйте снова.',
    );
  }
  if (!Array.isArray(doc.programs)) {
    throw new ProgramFileError('В копии нет ни одной программы.');
  }

  return doc.programs.map((item, i) => ({
    title: typeof item?.title === 'string' && item.title.trim() ? item.title : `Программа ${i + 1}`,
    program: normalizeProgram(item?.program),
  }));
}
