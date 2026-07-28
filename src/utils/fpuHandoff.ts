/**
 * Связка с каталогом федерального перечня учебников.
 *
 * Раздел «УМК и обеспечение» — единственный, для которого федеральная рабочая
 * программа не даёт готового текста: учитель пишет его руками. Рядом на том же
 * домене живёт каталог ФПУ, и логично ходить между ними в обе стороны:
 *
 *   отсюда  → в каталог с уже выставленными фильтрами по предмету и классу;
 *   оттуда  → сюда со списком отобранных учебников.
 *
 * Обмен идёт через localStorage: сервера нет ни у того, ни у другого, а домен
 * общий. Каталог дублирует список в буфер обмена, поэтому даже если ключ не
 * доедет (приватный режим, чужой браузер), учителю останется просто вставить.
 */

/** Ключ, в который каталог кладёт подготовленный список. */
export const HANDOFF_KEY = 'fpu-umk-handoff';

export interface FpuHandoffBook {
  id: string;
  title: string;
  authors: string;
  grade: string;
  publisher: string;
  subject: string;
}

export interface FpuHandoff {
  format: 'fpu-umk';
  version: number;
  createdAt: string;
  text: string;
  books: FpuHandoffBook[];
}

/** Сколько живёт непринятая передача: пришёл на неделе — уже не про эту программу. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isHandoff(v: unknown): v is FpuHandoff {
  if (!v || typeof v !== 'object') return false;
  const h = v as Partial<FpuHandoff>;
  return (
    h.format === 'fpu-umk' &&
    typeof h.text === 'string' &&
    h.text.trim().length > 0 &&
    Array.isArray(h.books)
  );
}

/**
 * Прочитать список, ожидающий вставки. Возвращает null, если ключа нет, он
 * испорчен или устарел — молча, потому что это фоновая проверка.
 */
export function readHandoff(): FpuHandoff | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearHandoff();
    return null;
  }
  if (!isHandoff(parsed)) {
    clearHandoff();
    return null;
  }

  const age = Date.now() - Date.parse(parsed.createdAt);
  if (Number.isFinite(age) && age > MAX_AGE_MS) {
    clearHandoff();
    return null;
  }
  return parsed;
}

export function clearHandoff(): void {
  try {
    localStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* нечего чистить — и ладно */
  }
}

/** Предметы и классы в списке — чтобы показать учителю, про что он. */
export function describeHandoff(h: FpuHandoff): string {
  const subjects = [...new Set(h.books.map((b) => b.subject).filter(Boolean))];
  const grades = [...new Set(h.books.map((b) => b.grade).filter(Boolean))];
  const parts: string[] = [];
  if (subjects.length) parts.push(subjects.slice(0, 3).join(', ') + (subjects.length > 3 ? '…' : ''));
  if (grades.length) parts.push(grades.slice(0, 6).join(', ') + (grades.length > 6 ? '…' : '') + ' кл.');
  return parts.join(' · ');
}

/**
 * Адрес каталога с фильтрами под текущую программу.
 *
 * Фильтр по предмету намеренно передаётся поиском (`q`), а не точным
 * `subjects=`: названия предметов в ФРП и ФПУ совпадают не всегда
 * («Труд (технология)», «Иностранный (английский) язык»), и точный фильтр дал
 * бы пустую выдачу. Поиск же найдёт и по названию, и по предметной области.
 */
export function catalogUrl(subject: string, grade: string | number, base = '../fpu/'): string {
  const url = new URL(base, window.location.href);
  const q = subject.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (q) url.searchParams.set('q', q);
  const n = Number(String(grade).match(/\d+/)?.[0]);
  if (Number.isInteger(n) && n >= 1 && n <= 11) url.searchParams.set('grades', String(n));
  return url.href;
}
