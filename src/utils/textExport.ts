import type { ProgramData } from '../data/program';
import {
  buildOutline,
  exportBaseName,
  paragraphsOf,
  type ExportFile,
  type OutlineBlock,
  type OutlineCell,
  type OutlineTable,
} from './programOutline';

/**
 * Выгрузка программы в простой текст и Markdown.
 *
 * Зачем они рядом с DOCX и PDF: текст и Markdown — единственные форматы,
 * которые читаются без офисного пакета, кладутся в git с осмысленным diff и
 * вставляются в системы, где Word-файл не примут (вики школы, задача в
 * трекере, письмо). Оба собираются из той же модели, что DOCX и PDF, поэтому
 * состав разделов у всех четырёх одинаковый.
 */

/** Строки таблицы, где ячейка занимает несколько колонок, разворачиваются в пустые. */
function expand(row: OutlineCell[], columns: number): string[] {
  const out: string[] = [];
  for (const c of row) {
    out.push(c.text);
    for (let i = 1; i < (c.span ?? 1); i++) out.push('');
  }
  while (out.length < columns) out.push('');
  return out.slice(0, columns);
}

// ===================== простой текст =====================

/**
 * Ширина колонки для текстовой таблицы.
 *
 * Выравнивать колонки по самой длинной ячейке нельзя: в программном
 * содержании попадаются абзацы на тысячу знаков, и строка уезжает за любые
 * разумные пределы. Поэтому длинный текст переносится по словам внутри
 * фиксированной ширины.
 */
const TXT_WIDTH = 100;

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines;
}

function txtTable(t: OutlineTable): string[] {
  const out: string[] = [];
  const columns = t.head.length;

  for (const [i, row] of t.rows.entries()) {
    const cells = expand(row, columns);
    // Строка-заголовок раздела занимает всю ширину — печатается как заголовок,
    // а не как набор «поле: значение» с пятью пустыми полями.
    const filled = cells.filter((c) => c.trim());
    if (filled.length === 1 && cells[0].trim()) {
      out.push('', cells[0].toUpperCase(), '');
      continue;
    }
    if (i) out.push('');
    for (const [j, value] of cells.entries()) {
      if (!value.trim()) continue;
      const label = `${t.head[j]}: `;
      const lines = wrap(value, TXT_WIDTH - label.length);
      out.push(label + lines[0]);
      for (const extra of lines.slice(1)) out.push(' '.repeat(label.length) + extra);
    }
  }
  return out;
}

function txtBlock(block: OutlineBlock): string[] {
  switch (block.kind) {
    case 'cover':
      return block.text ? [block.text] : [];
    case 'approvals':
      return block.items.map((it) => `${it.label}${it.text ? `: ${it.text}` : ''}`);
    case 'space':
      return [''];
    case 'pagebreak':
      return ['', '='.repeat(TXT_WIDTH), ''];
    case 'heading':
      return ['', block.text, '-'.repeat(block.text.length), ''];
    case 'subheading':
      return ['', block.text, ''];
    case 'body':
      return paragraphsOf(block.text).flatMap((line) => [...wrap(line, TXT_WIDTH), '']);
    case 'table':
      return txtTable(block.table);
  }
}

export function programToText(data: ProgramData): string {
  const lines = buildOutline(data).flatMap(txtBlock);
  // Три и более пустых строки подряд — след от отступов титульного листа.
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ===================== Markdown =====================

/** Вертикальная черта и перевод строки ломают строку таблицы Markdown. */
function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

function mdTable(t: OutlineTable): string[] {
  const columns = t.head.length;
  const out: string[] = [
    `| ${t.head.map(mdCell).join(' | ')} |`,
    `|${' --- |'.repeat(columns)}`,
  ];
  for (const row of t.rows) {
    const cells = expand(row, columns).map(mdCell);
    const filled = cells.filter(Boolean);
    // Заголовок раздела растянут на всю строку — в Markdown объединять ячейки
    // нельзя, поэтому он выделяется полужирным в первой колонке.
    if (filled.length === 1 && cells[0]) {
      out.push(`| **${cells[0]}** |${' |'.repeat(columns - 1)}`);
      continue;
    }
    const bold = row.some((c) => c.bold);
    out.push(`| ${cells.map((c) => (bold && c ? `**${c}**` : c)).join(' | ')} |`);
  }
  return out;
}

function mdBlock(block: OutlineBlock): string[] {
  switch (block.kind) {
    case 'cover':
      return block.text ? [block.bold ? `**${block.text}**` : block.text, ''] : [];
    case 'approvals':
      return [...block.items.map((it) => `- **${it.label}**${it.text ? `: ${it.text}` : ''}`), ''];
    case 'space':
      return [];
    case 'pagebreak':
      return ['---', ''];
    case 'heading':
      return [`## ${block.text}`, ''];
    case 'subheading':
      return [`### ${block.text}`, ''];
    case 'body':
      return [...paragraphsOf(block.text).flatMap((line) => [line, '']), ''];
    case 'table':
      return [...mdTable(block.table), ''];
  }
}

export function programToMarkdown(data: ProgramData): string {
  const title = `# Рабочая программа${data.subject ? `: ${data.subject}` : ''}${
    data.grade ? `, ${data.grade} класс` : ''
  }`;
  const lines = [title, '', ...buildOutline(data).flatMap(mdBlock)];
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ===================== файл =====================

function textAsBlob(text: string, mime: string): Blob {
  // BOM нужен, чтобы Windows-приложения (в том числе Блокнот и Excel) не
  // приняли UTF-8 за однобайтовую кодировку и не показали кракозябры.
  return new Blob([`﻿${text}`], { type: `${mime};charset=utf-8` });
}

export function textFile(data: ProgramData): ExportFile {
  return { blob: textAsBlob(programToText(data), 'text/plain'), name: `${exportBaseName(data)}.txt` };
}

export function markdownFile(data: ProgramData): ExportFile {
  return { blob: textAsBlob(programToMarkdown(data), 'text/markdown'), name: `${exportBaseName(data)}.md` };
}
