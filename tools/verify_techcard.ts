/**
 * Проверка технологической карты урока.
 *
 * Смысл инструмента — перенос в карту того, что разобрано из ФРП, поэтому
 * главное здесь не «документ собрался», а «подстановка попала куда надо и не
 * попала куда не надо». Цель урока и деятельность учителя обязаны остаться
 * пустыми: это авторская часть, и подставлять её было бы обманом.
 *
 * Запуск: npm run verify:techcard (после npm run build:techcard)
 */

import { readFileSync } from 'node:fs';
import { Packer } from 'docx';

import { checkBuild, docXml } from './verify_build';
import { readTechCardHandoff, techCardUrl } from '../src/utils/techCardHandoff';
import { FRP_CATALOG, loadFrpPlan } from '../src/data/frp/catalog';
import {
  buildTechCardDocument,
  defaultTechCard,
  fillFromFrp,
  headerTable,
  splitActivity,
  stagesTable,
  techCardFileName,
  topicsForGrade,
} from '../src/techcard/techCardDoc';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  ok   ' : '  ОШИБКА ') + name + (detail ? '  ' + detail : ''));
  if (!ok) failed += 1;
}

console.log('1) разбор «видов деятельности» ФРП');
const sample =
  'Раскрывать смысл изучаемых понятий. Изучать вопросы правовой охраны программ и данных. '
  + 'Выполнять основные операции с файлами и папками. '
  + 'Практические работы: 1. Выполнение основных операций с файлами и папками. '
  + '2. Сравнение размеров текстовых, графических, звуковых и видеофайлов. '
  + '3. Изучение элементов интерфейса используемой операционной системы';
const split = splitActivity(sample);
check('действия выделены', split.actions.length === 3, `${split.actions.length}`);
check('практические работы выделены', split.practice.length === 3, `${split.practice.length}`);
check(
  'в действия не попал перечень практических работ',
  !split.actions.some((a) => /Практическ/i.test(a)),
);
check(
  'нумерация практических работ снята',
  !split.practice.some((a) => /^\d/.test(a)),
  split.practice[0]?.slice(0, 40),
);
check('текст без практических работ разбирается', splitActivity('Раскрывать смысл. Анализировать данные').actions.length === 2);
check('пустая строка не ломает разбор', splitActivity('').actions.length === 0);
check('обрывки в пару букв отброшены', splitActivity('А. Б. Раскрывать смысл изучаемых понятий').actions.length === 1);

console.log('\n2) заполнение из ФРП');
const entry = FRP_CATALOG.find((e) => e.slug === 'informatika-ooo-bazovyj');
if (!entry) {
  check('в каталоге есть информатика ООО (базовый)', false);
  process.exit(1);
}
const plan = await loadFrpPlan(entry.slug);
if (!plan) {
  check('программа загрузилась', false);
  process.exit(1);
}
const grade = entry.grades[0];
const topics = topicsForGrade(plan, grade);
check('темы класса разобраны', topics.length > 0, `${topics.length} тем`);
check('у темы есть содержание и виды деятельности', Boolean(topics[0].content && topics[0].activity));

const filled = fillFromFrp(defaultTechCard(), plan, grade, topics[0]);
check('тема подставлена', filled.topic === topics[0].name, filled.topic);
check('предмет и класс подставлены', filled.subject === plan.subject && filled.grade === grade);
check('основное содержание подставлено', filled.content.length > 50);
check('предметные результаты подставлены', filled.resultsSubject.length > 50);
check('метапредметные результаты подставлены', filled.resultsMeta.length > 50);
check('личностные результаты подставлены', filled.resultsPersonal.length > 50);
check('источник записан', filled.source !== '');

const study = filled.stages.find((s) => s.name === 'Изучение нового материала');
const primary = filled.stages.find((s) => s.name === 'Первичное закрепление');
check('деятельность обучающихся на изучении нового заполнена', Boolean(study?.student));
check('деятельность обучающихся на закреплении заполнена', Boolean(primary?.student));
check(
  'ЦЕЛЬ УРОКА осталась пустой — это авторская часть',
  filled.goal === '',
  `«${filled.goal}»`,
);
check(
  'деятельность УЧИТЕЛЯ осталась пустой на всех этапах',
  filled.stages.every((s) => s.teacher === ''),
);
check(
  'этапы не потерялись и не удвоились',
  filled.stages.length === defaultTechCard().stages.length,
  `${filled.stages.length}`,
);
check(
  'сумма минут по умолчанию — 40',
  filled.stages.reduce((a, s) => a + s.minutes, 0) === 40,
);

