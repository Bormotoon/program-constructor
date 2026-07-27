/**
 * Разбор таблицы КТП и сопоставление её колонок с моделью плана.
 *
 * Вынесено из ExcelImportDialog, чтобы это можно было проверять без браузера:
 * поломка кодировки CSV (issue #12) полгода жила незамеченной именно потому,
 * что разбор был заперт внутри обработчика загрузки файла.
 */

import * as XLSX from 'xlsx';
import { newId, type PlanSection, type PlanTopic } from '../data/thematicPlan';

/**
 * Колонки целевой модели. Названия и синонимы подобраны под то, как школы
 * реально называют столбцы в своих КТП, — точного совпадения заголовков
 * не требуется, соответствие всегда можно поправить вручную.
 */
export const TARGET_COLUMNS = [
  { key: 'section', label: 'Раздел', required: false, synonyms: ['раздел', 'модуль', 'блок'] },
  { key: 'num', label: '№ п/п', required: false, synonyms: ['№', 'номер', 'п/п'] },
  { key: 'name', label: 'Тема', required: true, synonyms: ['тема', 'наименование', 'урок'] },
  { key: 'hours', label: 'Количество часов', required: true, synonyms: ['час', 'кол-во', 'количество'] },
  { key: 'content', label: 'Программное содержание', required: false, synonyms: ['содержание', 'программное'] },
  { key: 'activity', label: 'Основные виды деятельности', required: false, synonyms: ['деятельност', 'виды работ', 'характеристика'] },
] as const;

export type TargetKey = (typeof TARGET_COLUMNS)[number]['key'];
export type ColumnMapping = Partial<Record<TargetKey, string>>;

export interface ParsedTable {
  headers: string[];
  rows: Record<string, unknown>[];
  /** Кодировка, которой прочитан CSV. Для книг Excel — null. */
  encoding: 'utf-8' | 'utf-8-bom' | 'windows-1251' | null;
}

/** Книга Excel: zip (xlsx, ods) или составной документ OLE2 (xls). */
function isWorkbook(bytes: Uint8Array): boolean {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

/**
 * Декодирование CSV.
 *
 * У CSV нет места, где записана кодировка, поэтому SheetJS, получив байты,
 * разбирает их как latin1 — и вся кириллица превращается в мохибейк вместе
 * с данными, а не только заголовками. Определяем кодировку сами.
 *
 * Порядок проверок не произвольный: cp1251 почти никогда не является
 * валидным UTF-8 (русский текст в нём даёт недопустимые последовательности),
 * поэтому «сначала UTF-8 в строгом режиме, иначе cp1251» разделяет их
 * однозначно. Обратный порядок был бы гаданием: любые байты — валидный cp1251.
 */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: ParsedTable['encoding'] } {
  // BOM обрезается: иначе он приклеивается к первому заголовку и тот
  // перестаёт точно совпадать с названием колонки.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // Остаётся cp1251 — то, что по умолчанию пишет русский Excel.
    return { text: new TextDecoder('windows-1251').decode(bytes), encoding: 'windows-1251' };
  }
}

/**
 * Разбор файла в заголовки и строки.
 *
 * Формат определяется по сигнатуре файла, а не по расширению: книга,
 * переименованная в .csv, встречается чаще, чем хотелось бы.
 */
export function parseTable(data: ArrayBuffer): ParsedTable {
  const bytes = new Uint8Array(data);
  let encoding: ParsedTable['encoding'] = null;
  let wb: XLSX.WorkBook;

  if (isWorkbook(bytes)) {
    wb = XLSX.read(bytes, { type: 'array' });
  } else {
    const decoded = decodeCsv(bytes);
    encoding = decoded.encoding;
    wb = XLSX.read(decoded.text, { type: 'string' });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [], encoding };

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

  // Шапкой считаем первую строку, где заполнено хотя бы две ячейки:
  // в школьных КТП над таблицей часто стоит заголовок в одну ячейку.
  let headerRowIndex = 0;
  for (let i = 0; i < grid.length; i += 1) {
    const filled = (grid[i] || []).filter((c) => String(c ?? '').trim()).length;
    if (filled >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = (grid[headerRowIndex] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
  const rows = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex }) as Record<string, unknown>[];

  return { headers, rows, encoding };
}

/** Сопоставление колонок файла с моделью: точное совпадение, затем синонимы. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const auto: ColumnMapping = {};
  for (const col of TARGET_COLUMNS) {
    const exact = headers.find((h) => h.toLowerCase() === col.label.toLowerCase());
    if (exact) {
      auto[col.key] = exact;
      continue;
    }
    const bySynonym = headers.find((h) => col.synonyms.some((s) => h.toLowerCase().includes(s)));
    if (bySynonym) auto[col.key] = bySynonym;
  }
  return auto;
}

/** Обязательные колонки, которым не нашлось соответствия. */
export function missingRequired(mapping: ColumnMapping) {
  return TARGET_COLUMNS.filter((c) => c.required && !mapping[c.key]);
}

/**
 * Строки файла в разделы плана.
 *
 * Группировка идёт по колонке «Раздел». Если её не указали, весь импорт
 * попадает в один безымянный раздел — так же ведёт себя таблица, набранная
 * вручную.
 */
export function rowsToSections(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
): PlanSection[] {
  const get = (row: Record<string, unknown>, key: TargetKey): string => {
    const header = mapping[key];
    return header ? String(row[header] ?? '').trim() : '';
  };

  const sections: PlanSection[] = [];
  let current: PlanSection | null = null;

  for (const row of rows) {
    const name = get(row, 'name');
    if (!name) continue;

    const sectionName = get(row, 'section');
    if (!current || (sectionName && sectionName !== current.name)) {
      current = { id: newId('s'), name: sectionName, topics: [] };
      sections.push(current);
    }

    const hours = Number.parseInt(get(row, 'hours'), 10);
    const topic: PlanTopic = {
      id: newId('t'),
      num: get(row, 'num'),
      name,
      hours: Number.isFinite(hours) && hours >= 0 ? hours : 0,
      content: get(row, 'content'),
      activity: get(row, 'activity'),
    };
    current.topics.push(topic);
  }

  return sections;
}
