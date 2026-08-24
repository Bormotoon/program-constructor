/**
 * Проверка календарного учебного графика: документ и собранное приложение.
 *
 * Две разные вещи в одном прогоне, потому что ломаются они по-разному:
 *   * DOCX — содержательно: те же таблицы, что видит учитель, и те же числа;
 *   * сборка — тихо: Tailwind v4 отсчитывает источники классов от корня Vite,
 *     а у этого приложения корень apps/schedule/, и без явных @source в CSS
 *     сборка проходит УСПЕШНО, но отдаёт приложение без оформления. Ни
 *     предупреждения, ни падения — только пустой CSS, поэтому его размер и
 *     наличие классов проверяются здесь.
 *
 * Запуск: npm run verify:schedule (после npm run build:schedule)
 */

import { readFileSync } from 'node:fs';
import { Packer } from 'docx';

import { checkBuild, docXml } from './verify_build';

import {
  buildScheduleDocument,
  defaultSchedule,
  holidaysTable,
  nonTeachingTable,
  periodsTable,
  scheduleFileName,
  schedulePeriods,
  yearTable,
} from '../src/schedule/scheduleDoc';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  ok   ' : '  ОШИБКА ') + name + (detail ? '  ' + detail : ''));
  if (!ok) failed += 1;
}

const data = { ...defaultSchedule(), schoolName: 'МБОУ «Средняя школа № 1»', locality: 'г. Красноярск' };

console.log('1) таблицы документа');
const years = yearTable(data);
const periods = periodsTable(data);
const holidays = holidaysTable(data);
const nonTeaching = nonTeachingTable(data);

check('продолжительность года — три строки классов', years.rows.length === 3);
check(
  'у 9 и 11 классов дата окончания не выдумана',
  years.rows[2].some((c) => c.text === 'по расписанию ГИА'),
);
check('у первого класса недель меньше, чем у остальных', (() => {
  const first = Number(years.rows[0][3].text);
  const rest = Number(years.rows[1][3].text);
  return first > 0 && rest > 0 && first < rest;
})(), `${years.rows[0][3].text} против ${years.rows[1][3].text}`);
check('четыре четверти плюс итог', periods.rows.length === 5, `строк ${periods.rows.length}`);
check('итоговая строка помечена жирным', periods.rows[4][0].bold === true);
check('итог по дням равен сумме четвертей', (() => {
  const sum = periods.rows.slice(0, 4).reduce((a, r) => a + Number(r[3].text), 0);
  return sum === Number(periods.rows[4][3].text);
})());
check('каникул четыре строки (три общих плюс первый класс)', holidays.rows.length === 4);
check('нерабочие дни перечислены', nonTeaching.rows.length >= 6);
check(
  'переносы помечены как требующие сверки',
  nonTeaching.rows.some((r) => r[1].text.includes('производственному календарю')),
);
check('доли ширины в каждой таблице дают единицу', [years, periods, holidays, nonTeaching].every(
  (t) => Math.abs(t.widths.reduce((a, w) => a + w, 0) - 1) < 0.001 && t.widths.length === t.head.length,
));

console.log('\n2) DOCX');
const buf = await Packer.toBuffer(buildScheduleDocument(data));
check('файл не пустой', buf.length > 4000, `${Math.round(buf.length / 1024)} КБ`);
const xml = docXml(Buffer.from(buf));
check('word/document.xml распаковался', xml.length > 2000, `${Math.round(xml.length / 1024)} КБ`);
const text = xml.replace(/<[^>]+>/g, '');
for (const needed of [
  'КАЛЕНДАРНЫЙ УЧЕБНЫЙ ГРАФИК',
  'Продолжительность учебного года',
  'Учебные периоды',
  'Каникулы',
  'Нерабочие праздничные дни',
  'Режим работы',
  'Промежуточная аттестация',
  'МБОУ',
  'по расписанию ГИА',
  'ОК-1948/03',
]) {
  check(`в документе есть «${needed}»`, text.includes(needed));
}
check('пятидневка попала в режим работы', text.includes('5 дней'));
check('имя файла собирается', /^kalendarnyy_uchebnyy_grafik_/.test(scheduleFileName(data)), scheduleFileName(data));
const { common } = schedulePeriods(data);
check('все четверти попали в текст', common.every((q) => text.includes(q.label)));

console.log('\n3) собранное приложение');
checkBuild(
  {
    dir: 'dist-schedule',
    classes: ['bg-canvas', 'border-line', 'text-ink', 'bg-brand-soft', 'grid-cols'],
    canonical: 'https://xn--80abidn3bem.xn--p1ai/apps/uchebnyy-grafik/',
    noindex: true,
  },
  check,
);
check(
  'og:url ведёт на лендинг, а не на оболочку',
  readFileSync('dist-schedule/index.html', 'utf8').includes(
    'og:url" content="https://xn--80abidn3bem.xn--p1ai/uchebnyy-grafik/"',
  ),
);

console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
