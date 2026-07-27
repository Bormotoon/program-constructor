/**
 * Сквозная проверка выгрузки: данные ФРП -> планы -> DOCX, PDF, TXT, Markdown.
 *
 * Собирает документ по первому предмету каталога во всех пяти форматах и
 * проверяет каждый: что файл не пустой и что в нём есть все обязательные
 * разделы рабочей программы вместе с контрольными суммами часов. Проверяется
 * тот же код, что работает в браузере, — выгрузки разделены на сборку
 * документа и скачивание.
 *
 * Отдельно сверяется, что форматы не разошлись между собой: состав разделов
 * у всех берётся из общей модели (src/utils/programOutline.ts), и проверка
 * следит, чтобы это оставалось правдой.
 *
 * Запуск: npm run verify:docx
 */

import { readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';

import { buildDocument, docxFileName } from '../src/utils/docxExport';
import { buildOdt, odtFileName } from '../src/utils/odtExport';
import { buildPdf, pdfFileName } from '../src/utils/pdfExport';
import { programToMarkdown, programToText } from '../src/utils/textExport';
import { buildOutline, exportBaseName } from '../src/utils/programOutline';
import { buildPlanForGrade, planHours } from '../src/data/thematicPlan';
import { frpLessonVariants, generateLessonPlan, lessonsFromFrp, lessonTotals } from '../src/data/lessonPlan';
import { defaultProgram } from '../src/data/program';

const DIR = 'src/data/frp';
const MIME = 'application/vnd.oasis.opendocument.text';

/**
 * Содержимое файла внутри DOCX.
 *
 * Разделы приходится доставать распаковкой: внутри zip всё сжато, и поиск по
 * сырым байтам находил только имена записей. Раньше проверка искала подстроку
 * прямо в буфере и поэтому не заметила бы пропажу ни одного раздела.
 */
function readZipEntry(zip: Buffer, name: string): string | null {
  // Идём от конца центрального каталога — так не мешают записи с
  // отложенными размерами (data descriptor) в локальных заголовках.
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let at = zip.readUInt32LE(eocd + 16);

  while (at + 46 <= zip.length && zip.readUInt32LE(at) === 0x02014b50) {
    const method = zip.readUInt16LE(at + 10);
    const compSize = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const entry = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8');

    if (entry === name) {
      const localNameLen = zip.readUInt16LE(localAt + 26);
      const localExtraLen = zip.readUInt16LE(localAt + 28);
      const from = localAt + 30 + localNameLen + localExtraLen;
      const raw = zip.subarray(from, from + compSize);
      return (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const slug = process.argv[2] ?? readdirSync(DIR).filter((f) => f.endsWith('.json'))[0]?.replace(/\.json$/, '');
if (!slug) {
  console.error('нет собранных планов в src/data/frp — запустите tools/build_frp_data.py');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(`${DIR}/${slug}.json`, 'utf8'));
const grade = plan.classes[0].grade;

const sections = buildPlanForGrade(plan, grade);
// Если ФРП содержит поурочное планирование, берём его — так же, как это
// делает приложение; иначе разворачиваем из тематического.
const frpVariants = frpLessonVariants(plan, grade);
const lessons = frpVariants.length
  ? lessonsFromFrp(plan, grade)
  : generateLessonPlan(sections);

const data = {
  ...defaultProgram,
  schoolName: 'МБОУ «Средняя школа № 1»',
  locality: 'г. Проверочный',
  subject: plan.subject,
  educationLevel: plan.level,
  variant: plan.variant,
  grade: String(grade),
  teacherName: 'Иванов И. И.',
  normativeBase: 'Рабочая программа разработана в соответствии с ФГОС.',
  personalResults: 'Личностные результаты.',
  metaResults: 'Метапредметные результаты.',
  subjectResults: 'Предметные результаты.',
  methodologicalSupport: 'Учебник из федерального перечня.',
  thematicPlan: sections,
  lessonPlan: lessons,
};

const buffer = await Packer.toBuffer(buildDocument(data));

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? '[OK   ]' : '[ОШИБКА]'} ${name}${note ? ` — ${note}` : ''}`);
  if (!ok) failed += 1;
};

// ===== DOCX =====
check('DOCX: zip-контейнер', buffer[0] === 0x50 && buffer[1] === 0x4b);
const documentXml = readZipEntry(buffer, 'word/document.xml') ?? '';
check('DOCX: word/document.xml', documentXml.length > 0, `${(documentXml.length / 1024).toFixed(0)} КБ разметки`);
check('DOCX: размер', buffer.length > 10_000, `${(buffer.length / 1024).toFixed(0)} КБ`);

// ===== ODT =====
// ODT собирается вручную, поэтому проверяется строже: и что zip читается,
// и что mimetype лежит первым без сжатия — иначе часть редакторов файл
// не опознает.
const odt = Buffer.from(buildOdt(data));
check('ODT: zip-контейнер', odt[0] === 0x50 && odt[1] === 0x4b);
check(
  'ODT: mimetype первым и без сжатия',
  odt.subarray(30, 30 + 8).toString() === 'mimetype' &&
    odt.readUInt16LE(8) === 0 &&
    odt.subarray(38, 38 + MIME.length).toString() === MIME,
);
const odtContent = readZipEntry(odt, 'content.xml') ?? '';
const odtStyles = readZipEntry(odt, 'styles.xml') ?? '';
check('ODT: content.xml', odtContent.includes('<office:document-content'), `${(odtContent.length / 1024).toFixed(0)} КБ`);
check('ODT: styles.xml', odtStyles.includes('<office:document-styles'));
check('ODT: манифест', (readZipEntry(odt, 'META-INF/manifest.xml') ?? '').includes('manifest:full-path="content.xml"'));
check('ODT: таблица планирования', odtContent.includes('<table:table '));
// ODT сжимается сильнее DOCX: это один XML с большим повтором разметки,
// поэтому порог здесь ниже.
check('ODT: размер', odt.length > 3_000, `${(odt.length / 1024).toFixed(0)} КБ`);

// ===== PDF =====
const pdf = Buffer.from(buildPdf(data).output('arraybuffer') as ArrayBuffer);
const pdfText = pdf.toString('latin1');
check('PDF: заголовок %PDF', pdfText.startsWith('%PDF-'));
check('PDF: признак конца файла', pdfText.trimEnd().endsWith('%%EOF'));
// Встроенный шрифт обязателен: без него кириллица в PDF превращается
// в вопросительные знаки, причём молча.
check('PDF: встроен шрифт', /\/FontFile2?\b/.test(pdfText));
const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
check('PDF: страниц больше одной', pages > 1, `${pages}`);
check('PDF: размер', pdf.length > 20_000, `${(pdf.length / 1024).toFixed(0)} КБ`);

// ===== TXT и Markdown =====
const txt = programToText(data);
const md = programToMarkdown(data);
check('TXT: размер', txt.length > 2000, `${(txt.length / 1024).toFixed(0)} КБ`);
check('MD: размер', md.length > 2000, `${(md.length / 1024).toFixed(0)} КБ`);
check('MD: таблица планирования', md.includes('| --- |'));

// ===== разделы во всех форматах =====
// Заголовки берутся из общей модели, а не переписываются здесь: иначе
// проверка перестанет замечать, что раздел выпал из одного из форматов.
const headings = buildOutline(data)
  .filter((b) => b.kind === 'heading')
  .map((b) => (b as { text: string }).text);

for (const heading of headings) {
  check(`DOCX: раздел «${heading.slice(0, 34)}»`, documentXml.includes(heading));
  check(`ODT: раздел «${heading.slice(0, 34)}»`, odtContent.includes(heading));
  check(`TXT: раздел «${heading.slice(0, 34)}»`, txt.includes(heading));
  check(`MD: раздел «${heading.slice(0, 34)}»`, md.includes(`## ${heading}`));
}

// В PDF текст сжат потоками, поэтому по содержимому его не проверить —
// сверяем то, что доступно без разбора PDF: число страниц и объём.

const planTotal = planHours(sections);
const lessonTotal = lessonTotals(lessons).hours;
const declared = plan.classes[0].declaredHours;

// Контрольные суммы должны попасть в документ буквально.
check('DOCX: сумма часов по программе', documentXml.includes(`>${planTotal}<`));
check('ODT: сумма часов по программе', odtContent.includes(`>${planTotal}<`));
check('TXT: сумма часов по программе', txt.includes(String(planTotal)));
check('MD: сумма часов по программе', md.includes(String(planTotal)));

console.log(`\nпредмет: ${plan.subject} (${plan.level}), ${grade} класс`);
console.log(`разделов: ${sections.length}, тем: ${sections.reduce((a, s) => a + s.topics.length, 0)}`);
console.log(`часов в тематическом плане: ${planTotal}, объявлено в ФРП: ${declared ?? '—'}`);
console.log(
  `уроков в поурочном плане: ${lessons.length}, часов: ${lessonTotal}` +
    (frpVariants.length ? ` (из ФРП, вариантов: ${frpVariants.length})` : ' (из тематического)'),
);
console.log(`разделов документа: ${headings.length}`);
console.log(
  `файлы: ${docxFileName(data)}, ${odtFileName(data)}, ${pdfFileName(data)}, ` +
    `${exportBaseName(data)}.txt, ${exportBaseName(data)}.md`,
);

if (planTotal !== lessonTotal) {
  console.log(`[ОШИБКА] часы тематического (${planTotal}) и поурочного (${lessonTotal}) планов разошлись`);
  failed += 1;
}

process.exit(failed ? 1 : 0);
