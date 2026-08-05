import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { type ProgramData } from '../data/program';
import { buildOutline, exportBaseName, type ExportFile, type OutlineTable } from './programOutline';

const FONT = 'Times New Roman';
const SIZE_BODY = 28; // 14 pt
const SIZE_TABLE = 24; // 12 pt
const SIZE_SMALL = 20; // 10 pt

/** Тонкая рамка по всем сторонам — таблицы ФРП линованы полностью. */
const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

interface TextOpts {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  spacing?: { before?: number; after?: number };
  /** Красная строка, в твипах. */
  indent?: number;
}

function p(text: string, o: TextOpts = {}): Paragraph {
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
function body(text: string): Paragraph[] {
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

function heading(text: string): Paragraph[] {
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

function cell(
  text: string,
  o: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number; span?: number; fill?: string; size?: number } = {},
): TableCell {
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

/**
 * Колонки ЭОР/ЦОР в тематическом планировании нет: в редакции ФРП 2025 года
 * она из таблицы убрана (проверено по официальным PDF), а прежний экспорт
 * повторял формат 2023 года.
 */
const HEAD_FILL = 'F1F5F9';

function table(t: OutlineTable): Table {
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

/**
 * Блок согласования — таблица без рамок.
 *
 * Раньше грифы разносились по странице символами табуляции без объявленных
 * позиций табуляции, из-за чего Word расставлял их непредсказуемо. Невидимая
 * таблица держит колонки ровно при любой длине текста.
 */
function approvalBlock(items: { label: string; text: string }[]): Table {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: none, bottom: none, left: none, right: none };
  const width = Math.floor(100 / Math.max(items.length, 1));

  const mk = (text: string, bold: boolean) =>
    new Paragraph({
      children: [new TextRun({ text, bold, font: FONT, size: SIZE_TABLE })],
      spacing: { after: 0 },
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: items.map((it) =>
          new TableCell({
            borders,
            width: { size: width, type: WidthType.PERCENTAGE },
            children: [mk(it.label, true), mk(it.text, false)],
          }),
        ),
      }),
    ],
  });
}

/**
 * Сборка документа отделена от скачивания: saveAs работает только в браузере,
 * а так документ можно собрать и проверить в обычном node-скрипте
 * (tools/verify_docx.ts).
 *
 * Состав и порядок разделов берутся из общей модели (programOutline.ts) —
 * той же, из которой собираются PDF, TXT и Markdown.
 */
export function buildDocument(data: ProgramData): Document {
  const children: (Paragraph | Table)[] = [];

  for (const block of buildOutline(data)) {
    switch (block.kind) {
      case 'cover':
        children.push(
          p(block.text, {
            bold: block.bold,
            alignment: AlignmentType.CENTER,
            size: block.small ? SIZE_TABLE : SIZE_BODY,
          }),
        );
        break;
      case 'approvals':
        children.push(approvalBlock(block.items));
        break;
      case 'space':
        children.push(p('', { spacing: { before: block.size === 'large' ? 900 : 300 } }));
        break;
      case 'pagebreak':
        // Разрыв даёт заголовок следующего раздела: каждый начинается
        // с новой страницы, поэтому отдельный разрыв был бы лишним.
        break;
      case 'heading':
        children.push(...heading(block.text));
        break;
      case 'subheading':
        children.push(p(block.text, { bold: true, spacing: { after: 120 } }));
        break;
      case 'body':
        children.push(...body(block.text));
        break;
      case 'table':
        children.push(table(block.table));
        break;
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${data.subject}${data.grade ? `. ${data.grade} класс` : ''}`,
                    font: FONT,
                    size: SIZE_SMALL,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_SMALL }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export function docxFileName(data: ProgramData): string {
  return `${exportBaseName(data)}.docx`;
}

export async function docxFile(data: ProgramData): Promise<ExportFile> {
  return { blob: await Packer.toBlob(buildDocument(data)), name: docxFileName(data) };
}
