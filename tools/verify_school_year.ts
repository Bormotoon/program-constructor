/**
 * Проверка календаря учебного года: раскладка уроков по датам.
 *
 * Проверяется чистая функция lessonDates() — та же, что работает в браузере.
 * Ошибки здесь стоят дорого и глазами не видны: дата уехала на сутки, урок
 * попал в каникулы, последний урок вылез за конец года.
 *
 * Запуск: npm run verify:school-year
 */

import {
  SCHOOL_YEARS,
  formatRu,
  isoWeekday,
  lessonDates,
  parseRu,
  rangeDays,
  schoolYearFor,
  studyPeriods,
  teachingWeeks,
} from '../src/data/schoolYear';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  ok   ' : '  ОШИБКА ') + name + (detail ? '  ' + detail : ''));
  if (!ok) failed += 1;
}

const year = SCHOOL_YEARS[0];
console.log(`${year.label} — ${year.source}\n`);
console.log(`начало ${formatRu(year.start)}, окончание не ранее ${formatRu(year.endNotEarlierThan)}`);
for (const h of year.holidays) console.log(`  ${h.label}: ${formatRu(h.from)} — ${formatRu(h.to)}`);

const skipDays = year.nonTeachingDays.map((d) => d.date);

/* ── 1. Информатика 7 класс: 34 часа, вторник и четверг ─────────────────── */
console.log('\n1) 34 урока по вт/чт с 01.09.2026');
const inf = lessonDates({
  start: year.start,
  weekdays: [2, 4],
  count: 34,
  skipRanges: year.holidays,
  skipDays,
});
check('выдано ровно 34 даты', inf.dates.length === 34, `получено ${inf.dates.length}`);
check('раскладка не обрезана', !inf.truncated);
check(
  'первый урок 01.09.2026 (вторник)',
  inf.dates[0] === '2026-09-01',
  formatRu(inf.dates[0] ?? ''),
);
check(
  'последний урок не позже 26.05.2027',
  (inf.dates.at(-1) ?? '') <= year.endNotEarlierThan,
  formatRu(inf.dates.at(-1) ?? ''),
);
check(
  'все даты — только вторники и четверги',
  inf.dates.every((d) => [2, 4].includes(isoWeekday(d))),
);
check('осенние каникулы перешагнуты', inf.skipped.includes('осенние каникулы'));
check(
  'ни один урок не попал в каникулы',
  !inf.dates.some((d) => year.holidays.some((h) => d >= h.from && d <= h.to)),
);
check(
  'ни один урок не попал на нерабочий день',
  !inf.dates.some((d) => skipDays.includes(d)),
);
check('даты строго возрастают', inf.dates.every((d, i) => i === 0 || d > inf.dates[i - 1]));

/* ── 2. Русский язык 5 класс: 170 часов, пять дней в неделю ─────────────── */
console.log('\n2) 170 уроков по пн-пт (пятидневка, самая плотная нагрузка)');
const rus = lessonDates({
  start: year.start,
  weekdays: [1, 2, 3, 4, 5],
  count: 170,
  skipRanges: year.holidays,
  skipDays,
});
check('выдано 170 дат', rus.dates.length === 170, `получено ${rus.dates.length}`);
check(
  'уложилось в учебный год',
  (rus.dates.at(-1) ?? '') <= '2027-06-30',
  formatRu(rus.dates.at(-1) ?? ''),
);
check('праздники в мае перешагнуты', rus.skipped.some((s) => s.startsWith('2027-05')));

/* ── 3. Первый класс: дополнительные февральские каникулы ───────────────── */
console.log('\n3) 1 класс — дополнительные каникулы 15-21.02.2027');
const first = lessonDates({
  start: year.start,
  weekdays: [1, 2, 3, 4, 5],
  count: 132,
  skipRanges: [...year.holidays, ...year.extraFirstGrade],
  skipDays,
});
check(
  'ни один урок не попал в февральские каникулы',
  !first.dates.some((d) => d >= '2027-02-15' && d <= '2027-02-21'),
);
check(
  'дополнительные каникулы отмечены как перешагнутые',
  first.skipped.includes('дополнительные каникулы 1 класса'),
);
const without = lessonDates({
  start: year.start,
  weekdays: [1, 2, 3, 4, 5],
  count: 132,
  skipRanges: year.holidays,
  skipDays,
});
check(
  'у 1 класса план заканчивается позже, чем у остальных (неделя каникул сдвигает)',
  (first.dates.at(-1) ?? '') > (without.dates.at(-1) ?? ''),
  `${formatRu(first.dates.at(-1) ?? '')} против ${formatRu(without.dates.at(-1) ?? '')}`,
);

