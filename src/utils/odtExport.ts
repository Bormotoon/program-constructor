import { strToU8, zipSync } from 'fflate';
import { saveAs } from 'file-saver';
import type { ProgramData } from '../data/program';
import {
  buildOutline,
  exportBaseName,
  paragraphsOf,
  type OutlineCell,
  type OutlineTable,
} from './programOutline';

/**
 * Выгрузка программы в ODT (OpenDocument Text).
 *
 * Нужен там, где вместо Microsoft Office стоят LibreOffice, «Р7-Офис» или
 * «МойОфис»: DOCX они открывают, но со своим пониманием разметки, а ODT —
 * их родной формат, и таблица планирования в нём не разъедется.
 *
 * Файл собирается вручную, без библиотеки: ODT — это zip с несколькими
 * XML-файлами, и генератора, который стоило бы тащить в бандл ради этого, нет.
 * Разметка получается на пару сотен строк, зато без чужих зависимостей и с
 * полным контролем над стилями.
 *
 * Состав разделов берётся из общей модели (programOutline.ts) — той же, из
 * которой собираются DOCX, PDF, TXT и Markdown. Оттуда же берутся ширины
 * колонок — они подобраны под длину заголовков и одинаковы во всех форматах.
 */

const MIME = 'application/vnd.oasis.opendocument.text';

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
].join(' ');

/** Ширина текстовой колонки страницы A4 с полями 30/15 мм. */
const CONTENT_WIDTH_CM = 16.5;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Абзац ODT. Переводы строк внутри ячейки становятся отдельными абзацами:
 * <text:line-break/> в ячейке таблицы ведёт себя по-разному в разных
 * редакторах, а несколько абзацев — везде одинаково.
 */
function p(style: string, text: string): string {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return `<text:p text:style-name="${style}"/>`;
  return lines.map((l) => `<text:p text:style-name="${style}">${esc(l.trim())}</text:p>`).join('');
}

function tableCell(cell: OutlineCell, style: string, paragraphStyle?: string): string {
  const span = cell.span ?? 1;
  const attrs = span > 1 ? ` table:number-columns-spanned="${span}"` : '';
  // Объединённые ячейки в ODT занимают своё место «пустышками» — без них
  // редакторы считают строку короче и таблица едет.
  const covered = '<table:covered-table-cell/>'.repeat(span - 1);
  return (
    `<table:table-cell table:style-name="${style}" office:value-type="string"${attrs}>` +
    p(paragraphStyle ?? cellParagraphStyle(cell), cell.text) +
    `</table:table-cell>${covered}`
  );
}

function cellParagraphStyle(cell: OutlineCell): string {
  if (cell.bold) return cell.align === 'center' ? 'CellBoldCenter' : 'CellBold';
  return cell.align === 'center' ? 'CellCenter' : 'Cell';
}

function table(t: OutlineTable, index: number): string {
  const name = `Tab${index}`;
  const widths = t.widths;
  const columns = widths
    .map((_, i) => `<table:table-column table:style-name="${name}.C${i}"/>`)
    .join('');

  const head =
    '<table:table-header-rows><table:table-row>' +
    t.head.map((h) => tableCell({ text: h, bold: true, align: 'center' }, 'CellHead', 'HeadCell')).join('') +
    '</table:table-row></table:table-header-rows>';

  const body = t.rows
    .map((row) => {
      const used = row.reduce((a, c) => a + (c.span ?? 1), 0);
      const cells = row.map((c) => tableCell(c, 'CellBox')).join('');
      // Хвост добивается пустыми ячейками: строка обязана иметь полный набор.
      const tail =
        used < widths.length
          ? tableCell({ text: '', span: widths.length - used }, 'CellBox')
          : '';
      return `<table:table-row>${cells}${tail}</table:table-row>`;
    })
    .join('');

  return `<table:table table:name="${name}" table:style-name="${name}">${columns}${head}${body}</table:table>`;
}

