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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';

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

/** Достаёт word/document.xml из готового DOCX без внешних зависимостей. */
function docXml(buf: Buffer): string {
  const target = 'word/document.xml';
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressed = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === target) {
      const data = buf.subarray(dataStart, dataStart + compressed);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    offset = dataStart + compressed;
  }
  return '';
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
const dir = 'dist-schedule';
if (!existsSync(dir)) {
  check('сборка есть (npm run build:schedule)', false);
} else {
  const html = readFileSync(`${dir}/index.html`, 'utf8');
  const assets = readdirSync(`${dir}/assets`);
  const css = assets.filter((f) => f.endsWith('.css'));
  const js = assets.filter((f) => f.endsWith('.js'));
  check('в сборке есть CSS и JS', css.length > 0 && js.length > 0);

  const cssText = css.map((f) => readFileSync(`${dir}/assets/${f}`, 'utf8')).join('');
  check('CSS не пустой', cssText.length > 15000, `${Math.round(cssText.length / 1024)} КБ`);
  for (const cls of ['bg-canvas', 'border-line', 'text-ink', 'bg-brand-soft', 'grid-cols']) {
    check(`класс ${cls} сгенерирован`, cssText.includes(cls));
  }

  // Тот же инвариант, что сломался у конструктора на выкате 06.08.2026: всё,
  // что оглавление и главный чанк грузят, обязано лежать в assets/.
  const mainJs = html.match(/assets\/main-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
  check('index.html ссылается на существующий main-*.js', mainJs !== '' && existsSync(`${dir}/${mainJs}`), mainJs);
  if (mainJs) {
    const chunks = [...readFileSync(`${dir}/${mainJs}`, 'utf8').matchAll(/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js/g)]
      .map((m) => m[0]);
    const missing = [...new Set(chunks)].filter((c) => !existsSync(`${dir}/assets/${c}`));
    check('все ленивые чанки на месте', missing.length === 0, missing.join(', '));
  }
  /*
   * .htaccess и favicon обязаны попасть в сборку. Их отсутствие не ломает
   * ничего сразу: приложение открывается и работает. Ломается ПОСЛЕ
   * СЛЕДУЮЩЕГО выката — хостинг отдаёт index.html с max-age 30 дней, браузер
   * месяц просит чанки, которых больше нет, и любая ленивая загрузка падает
   * (так и вышло 28.07.2026). Ловить это надо здесь, а не на проде.
   */
  check('в сборке есть .htaccess', existsSync(`${dir}/.htaccess`));
  if (existsSync(`${dir}/.htaccess`)) {
    const ht = readFileSync(`${dir}/.htaccess`, 'utf8');
    check('index.html помечен no-cache', ht.includes('no-cache'));
    check('хешированные ассеты кэшируются надолго', ht.includes('immutable'));
  }
  const icon = html.match(/href="\.?\/?(favicon\.svg)"/)?.[1];
  check('favicon из разметки лежит в сборке', !icon || existsSync(`${dir}/${icon}`), icon ?? '—');

  check('канонический адрес указывает на /uchebnyy-grafik/', html.includes('/uchebnyy-grafik/'));
  check('страница не запрещена к индексации', !/noindex/.test(html));

  /*
   * Чужие ЗАГРУЗКИ, а не любое упоминание домена: в CSS всегда есть баннер
   * лицензии Tailwind, а в JS — тексты предупреждений со ссылками на
   * документацию. Проверять надо ровно то, на чём уже горели: у интерактивной
   * доски шрифты уходили на esm.sh при каждой сборке. Значит смотрим url() и
   * @import в CSS и src/href в разметке.
   */
  const loads = [
    ...[...cssText.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]),
    ...[...cssText.matchAll(/@import\s+['"]([^'"]+)/g)].map((m) => m[1]),
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
  ];
  // Свой домен не в счёт: canonical и og:url обязаны быть абсолютными.
  const external = loads.filter(
    (u) => /^(https?:)?\/\//.test(u) && !u.includes('xn--80abidn3bem'),
  );
  check(
    'ни один шрифт, скрипт или стиль не грузится с чужого хоста',
    external.length === 0,
    external.join(', '),
  );
  check('загрузок в сборке найдено', loads.length > 0, `${loads.length}`);

  /*
   * Метрика — единственный сторонний хост, к которому приложению разрешено
   * обращаться, и её скрипт вставляется из JS, а не атрибутом src, поэтому
   * проверка выше его не видит. Значит проверяем отдельно: счётчик на месте,
   * и кроме него в разметке нет НИ ОДНОГО чужого домена.
   */
  check('счётчик Метрики в разметке', html.includes('108745963'));
  check('цели инструментов в разметке', html.includes('tool_started'));
  const hosts = [...new Set([...html.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)].map((m) => m[1]))]
    .filter((h) => h !== 'mc.yandex.ru' && !h.includes('xn--80abidn3bem'));
  check('кроме Метрики чужих доменов в разметке нет', hosts.length === 0, hosts.join(', '));
  check('рекламы пока нет (блоки РСЯ ещё не созданы)', !html.includes('ap-loader'));
}

console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