/* ── 4. Граничные случаи ────────────────────────────────────────────────── */
console.log('\n4) граничные случаи');
check('пустой набор дней недели не вешает цикл', lessonDates({
  start: year.start, weekdays: [], count: 10,
}).dates.length === 0);
check('нулевое число уроков', lessonDates({
  start: year.start, weekdays: [1], count: 0,
}).dates.length === 0);
const one = lessonDates({ start: '2026-11-04', weekdays: [3], count: 1, skipDays });
check(
  'старт ровно на празднике переносится на следующую подходящую среду',
  one.dates[0] === '2026-11-11',
  formatRu(one.dates[0] ?? ''),
);
const inHolidays = lessonDates({
  start: '2026-10-27', weekdays: [1, 2, 3, 4, 5], count: 1, skipRanges: year.holidays,
});
check(
  'старт внутри каникул переносится на первый учебный день после них',
  inHolidays.dates[0] === '2026-11-04' || inHolidays.dates[0] === '2026-11-05',
  formatRu(inHolidays.dates[0] ?? ''),
);

/* ── 5. Формат даты и разбор обратно ───────────────────────────────────── */
console.log('\n5) формат даты КТП');
check('ISO → дд.мм.гггг', formatRu('2026-09-01') === '01.09.2026', formatRu('2026-09-01'));
check('дд.мм.гггг → ISO', parseRu('01.09.2026') === '2026-09-01', parseRu('01.09.2026'));
check('однозначный день и месяц разбираются', parseRu('1.9.2026') === '2026-09-01');
check('мусор не разбирается', parseRu('когда-нибудь') === '');
check('обход туда-обратно на всех датах', inf.dates.every((d) => parseRu(formatRu(d)) === d));

/* ── 6. Определение учебного года и учебные недели ──────────────────────── */
console.log('\n6) учебный год и учебные недели');
check('01.09.2026 относится к 2026-2027', schoolYearFor('2026-09-01')?.id === '2026-2027');
check('01.03.2027 относится к 2026-2027', schoolYearFor('2027-03-01')?.id === '2026-2027');
check('01.09.2030 года в наборе нет', schoolYearFor('2030-09-01') === null);
const weeks = teachingWeeks(year.start, year.endNotEarlierThan, year.holidays);
check('учебных недель около 34', weeks >= 33 && weeks <= 36, `${weeks}`);

/* ── 7. Календарный учебный график: четверти ────────────────────────────── */
console.log('\n7) четверти');
const q5 = studyPeriods(year, { weekDays: 5 });
for (const q of q5) {
  console.log(`  ${q.label}: ${formatRu(q.from)} — ${formatRu(q.to)}, ${q.days} дн., ${q.weeks} нед.`);
}
check('четвертей ровно четыре', q5.length === 4, `получено ${q5.length}`);
check('первая начинается 01.09.2026', q5[0]?.from === '2026-09-01');
check(
  'первая кончается за день до осенних каникул',
  q5[0]?.to === '2026-10-25',
  formatRu(q5[0]?.to ?? ''),
);
check(
  'вторая начинается на следующий день после осенних',
  q5[1]?.from === '2026-11-04',
  formatRu(q5[1]?.from ?? ''),
);
check(
  'третья начинается после зимних',
  q5[2]?.from === '2027-01-11',
  formatRu(q5[2]?.from ?? ''),
);
check(
  'четвёртая начинается после весенних и кончается не ранее 26.05',
  q5[3]?.from === '2027-04-05' && q5[3]?.to === year.endNotEarlierThan,
  `${formatRu(q5[3]?.from ?? '')} — ${formatRu(q5[3]?.to ?? '')}`,
);
check('периоды не пересекаются', q5.every((q, i) => i === 0 || q.from > q5[i - 1].to));
const weeksSum = Math.round(q5.reduce((a, q) => a + q.weeks, 0) * 10) / 10;
check('суммарно 33-35 учебных недель', weeksSum >= 33 && weeksSum <= 35, `${weeksSum}`);
const q6 = studyPeriods(year, { weekDays: 6 });
check(
  'при шестидневке учебных дней больше, а недель столько же',
  q6.reduce((a, q) => a + q.days, 0) > q5.reduce((a, q) => a + q.days, 0) &&
    Math.abs(q6.reduce((a, q) => a + q.weeks, 0) - weeksSum) < 2,
);
const q1 = studyPeriods(year, { weekDays: 5, extraRanges: year.extraFirstGrade });
check(
  'у первого класса февральские каникулы дают пятый период',
  q1.length === 5,
  `получено ${q1.length}`,
);

console.log('\n8) длительность каникул');
for (const h of year.holidays) {
  console.log(`  ${h.label}: ${rangeDays(h)} дн.`);
}
check('осенние каникулы 9 дней', rangeDays(year.holidays[0]) === 9, `${rangeDays(year.holidays[0])}`);
check('зимние каникулы 11 дней', rangeDays(year.holidays[1]) === 11, `${rangeDays(year.holidays[1])}`);
check('весенние каникулы 9 дней', rangeDays(year.holidays[2]) === 9, `${rangeDays(year.holidays[2])}`);

console.log(
  `\nпоследний урок информатики ${formatRu(inf.dates.at(-1) ?? '')}`,
);
console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