/** Стили колонок и самих таблиц зависят от их числа, поэтому строятся по факту. */
function tableStyles(tables: OutlineTable[]): string {
  return tables
    .map((t, i) => {
      const name = `Tab${i}`;
      const columns = t.widths
        .map(
          (w, c) =>
            `<style:style style:name="${name}.C${c}" style:family="table-column">` +
            `<style:table-column-properties style:column-width="${(w * CONTENT_WIDTH_CM).toFixed(3)}cm"/>` +
            '</style:style>',
        )
        .join('');
      return (
        `<style:style style:name="${name}" style:family="table">` +
        `<style:table-properties style:width="${CONTENT_WIDTH_CM}cm" table:align="margins"/>` +
        `</style:style>${columns}`
      );
    })
    .join('');
}

const PARAGRAPH_STYLES = `
<style:style style:name="Cover" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
</style:style>
<style:style style:name="CoverBold" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-weight="bold"/>
</style:style>
<style:style style:name="CoverSmall" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="12pt"/>
</style:style>
<style:style style:name="CoverSmallBold" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="12pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="Gap" style:family="paragraph">
  <style:paragraph-properties fo:margin-top="1.2cm"/>
</style:style>
<style:style style:name="Head" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center" fo:break-before="page" fo:margin-bottom="0.4cm"/>
  <style:text-properties fo:font-weight="bold"/>
</style:style>
<style:style style:name="Sub" style:family="paragraph">
  <style:paragraph-properties fo:margin-bottom="0.2cm"/>
  <style:text-properties fo:font-weight="bold"/>
</style:style>
<style:style style:name="Body" style:family="paragraph">
  <style:paragraph-properties fo:text-align="justify" fo:text-indent="1.25cm"/>
</style:style>
<style:style style:name="BodyItem" style:family="paragraph">
  <style:paragraph-properties fo:text-align="justify"/>
</style:style>
<style:style style:name="Cell" style:family="paragraph">
  <style:text-properties fo:font-size="12pt"/>
</style:style>
<style:style style:name="CellCenter" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="12pt"/>
</style:style>
<style:style style:name="CellBold" style:family="paragraph">
  <style:text-properties fo:font-size="12pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="CellBoldCenter" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="12pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="HeadCell" style:family="paragraph">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="10pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="CellBox" style:family="table-cell">
  <style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.1cm"
    style:vertical-align="top"/>
</style:style>
<style:style style:name="CellHead" style:family="table-cell">
  <style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.1cm"
    fo:background-color="#f1f5f9" style:vertical-align="middle"/>
</style:style>
<style:style style:name="Plain" style:family="table-cell">
  <style:table-cell-properties fo:padding="0.1cm" style:vertical-align="top"/>
</style:style>`;

/** Блок грифов — таблица без рамок, как в DOCX: табуляции разъезжаются. */
function approvals(items: { label: string; text: string }[]): { styles: string; body: string } {
  const width = (CONTENT_WIDTH_CM / Math.max(items.length, 1)).toFixed(3);
  const columns = items
    .map(
      (_, i) =>
        `<style:style style:name="Appr.C${i}" style:family="table-column">` +
        `<style:table-column-properties style:column-width="${width}cm"/></style:style>`,
    )
    .join('');
  const cells = items
    .map(
      (it) =>
        '<table:table-cell table:style-name="Plain" office:value-type="string">' +
        p('CellBold', it.label) +
        p('Cell', it.text) +
        '</table:table-cell>',
    )
    .join('');
  return {
    styles:
      '<style:style style:name="Appr" style:family="table">' +
      `<style:table-properties style:width="${CONTENT_WIDTH_CM}cm" table:align="margins"/>` +
      `</style:style>${columns}`,
    body:
      '<table:table table:name="Appr" table:style-name="Appr">' +
      items.map((_, i) => `<table:table-column table:style-name="Appr.C${i}"/>`).join('') +
      `<table:table-row>${cells}</table:table-row></table:table>`,
  };
}

