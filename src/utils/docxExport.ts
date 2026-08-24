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
import { buildOutline, exportBaseName, type ExportFile } from './programOutline';
import {
  CELL_BORDERS,
  FONT,
  SIZE_BODY,
  SIZE_SMALL,
  SIZE_TABLE,
  body,
  cell,
  heading,
  p,
  table,
} from './docxKit';

/*
 * Кирпичики документа (шрифт, кегли, абзацы, ячейки, таблицы) вынесены в
 * docxKit.ts: рядом появился второй документ — календарный учебный график, и
 * второй экземпляр тех же функций означал бы, что оформление двух наших
 * документов разъедется при первой правке.
 */

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
