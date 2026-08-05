import { APPROVAL_LABELS, type ProgramData } from '../data/program';
import { planHours, sectionHours } from '../data/thematicPlan';

/**
 * Структура рабочей программы, не зависящая от формата выгрузки.
 *
 * Программа выгружается в DOCX, ODT, PDF, TXT и Markdown. Если каждый формат
 * будет знать состав и порядок разделов сам, они разъедутся при первой же
 * правке: добавили раздел в DOCX — в PDF его нет. Поэтому состав документа
 * описан здесь один раз, а форматы отвечают только за оформление.
 *
 * Модель намеренно бедная — заголовок, абзацы, таблица. Всё, что специфично
 * для формата (единицы измерения, заливка ячеек, разрывы страниц), остаётся
 * в самих выгрузках и задаётся по виду блока.
 */

export interface OutlineCell {
  text: string;
  bold?: boolean;
  align?: 'left' | 'center';
  /** Сколько колонок занимает ячейка. */
  span?: number;
}

export interface OutlineTable {
  id: 'thematic' | 'lessons';
  head: string[];
  rows: OutlineCell[][];
  /** Доли ширины колонок; сумма равна единице. */
  widths: number[];
}

/**
 * Ширины колонок — свойство документа, а не формата, поэтому лежат здесь.
 *
 * Подобраны по ширине самого длинного слова в заголовке колонки, измеренной
 * по метрикам Times New Roman в 10 pt плюс поля ячейки. Иначе редактор ломает
 * слово посередине: колонка часов в 0,11 ширины давала «Количест/во», а
 * в 0,08 — вовсе «Коли/честв/о». В DOCX это было почти незаметно, в ODT и PDF
 * бросалось в глаза сразу.
 */
const WIDTHS: Record<OutlineTable['id'], number[]> = {
  thematic: [0.05, 0.21, 0.14, 0.3, 0.3],
  lessons: [0.08, 0.33, 0.14, 0.16, 0.17, 0.12],
};

export type OutlineBlock =
  /** Строка титульного листа по центру. */
  | { kind: 'cover'; text: string; bold?: boolean; small?: boolean }
  /** Блок грифов согласования: колонки «Рассмотрено», «Согласовано», «Утверждено». */
  | { kind: 'approvals'; items: { label: string; text: string }[] }
  /** Вертикальный отступ на титульном листе. */
  | { kind: 'space'; size: 'small' | 'large' }
  /** Конец титульного листа. */
  | { kind: 'pagebreak' }
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  /** Абзацы, разделённые переводами строк. */
  | { kind: 'body'; text: string }
  | { kind: 'table'; table: OutlineTable };

const APPROVAL_TEXT = (data: ProgramData): Record<string, string> => ({
  reviewed: data.reviewedBy,
  agreed: data.agreedBy,
  approved: data.approvedBy,
});

/** Строка «Итого»/«ОБЩЕЕ КОЛИЧЕСТВО» — подпись слева на две колонки, число, пустой хвост. */
function totalRow(label: string, value: string, tail: number): OutlineCell[] {
  return [
    { text: label, bold: true, span: 2 },
    { text: value, bold: true, align: 'center' },
    ...(tail > 0 ? [{ text: '', span: tail }] : []),
  ];
}

function thematicTable(data: ProgramData): OutlineTable {
  const rows: OutlineCell[][] = [];

  for (const s of data.thematicPlan) {
    if (s.name) {
      rows.push([{ text: s.name, bold: true, span: 5 }]);
    }
    for (const t of s.topics) {
      rows.push([
        { text: t.num, align: 'center' },
        { text: t.name },
        { text: String(t.hours), align: 'center' },
        { text: t.content },
        { text: t.activity },
      ]);
    }
    rows.push(totalRow('Итого по разделу', String(sectionHours(s)), 2));
  }

  rows.push(totalRow('ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ', String(planHours(data.thematicPlan)), 2));

  return {
    id: 'thematic',
    widths: WIDTHS.thematic,
    head: [
      '№ п/п',
      'Наименование разделов и тем учебного предмета',
      'Количество часов',
      'Программное содержание',
      'Основные виды деятельности обучающихся',
    ],
    rows,
  };
}

function lessonTable(data: ProgramData): OutlineTable {
  const rows: OutlineCell[][] = data.lessonPlan.map((l) => [
    { text: String(l.number), align: 'center' },
    { text: l.topic },
    { text: String(l.hours), align: 'center' },
    { text: l.control ? String(l.control) : '', align: 'center' },
    { text: l.practice ? String(l.practice) : '', align: 'center' },
    { text: l.date, align: 'center' },
  ]);

  const sum = (f: (l: ProgramData['lessonPlan'][number]) => number) =>
    data.lessonPlan.reduce((a, l) => a + (Number(f(l)) || 0), 0);

  rows.push([
    { text: 'ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ', bold: true, span: 2 },
    { text: String(sum((l) => l.hours)), bold: true, align: 'center' },
    { text: String(sum((l) => l.control)), bold: true, align: 'center' },
    { text: String(sum((l) => l.practice)), bold: true, align: 'center' },
    { text: '' },
  ]);

  return {
    id: 'lessons',
    widths: WIDTHS.lessons,
    head: [
      '№ урока',
      'Тема урока',
      'Количество часов',
      'Контрольные работы',
      'Практические работы',
      'Дата изучения',
    ],
    rows,
  };
}

