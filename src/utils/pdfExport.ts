import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProgramData } from '../data/program';
import { bold as FONT_BOLD, regular as FONT_REGULAR } from '../assets/fonts/liberationSerif';
import {
  buildOutline,
  exportBaseName,
  paragraphsOf,
  type ExportFile,
  type OutlineCell,
  type OutlineTable,
} from './programOutline';

/**
 * Выгрузка программы в PDF.
 *
 * PDF собирается прямо в браузере, без сервера и без диалога печати: учителю
 * нужен файл, который можно приложить к письму или сдать завучу, а «Печать →
 * Сохранить как PDF» даёт файл с произвольным именем и зависит от браузера.
 *
 * Шрифт приходится встраивать: стандартные шрифты PDF не содержат кириллицы.
 * Взят Liberation Serif — он метрически совместим с Times New Roman, которым
 * набраны рабочие программы, и распространяется под SIL OFL. В приложение
 * попадает не весь шрифт, а подмножество нужных символов
 * (tools/build_pdf_fonts.py): 173 КБ вместо 1,1 МБ на три начертания.
 *
 * Модуль грузится по требованию — вся эта тяжесть не попадает в стартовый
 * бандл и появляется только когда учитель нажал «PDF».
 */

const FONT = 'LiberationSerif';
const PAGE = { width: 210, height: 297 };
// Поля по ГОСТ 7.32 и сложившейся практике оформления программ: слева шире
// под подшивку.
const MARGIN = { top: 20, bottom: 20, left: 30, right: 15 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
// Центр текстовой колонки, а не страницы: поля асимметричные (слева шире под
// подшивку), и центрирование по странице уводило заголовки влево от текста.
const CENTER = MARGIN.left + CONTENT_WIDTH / 2;

const SIZE_BODY = 14;
const SIZE_TABLE = 9;
const SIZE_SMALL = 12;
const SIZE_FOOTER = 10;
/** Межстрочный коэффициент: 14 pt при одинарном интервале — примерно 5 мм. */
const LINE = 0.42;

interface Cursor {
  doc: jsPDF;
  y: number;
}

function lineHeight(size: number): number {
  return size * LINE;
}

/** Перевод на новую страницу, если очередной блок высотой h не помещается. */
function ensure(c: Cursor, h: number): void {
  if (c.y + h > PAGE.height - MARGIN.bottom) {
    c.doc.addPage();
    c.y = MARGIN.top;
  }
}

/**
 * Разбивка абзаца на строки с учётом красной строки.
 *
 * Укорочена только ПЕРВАЯ строка: если разбивать весь абзац по укороченной
 * ширине, вся колонка становится уже отступа, и текст не доходит до правого
 * поля на всех строках, а не только на первой.
 */
function layout(doc: jsPDF, text: string, indent: number): string[] {
  if (!indent) return doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  const [first] = doc.splitTextToSize(text, CONTENT_WIDTH - indent) as string[];
  const rest = text.slice(first.length).trimStart();
  return rest ? [first, ...(doc.splitTextToSize(rest, CONTENT_WIDTH) as string[])] : [first];
}

/**
 * Строка, выключенная по ширине: слова расставляются по местам вручную.
 *
 * Встроенное выравнивание jsPDF работает только на массиве строк, который он
 * разбил сам, и не сочетается с красной строкой — все строки массива он рисует
 * от одного левого края. Поэтому промежутки считаются здесь: так и отступ
 * первой строки сохраняется, и перенос на новую страницу остаётся под
 * контролем.
 */
function justifyLine(doc: jsPDF, line: string, x: number, y: number, width: number): void {
  const words = line.split(' ').filter(Boolean);
  if (words.length < 2) {
    doc.text(line, x, y);
    return;
  }
  const textWidth = words.reduce((a, w) => a + doc.getTextWidth(w), 0);
  const gap = (width - textWidth) / (words.length - 1);
  // Растягивать втрое против обычного пробела — уже дыры в строке; такую
  // строку честнее оставить как есть.
  if (gap > doc.getTextWidth(' ') * 3) {
    doc.text(line, x, y);
    return;
  }
  let at = x;
  for (const word of words) {
    doc.text(word, at, y);
    at += doc.getTextWidth(word) + gap;
  }
}

function write(
  c: Cursor,
  text: string,
  o: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'justify'; indent?: number } = {},
): void {
  const size = o.size ?? SIZE_BODY;
  c.doc.setFont(FONT, o.bold ? 'bold' : 'normal');
  c.doc.setFontSize(size);

  const indent = o.indent ?? 0;
  const lines = layout(c.doc, text, o.align === 'justify' ? indent : 0);
  const h = lineHeight(size);

  for (const [i, line] of lines.entries()) {
    ensure(c, h);
    // Шрифт и кегль сбрасываются при переносе страницы в autoTable, поэтому
    // задаются перед каждой строкой — дешевле, чем ловить рассинхронизацию.
    c.doc.setFont(FONT, o.bold ? 'bold' : 'normal');
    c.doc.setFontSize(size);

    if (o.align === 'center') {
      c.doc.text(line, CENTER, c.y, { align: 'center' });
    } else {
      const offset = i === 0 ? indent : 0;
      const x = MARGIN.left + offset;
      // Последняя строка абзаца по ширине не растягивается — иначе короткий
      // хвост разъезжается на всю колонку.
      if (o.align === 'justify' && i < lines.length - 1) {
        justifyLine(c.doc, line, x, c.y, CONTENT_WIDTH - offset);
      } else {
        c.doc.text(line, x, c.y);
      }
    }
    c.y += h;
  }
}

