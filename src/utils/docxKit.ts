/**
 * Кирпичики документов DOCX, общие для всех выгрузок проекта.
 *
 * Вынесены из docxExport.ts, когда рядом с рабочей программой появился второй
 * документ — календарный учебный график. Второй экземпляр тех же трёх функций
 * означал бы, что шрифт, кегли и рамки таблиц у двух наших документов
 * разъедутся при первой же правке; здесь они одни на всех.
 *
 * Знание о КОНКРЕТНОМ документе сюда не переезжает: `table()` принимает
 * структуру «шапка, строки, доли ширины» и ничего не знает ни про рабочую
 * программу, ни про график.
 */

import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

export const FONT = 'Times New Roman';
export const SIZE_BODY = 28; // 14 pt
export const SIZE_TABLE = 24; // 12 pt
export const SIZE_SMALL = 20; // 10 pt

/** Тонкая рамка по всем сторонам — таблицы ФРП линованы полностью. */
export const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

export const HEAD_FILL = 'F1F5F9';

export interface TextOpts {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  spacing?: { before?: number; after?: number };
  /** Красная строка, в твипах. */
  indent?: number;
}

export function p(text: string, o: TextOpts = {}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: o.bold,
        italics: o.italics,
        font: FONT,
        size: o.size ?? SIZE_BODY,
      }),
    ],
    alignment: o.alignment,
    heading: o.heading,
    spacing: o.spacing ?? { after: 60 },
    indent: o.indent ? { firstLine: o.indent } : undefined,
  });
}

/** Абзацы основного текста: по ширине, с красной строкой — как в ФРП. */
export function body(text: string): Paragraph[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      p(line, {
        alignment: AlignmentType.JUSTIFIED,
        indent: line.startsWith('—') || line.startsWith('-') ? 0 : 709,
      }),
    );
}

export interface CellOpts {
  bold?: boolean;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  width?: number;
  span?: number;
  fill?: string;
  size?: number;
}

export function cell(text: string, o: CellOpts = {}): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: o.bold, font: FONT, size: o.size ?? SIZE_TABLE })],
        alignment: o.align,
        spacing: { after: 0 },
      }),
    ],
    borders: CELL_BORDERS,
    columnSpan: o.span,
    shading: o.fill ? { fill: o.fill } : undefined,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.TOP,
  });
}

/** Ячейка таблицы: текст плюс оформление, общее для всех наших таблиц. */
export interface KitCell {
  text: string;
  bold?: boolean;
  /** `left` — то же, что не задавать: выравнивание по левому краю и так своё. */
  align?: 'center' | 'left';
  span?: number;
}

/** Данные таблицы: шапка, строки и доли ширины колонок (сумма — единица). */
export interface KitTable {
  head: string[];
  rows: KitCell[][];
  widths: number[];
}

export function table(t: KitTable): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: t.head.map((text, i) =>
        cell(text, {
          bold: true,
          align: AlignmentType.CENTER,
          width: Math.round(t.widths[i] * 100),
          fill: HEAD_FILL,
          // Шапка мельче содержимого: «Количество» иначе не помещается
          // в свою колонку и ломается посередине слова.
          size: SIZE_SMALL,
        }),
      ),
    }),
  ];

  for (const row of t.rows) {
    rows.push(
      new TableRow({
        children: row.map((c) =>
          cell(c.text, {
            bold: c.bold,
            align: c.align === 'center' ? AlignmentType.CENTER : undefined,
            span: c.span,
          }),
        ),
      }),
    );
  }

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** Заголовок раздела с новой страницы. */
export function heading(text: string): Paragraph[] {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    p(text, {
      bold: true,
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
    }),
  ];
}
