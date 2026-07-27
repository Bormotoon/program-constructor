/**
 * Сквозная проверка импорта КТП: файл -> заголовки -> сопоставление -> разделы.
 *
 * Появилась из-за issue #12: CSV с кириллицей читался как latin1, и в план
 * приезжал мохибейк. Поймать это было нечем — `ui:check` открывал диалог
 * импорта, но ни одного файла через него не пропускал.
 *
 * Проверяются все сочетания, которые реально выдают школы: книга Excel,
 * CSV в UTF-8 с BOM и без, CSV в cp1251, запятая и точка с запятой.
 *
 * Запуск: npm run verify:import
 */

import * as XLSX from 'xlsx';
import {
  autoMapColumns,
  decodeCsv,
  missingRequired,
  parseTable,
  rowsToSections,
  TARGET_COLUMNS,
} from '../src/utils/tableImport';

const HEADERS = [
  'Раздел',
  '№ п/п',
  'Тема',
  'Количество часов',
  'Программное содержание',
  'Основные виды деятельности',
];

const ROWS = [
  ['Числа и вычисления', '1.1', 'Рациональные числа', '25', 'Понятие рационального числа', 'Систематизировать знания'],
  ['Числа и вычисления', '1.2', 'Алгебраические выражения', '27', 'Буквенные выражения', 'Овладеть терминологией'],
  ['Уравнения', '2.1', 'Линейные уравнения', '20', 'Правила преобразования', 'Решать уравнения'],
];

let failures = 0;
const ok = (pass: boolean, text: string) => {
  console.log(`${pass ? '[OK   ]' : '[ОШИБКА]'} ${text}`);
  if (!pass) failures += 1;
};

/** Кириллица в cp1251: диапазон А-я идёт подряд с 0xC0, № — 0xB9. */
function toCp1251(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 128) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
    else if (c === 0x401) out.push(0xa8);
    else if (c === 0x451) out.push(0xb8);
    else if (c === 0x2116) out.push(0xb9);
    else out.push(0x3f);
  }
  return new Uint8Array(out);
}

function csvText(sep: string): string {
  return [HEADERS, ...ROWS]
    .map((r) => r.map((c) => (c.includes(sep) ? `"${c}"` : c)).join(sep))
    .join('\r\n');
}

function utf8(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

function xlsxBytes(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]), 'КТП');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

const cases: { name: string; bytes: Uint8Array; encoding: string | null }[] = [
  { name: 'книга .xlsx', bytes: xlsxBytes(), encoding: null },
  { name: 'CSV, запятая, UTF-8 без BOM', bytes: utf8(csvText(','), false), encoding: 'utf-8' },
  { name: 'CSV, запятая, UTF-8 с BOM', bytes: utf8(csvText(','), true), encoding: 'utf-8-bom' },
  { name: 'CSV, точка с запятой, UTF-8 без BOM', bytes: utf8(csvText(';'), false), encoding: 'utf-8' },
  { name: 'CSV, точка с запятой, UTF-8 с BOM', bytes: utf8(csvText(';'), true), encoding: 'utf-8-bom' },
  { name: 'CSV, точка с запятой, cp1251', bytes: toCp1251(csvText(';')), encoding: 'windows-1251' },
  { name: 'CSV, запятая, cp1251', bytes: toCp1251(csvText(',')), encoding: 'windows-1251' },
];

const totalHours = ROWS.reduce((s, r) => s + Number(r[3]), 0);

for (const c of cases) {
  const buf = c.bytes.buffer.slice(
    c.bytes.byteOffset,
    c.bytes.byteOffset + c.bytes.byteLength,
  ) as ArrayBuffer;
  const parsed = parseTable(buf);

  ok(parsed.encoding === c.encoding, `${c.name}: кодировка определена как ${parsed.encoding}`);
  ok(
    parsed.headers.length === HEADERS.length && parsed.headers.every((h, i) => h === HEADERS[i]),
    `${c.name}: заголовки прочитаны без порчи (${parsed.headers.length}/${HEADERS.length})`,
  );

  const mapping = autoMapColumns(parsed.headers);
  const mapped = TARGET_COLUMNS.filter((col) => mapping[col.key]);
  const distinct = new Set(Object.values(mapping)).size;
  ok(
    mapped.length === TARGET_COLUMNS.length && distinct === TARGET_COLUMNS.length,
    `${c.name}: сопоставлено колонок ${mapped.length}/${TARGET_COLUMNS.length}, все разные`,
  );
  ok(missingRequired(mapping).length === 0, `${c.name}: обязательные колонки найдены`);

  const sections = rowsToSections(parsed.rows, mapping);
  const topics = sections.flatMap((s) => s.topics);
  const hours = topics.reduce((s, t) => s + t.hours, 0);

  ok(sections.length === 2, `${c.name}: разделов ${sections.length} (ожидалось 2)`);
  ok(topics.length === ROWS.length, `${c.name}: тем ${topics.length}`);
  ok(hours === totalHours, `${c.name}: сумма часов ${hours} (ожидалось ${totalHours})`);
  ok(
    topics[0].name === 'Рациональные числа' && sections[0].name === 'Числа и вычисления',
    `${c.name}: кириллица в данных цела («${topics[0]?.name}»)`,
  );
  ok(
    topics[0].content === 'Понятие рационального числа' && topics[0].num === '1.1',
    `${c.name}: необязательные колонки доехали`,
  );
}

// Отдельно: строка заголовков ниже первой — над таблицей стоит подпись.
{
  const withTitle = `Календарно-тематическое планирование\r\n${csvText(';')}`;
  const parsed = parseTable(utf8(withTitle, false).buffer as ArrayBuffer);
  const mapping = autoMapColumns(parsed.headers);
  ok(parsed.headers.length === HEADERS.length, 'заголовок над таблицей: шапка найдена ниже');
  ok(missingRequired(mapping).length === 0, 'заголовок над таблицей: колонки сопоставлены');
}

// Отдельно: книга, переименованная в .csv, — формат по сигнатуре, не по имени.
{
  const parsed = parseTable(xlsxBytes().buffer as ArrayBuffer);
  ok(parsed.encoding === null, 'книга под видом .csv: распознана по сигнатуре');
  ok(parsed.headers[0] === 'Раздел', 'книга под видом .csv: заголовки целы');
}

// Отдельно: латиница в UTF-8 без BOM не должна ошибочно уходить в cp1251.
{
  const ascii = 'Section,No,Topic,Hours\r\nAlgebra,1,Equations,25';
  const parsed = parseTable(utf8(ascii, false).buffer as ArrayBuffer);
  ok(parsed.headers[0] === 'Section', 'ASCII-заголовки читаются как есть');
}

// Отдельно: сам определитель кодировки на голых байтах.
{
  const ru = 'Раздел';
  ok(decodeCsv(utf8(ru, false)).text === ru, 'decodeCsv: UTF-8 без BOM');
  ok(decodeCsv(utf8(ru, true)).text === ru, 'decodeCsv: UTF-8 с BOM');
  ok(decodeCsv(toCp1251(ru)).text === ru, 'decodeCsv: cp1251');
}

console.log(
  `\nпроверено случаев: ${cases.length} + 4 отдельных, ошибок: ${failures}`,
);
process.exit(failures ? 1 : 0);
