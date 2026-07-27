import { defaultProgram, loadProgram, normalizeProgram, STORAGE_KEY, type ProgramData } from './program';

/**
 * Библиотека программ в браузере.
 *
 * До этого в хранилище лежала ровно одна программа: начал вторую — первая
 * затёрта, если учитель не вспомнил сохранить её файлом. А программ у учителя
 * обычно несколько: свой предмет в разных классах, иногда два предмета.
 *
 * Никакой регистрации и никакой отправки данных: всё лежит в localStorage
 * этого браузера, а переносится файлами — по одной программе или всё разом
 * резервной копией.
 *
 * Список хранится отдельно от самих программ. Иначе, чтобы показать перечень
 * из десяти названий, пришлось бы разобрать пару мегабайт JSON: одна программа
 * с текстами ФРП и поурочным планом весит сотни килобайт.
 */

const INDEX_KEY = 'fgos-library-index';
const ITEM_PREFIX = 'fgos-program:';
const CURRENT_KEY = 'fgos-library-current';

export interface LibraryEntry {
  id: string;
  /** Подпись в списке; по умолчанию собирается из предмета и класса. */
  title: string;
  subject: string;
  grade: string;
  level: string;
  updatedAt: string;
  /** Размер в байтах — по нему видно, что занимает место в хранилище. */
  size: number;
  /**
   * Подпись задана вручную. Такую не трогаем при сохранении: иначе
   * переименованная программа возвращала бы себе автоматическое название
   * при первой же правке предмета.
   */
  renamed?: boolean;
}

export class StorageFullError extends Error {
  constructor() {
    super(
      'В браузере закончилось место для программ. Сохраните нужные в файл ' +
        'и удалите лишние из списка.',
    );
  }
}

function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Подпись программы по её содержимому: «Алгебра (углублённый), 7 класс».
 *
 * Уровень изучения входит в подпись не для красоты: базовая и углублённая
 * программы по одному предмету и классу — разные документы, и без него они
 * выглядели бы в списке одинаково.
 */
export function titleFor(data: ProgramData): string {
  const subject = data.variant ? `${data.subject} (${data.variant})` : data.subject;
  const parts = [subject || 'Без названия'];
  if (data.grade) parts.push(`${data.grade} класс`);
  return parts.join(', ');
}

function readIndex(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: LibraryEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

/**
 * Запись в localStorage с внятной ошибкой при нехватке места.
 *
 * Браузер бросает QuotaExceededError, и без обработки автосохранение молча
 * переставало работать: учитель продолжал печатать, а на диск ничего
 * не ложилось.
 */
function writeItem(id: string, data: ProgramData): number {
  const payload = JSON.stringify(data);
  try {
    localStorage.setItem(ITEM_PREFIX + id, payload);
  } catch {
    throw new StorageFullError();
  }
  return payload.length;
}

export function list(): LibraryEntry[] {
  return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function read(id: string): ProgramData | null {
  const raw = localStorage.getItem(ITEM_PREFIX + id);
  if (!raw) return null;
  try {
    return normalizeProgram(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function currentId(): string {
  return localStorage.getItem(CURRENT_KEY) ?? '';
}

export function setCurrent(id: string): void {
  localStorage.setItem(CURRENT_KEY, id);
}

/**
 * Сохранение программы. Подпись обновляется вместе с предметом и классом,
 * если учитель не задал её вручную.
 */
export function save(id: string, data: ProgramData, title?: string): LibraryEntry {
  const size = writeItem(id, data);
  const entries = readIndex();
  const existing = entries.find((e) => e.id === id);
  const renamed = Boolean(title) || Boolean(existing?.renamed);
  const entry: LibraryEntry = {
    id,
    title: title ?? (existing?.renamed ? existing.title : titleFor(data)),
    subject: data.subject,
    grade: data.grade,
    level: data.educationLevel,
    updatedAt: new Date().toISOString(),
    size,
    renamed,
  };

  const next = existing ? entries.map((e) => (e.id === id ? entry : e)) : [...entries, entry];
  writeIndex(next);
  return entry;
}

export function rename(id: string, title: string): void {
  writeIndex(
    readIndex().map((e) =>
      e.id === id ? { ...e, title: title.trim() || e.title, renamed: true } : e,
    ),
  );
}

export function remove(id: string): void {
  localStorage.removeItem(ITEM_PREFIX + id);
  writeIndex(readIndex().filter((e) => e.id !== id));
  if (currentId() === id) localStorage.removeItem(CURRENT_KEY);
}

/** Создаёт программу и делает её текущей. */
export function create(data: ProgramData = defaultProgram, title?: string): string {
  const id = newId();
  save(id, data, title);
  setCurrent(id);
  return id;
}

export function duplicate(id: string): string | null {
  const data = read(id);
  if (!data) return null;
  const from = readIndex().find((e) => e.id === id);
  return create(data, `${from?.title ?? titleFor(data)} — копия`);
}

/** Суммарный объём библиотеки в байтах. */
export function usedBytes(): number {
  return readIndex().reduce((a, e) => a + (e.size || 0), 0);
}

/**
 * Перенос из старого хранилища на одну программу.
 *
 * Вызывается при первом запуске новой версии: работа, начатая до появления
 * библиотеки, должна открыться как обычная программа, а не пропасть.
 */
export function migrateSingleProgram(): void {
  if (readIndex().length) return;
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (!legacy) return;
  const data = loadProgram();
  // Пустую заготовку переносить незачем — она ничем не отличается от новой.
  if (!data.subject && !data.schoolName && !data.thematicPlan.length) return;
  create(data);
  localStorage.removeItem(STORAGE_KEY);
}