/** Состав и порядок разделов рабочей программы — единственный на все выгрузки. */
export function buildOutline(data: ProgramData): OutlineBlock[] {
  const out: OutlineBlock[] = [];
  const texts = APPROVAL_TEXT(data);

  // ===== Титульный лист =====
  if (data.regionalAuthority) out.push({ kind: 'cover', text: data.regionalAuthority, small: true });
  if (data.founder) out.push({ kind: 'cover', text: data.founder, small: true });
  out.push({ kind: 'cover', text: data.schoolName || '', bold: true });
  out.push({
    kind: 'approvals',
    items: data.approvals.map((k) => ({ label: APPROVAL_LABELS[k], text: texts[k] || '' })),
  });
  out.push({ kind: 'space', size: 'large' });
  out.push({ kind: 'cover', text: 'РАБОЧАЯ ПРОГРАММА', bold: true });
  out.push({ kind: 'cover', text: `учебного предмета «${data.subject || '____________'}»` });
  if (data.variant) out.push({ kind: 'cover', text: `(${data.variant} уровень)` });
  out.push({ kind: 'cover', text: `для ${data.grade ? `${data.grade} класса` : '____ класса'}` });
  out.push({ kind: 'cover', text: `уровень образования: ${data.educationLevel}` });
  out.push({ kind: 'space', size: 'large' });
  out.push({ kind: 'cover', text: 'Составитель:', bold: true, small: true });
  out.push({ kind: 'cover', text: data.teacherName || '', small: true });
  out.push({ kind: 'space', size: 'large' });
  out.push({
    kind: 'cover',
    text: `${data.locality}${data.locality && data.year ? ', ' : ''}${data.year}`,
  });
  out.push({ kind: 'cover', text: `${data.academicYear} учебный год` });
  out.push({ kind: 'pagebreak' });

  // ===== Пояснительная записка =====
  out.push({ kind: 'heading', text: 'ПОЯСНИТЕЛЬНАЯ ЗАПИСКА' });
  if (data.normativeBase) out.push({ kind: 'body', text: data.normativeBase });

  // ===== Содержание обучения =====
  if (data.subjectContent) {
    out.push({ kind: 'heading', text: 'СОДЕРЖАНИЕ ОБУЧЕНИЯ' });
    out.push({ kind: 'body', text: data.subjectContent });
  }

  // ===== Планируемые результаты =====
  out.push({ kind: 'heading', text: 'ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ ОСВОЕНИЯ ПРОГРАММЫ' });
  if (data.personalResults) {
    out.push({ kind: 'subheading', text: 'ЛИЧНОСТНЫЕ РЕЗУЛЬТАТЫ' });
    out.push({ kind: 'body', text: data.personalResults });
  }
  if (data.metaResults) {
    out.push({ kind: 'subheading', text: 'МЕТАПРЕДМЕТНЫЕ РЕЗУЛЬТАТЫ' });
    out.push({ kind: 'body', text: data.metaResults });
  }
  if (data.subjectResults) {
    out.push({ kind: 'subheading', text: 'ПРЕДМЕТНЫЕ РЕЗУЛЬТАТЫ' });
    out.push({ kind: 'body', text: data.subjectResults });
  }

  // ===== Тематическое планирование =====
  if (data.thematicPlan.length) {
    out.push({ kind: 'heading', text: 'ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ' });
    out.push({ kind: 'subheading', text: `${data.grade} КЛАСС` });
    out.push({ kind: 'table', table: thematicTable(data) });
  }

  // ===== Поурочное планирование =====
  if (data.lessonPlan.length) {
    out.push({ kind: 'heading', text: 'ПОУРОЧНОЕ ПЛАНИРОВАНИЕ' });
    out.push({ kind: 'subheading', text: `${data.grade} КЛАСС` });
    out.push({ kind: 'table', table: lessonTable(data) });
  }

  // ===== УМК =====
  if (data.methodologicalSupport) {
    out.push({ kind: 'heading', text: 'УЧЕБНО-МЕТОДИЧЕСКОЕ ОБЕСПЕЧЕНИЕ ОБРАЗОВАТЕЛЬНОГО ПРОЦЕССА' });
    out.push({ kind: 'body', text: data.methodologicalSupport });
  }

  return out;
}

/** Абзацы блока текста: пустые строки отбрасываются, пробелы подрезаются. */
export function paragraphsOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Готовый файл выгрузки.
 *
 * Сборщики форматов возвращают именно пару «содержимое + имя», а не скачивают
 * сами: тот же файл уходит и в загрузку, и письмом на почту (ExportMenu), и
 * решать его судьбу должен вызывающий, а не сборщик.
 */
export interface ExportFile {
  blob: Blob;
  name: string;
}

/** Имя файла выгрузки без расширения. */
export function exportBaseName(data: ProgramData): string {
  const sanitize = (s: string) => s.replace(/[^а-яА-ЯёЁa-zA-Z0-9_-]/g, '_').substring(0, 50);
  return `rabochaya_programma_${sanitize(data.subject || 'predmet')}_${sanitize(data.grade || 'x')}_klass`;
}