/** Ячейки со span разворачиваются: autoTable ждёт полный набор колонок. */
function toRow(row: OutlineCell[], columns: number) {
  const out = row.map((cell) => ({
    content: cell.text,
    colSpan: cell.span,
    styles: {
      fontStyle: (cell.bold ? 'bold' : 'normal') as 'bold' | 'normal',
      halign: (cell.align === 'center' ? 'center' : 'left') as 'center' | 'left',
    },
  }));
  const used = row.reduce((a, c) => a + (c.span ?? 1), 0);
  if (used < columns) {
    out.push({
      content: '',
      colSpan: columns - used,
      styles: { fontStyle: 'normal', halign: 'left' },
    });
  }
  return out;
}

function drawTable(c: Cursor, t: OutlineTable): void {
  const columns = t.head.length;

  autoTable(c.doc, {
    startY: c.y,
    head: [t.head],
    body: t.rows.map((row) => toRow(row, columns)),
    margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top, bottom: MARGIN.bottom },
    styles: {
      font: FONT,
      fontSize: SIZE_TABLE,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: { font: FONT, fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' },
    // Шапка повторяется на каждой странице: таблица планирования занимает
    // десятки страниц, и без этого понять колонки на 20-й невозможно.
    rowPageBreak: 'auto',
    columnStyles: Object.fromEntries(
      t.widths.map((w, i) => [i, { cellWidth: w * CONTENT_WIDTH }]),
    ),
  });

  const after = (c.doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  c.y = (after?.finalY ?? c.y) + 4;
}

/** Колонтитулы проставляются в конце: раньше общее число страниц неизвестно. */
function addRunningTitles(doc: jsPDF, data: ProgramData): void {
  const title = `${data.subject}${data.grade ? `. ${data.grade} класс` : ''}`;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'italic');
    doc.setFontSize(SIZE_FOOTER);
    doc.setTextColor(0, 0, 0);
    // На титульном листе колонтитулов нет — как в оформлении программ.
    if (i > 1) {
      doc.text(title, PAGE.width - MARGIN.right, MARGIN.top / 2, { align: 'right' });
      doc.setFont(FONT, 'normal');
      doc.text(String(i), CENTER, PAGE.height - MARGIN.bottom / 2, { align: 'center' });
    }
  }
}

export function buildPdf(data: ProgramData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('LiberationSerif-Regular.ttf', FONT_REGULAR);
  doc.addFont('LiberationSerif-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('LiberationSerif-Bold.ttf', FONT_BOLD);
  doc.addFont('LiberationSerif-Bold.ttf', FONT, 'bold');
  // Курсив используется только в колонтитуле; отдельное начертание ради него
  // не грузим — жирное в наклон не превратить, но и разницы там не видно.
  doc.addFont('LiberationSerif-Regular.ttf', FONT, 'italic');
  doc.setLanguage('ru');
  doc.setProperties({
    title: `Рабочая программа. ${data.subject}${data.grade ? `. ${data.grade} класс` : ''}`,
    author: data.teacherName || '',
    creator: 'Конструктор рабочих программ',
  });

  const c: Cursor = { doc, y: MARGIN.top };

  for (const block of buildOutline(data)) {
    switch (block.kind) {
      case 'cover':
        if (block.text) {
          write(c, block.text, {
            bold: block.bold,
            align: 'center',
            size: block.small ? SIZE_SMALL : SIZE_BODY,
          });
        }
        break;
      case 'approvals': {
        // Грифы стоят в ряд по ширине страницы, как в таблице без рамок.
        const width = CONTENT_WIDTH / Math.max(block.items.length, 1);
        const top = c.y;
        let bottom = c.y;
        for (const [i, it] of block.items.entries()) {
          const x = MARGIN.left + i * width;
          doc.setFontSize(SIZE_SMALL);
          doc.setFont(FONT, 'bold');
          doc.text(it.label, x, top);
          doc.setFont(FONT, 'normal');
          const lines = doc.splitTextToSize(it.text, width - 4) as string[];
          let y = top + lineHeight(SIZE_SMALL);
          for (const line of lines) {
            doc.text(line, x, y);
            y += lineHeight(SIZE_SMALL);
          }
          bottom = Math.max(bottom, y);
        }
        c.y = bottom;
        break;
      }
      case 'space':
        c.y += block.size === 'large' ? 16 : 6;
        break;
      case 'pagebreak':
        doc.addPage();
        c.y = MARGIN.top;
        break;
      case 'heading':
        // Каждый раздел с новой страницы — так же, как в DOCX.
        if (c.y > MARGIN.top) {
          doc.addPage();
          c.y = MARGIN.top;
        }
        write(c, block.text, { bold: true, align: 'center' });
        c.y += 3;
        break;
      case 'subheading':
        ensure(c, lineHeight(SIZE_BODY) * 2);
        write(c, block.text, { bold: true });
        c.y += 2;
        break;
      case 'body':
        for (const line of paragraphsOf(block.text)) {
          write(c, line, {
            align: 'justify',
            // Красная строка есть у обычных абзацев, но не у пунктов списка.
            indent: line.startsWith('—') || line.startsWith('-') ? 0 : 12.5,
          });
        }
        c.y += 2;
        break;
      case 'table':
        drawTable(c, block.table);
        break;
    }
  }

  addRunningTitles(doc, data);
  return doc;
}

export function pdfFileName(data: ProgramData): string {
  return `${exportBaseName(data)}.pdf`;
}

export function pdfFile(data: ProgramData): ExportFile {
  return { blob: buildPdf(data).output('blob'), name: pdfFileName(data) };
}