function contentXml(data: ProgramData): string {
  const blocks = buildOutline(data);
  const tables = blocks.flatMap((b) => (b.kind === 'table' ? [b.table] : []));

  let extraStyles = '';
  let tableIndex = 0;
  const body = blocks
    .map((block) => {
      switch (block.kind) {
        case 'cover': {
          if (!block.text) return '';
          const style = block.small
            ? block.bold
              ? 'CoverSmallBold'
              : 'CoverSmall'
            : block.bold
              ? 'CoverBold'
              : 'Cover';
          return p(style, block.text);
        }
        case 'approvals': {
          const built = approvals(block.items);
          extraStyles += built.styles;
          return built.body;
        }
        case 'space':
          return '<text:p text:style-name="Gap"/>';
        case 'pagebreak':
          // Разрыв даёт заголовок следующего раздела (fo:break-before).
          return '';
        case 'heading':
          return p('Head', block.text);
        case 'subheading':
          return p('Sub', block.text);
        case 'body':
          return paragraphsOf(block.text)
            .map((line) =>
              p(line.startsWith('—') || line.startsWith('-') ? 'BodyItem' : 'Body', line),
            )
            .join('');
        case 'table':
          return table(block.table, tableIndex++);
      }
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-content ${NS} office:version="1.3">` +
    `<office:automatic-styles>${PARAGRAPH_STYLES}${extraStyles}${tableStyles(tables)}</office:automatic-styles>` +
    `<office:body><office:text>${body}</office:text></office:body>` +
    '</office:document-content>'
  );
}

function stylesXml(data: ProgramData): string {
  const title = `${data.subject}${data.grade ? `. ${data.grade} класс` : ''}`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-styles ${NS} office:version="1.3">` +
    '<office:styles>' +
    // Шрифт и кегль всего документа задаются стилем по умолчанию: рабочие
    // программы набирают Times New Roman 14 pt.
    '<style:default-style style:family="paragraph">' +
    '<style:text-properties style:font-name="Times New Roman" fo:font-size="14pt" fo:language="ru" fo:country="RU"/>' +
    '<style:paragraph-properties fo:line-height="100%"/>' +
    '</style:default-style>' +
    '<style:style style:name="Standard" style:family="paragraph"/>' +
    '<style:style style:name="Running" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="end"/>' +
    '<style:text-properties fo:font-size="10pt" fo:font-style="italic"/>' +
    '</style:style>' +
    '<style:style style:name="PageNo" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-size="10pt"/>' +
    '</style:style>' +
    '</office:styles>' +
    '<office:automatic-styles>' +
    '<style:page-layout style:name="PL">' +
    '<style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"' +
    ' style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm"' +
    ' fo:margin-left="3cm" fo:margin-right="1.5cm"/>' +
    '<style:header-style><style:header-footer-properties fo:margin-bottom="0.5cm"/></style:header-style>' +
    '<style:footer-style><style:header-footer-properties fo:margin-top="0.5cm"/></style:footer-style>' +
    '</style:page-layout>' +
    '</office:automatic-styles>' +
    '<office:master-styles>' +
    '<style:master-page style:name="Standard" style:page-layout-name="PL">' +
    `<style:header><text:p text:style-name="Running">${esc(title)}</text:p></style:header>` +
    '<style:footer><text:p text:style-name="PageNo"><text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>' +
    '</style:master-page>' +
    '</office:master-styles>' +
    '</office:document-styles>'
  );
}

const MANIFEST =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
  `<manifest:file-entry manifest:full-path="/" manifest:media-type="${MIME}"/>` +
  '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
  '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
  '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>' +
  '</manifest:manifest>';

function metaXml(data: ProgramData): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3">' +
    '<office:meta>' +
    `<dc:title>Рабочая программа. ${esc(data.subject)}${data.grade ? esc(`. ${data.grade} класс`) : ''}</dc:title>` +
    `<meta:initial-creator>${esc(data.teacherName || '')}</meta:initial-creator>` +
    '<meta:generator>Конструктор рабочих программ</meta:generator>' +
    '</office:meta></office:document-meta>'
  );
}

export function buildOdt(data: ProgramData): Uint8Array {
  // mimetype обязан лежать первым и БЕЗ сжатия — по нему формат опознают
  // до распаковки. Со сжатием файл открывается не везде.
  return zipSync(
    {
      mimetype: [strToU8(MIME), { level: 0 }],
      'META-INF/manifest.xml': strToU8(MANIFEST),
      'content.xml': strToU8(contentXml(data)),
      'styles.xml': strToU8(stylesXml(data)),
      'meta.xml': strToU8(metaXml(data)),
    },
    { level: 6 },
  );
}

export function odtFileName(data: ProgramData): string {
  return `${exportBaseName(data)}.odt`;
}

export function exportToOdt(data: ProgramData): void {
  saveAs(new Blob([buildOdt(data) as BlobPart], { type: MIME }), odtFileName(data));
}