console.log('\n2а) передача урока из конструктора');
const handoffUrl = techCardUrl(
  { frpSlug: entry.slug, grade: `${grade} класс`, topic: 'Компьютерные сети', number: 3 },
  'https://example.test/apps/tech-card/',
);
check('в адресе есть слаг программы', handoffUrl.includes(`frp=${entry.slug}`), handoffUrl);
check('класс вытащен из строки «7 класс»', handoffUrl.includes(`grade=${grade}`));
check('тема и номер переданы', handoffUrl.includes('topic=') && handoffUrl.includes('n=3'));
const back = readTechCardHandoff(new URL(handoffUrl).search);
check('обратный разбор даёт то же', back.frpSlug === entry.slug && back.number === 3 && back.grade === grade);
check('тема доехала целиком', back.topic === 'Компьютерные сети', back.topic);
check('мусорный класс отбрасывается', readTechCardHandoff('?grade=99').grade === 0);
check('мусорный номер отбрасывается', readTechCardHandoff('?n=-5').number === 0);
check('пустой адрес не ломает разбор', readTechCardHandoff('').frpSlug === '');

/* Тема, пришедшая из поурочного плана, конкретнее названия темы программы —
   заполнение из ФРП не должно её затирать. */
const withTopic = fillFromFrp(
  { ...defaultTechCard(), topic: 'Поиск информации по ключевым словам' },
  plan,
  grade,
  topics[0],
);
check(
  'заполнение из ФРП не затирает уже введённую тему',
  withTopic.topic === 'Поиск информации по ключевым словам',
  withTopic.topic,
);
check('пустая тема берётся из программы', filled.topic === topics[0].name);

console.log('\n3) таблицы документа');
const header = headerTable(filled);
const stages = stagesTable(filled);
check('в шапке нет пустых строк', header.rows.every((r) => r[1].text.trim() !== ''));
check('шапка содержит тему урока', header.rows.some((r) => r[1].text === filled.topic));
check(
  'пустая карта даёт короткую шапку',
  headerTable(defaultTechCard()).rows.length < header.rows.length,
);
check('в таблице этапов пять колонок', stages.head.length === 5 && stages.widths.length === 5);
check('доли ширины дают единицу', [header, stages].every(
  (t) => Math.abs(t.widths.reduce((a, w) => a + w, 0) - 1) < 0.001,
));

console.log('\n4) DOCX');
const buf = await Packer.toBuffer(buildTechCardDocument(filled));
check('файл не пустой', buf.length > 4000, `${Math.round(buf.length / 1024)} КБ`);
const xml = docXml(Buffer.from(buf));
const text = xml.replace(/<[^>]+>/g, '');
check('word/document.xml распаковался', xml.length > 2000, `${Math.round(xml.length / 1024)} КБ`);
check('документ ландшафтный', /w:orient="landscape"/.test(xml));
for (const needed of ['ТЕХНОЛОГИЧЕСКАЯ КАРТА УРОКА', 'Ход урока', 'Тип урока', 'Формируемые УУД']) {
  check(`в документе есть «${needed}»`, text.includes(needed));
}
check('тема урока попала в документ', text.includes(filled.topic));
check('в документе указан источник подстановки', text.includes('федеральной рабочей программы'));
check(
  'имя файла собирается и содержит предмет',
  /^tehnologicheskaya_karta_/.test(techCardFileName(filled)),
  techCardFileName(filled),
);

console.log('\n5) собранное приложение');
checkBuild(
  {
    dir: 'dist-techcard',
    classes: ['bg-canvas', 'border-line', 'text-ink', 'bg-brand-soft', 'grid-cols'],
    canonical: 'https://xn--80abidn3bem.xn--p1ai/apps/tech-card/',
    noindex: true,
  },
  check,
);
check(
  'og:url ведёт на лендинг, а не на оболочку',
  readFileSync('dist-techcard/index.html', 'utf8').includes(
    'og:url" content="https://xn--80abidn3bem.xn--p1ai/tech-card/"',
  ),
);

console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
