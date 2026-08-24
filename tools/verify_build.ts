/**
 * Общая проверка СОБРАННОГО приложения — одна на все приложения репозитория.
 *
 * Проверяет ровно те поломки, которые не падают и не пишут предупреждений, а
 * значит доезжают до прода:
 *   * пустой CSS. Tailwind v4 определяет источники классов относительно корня
 *     Vite, а у приложений в apps/ корень свой. Без явных @source сборка
 *     проходит УСПЕШНО, а приложение отдаётся без единого стиля;
 *   * потерянные .htaccess и favicon. Приложение открывается и работает —
 *     ломается ПОСЛЕ следующего выката: хостинг отдаёт index.html с max-age
 *     на 30 дней, браузер месяц просит чанки, которых больше нет (28.07.2026);
 *   * неполный набор ленивых чанков. Ровно это уронило выгрузку DOCX
 *     06.08.2026: залили новое оглавление, а пересчитанные чанки — нет;
 *   * чужие хосты. У интерактивной доски шрифты уходили на esm.sh при каждой
 *     сборке, и заметили это не сразу.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export interface BuildExpectations {
  /** Каталог сборки. */
  dir: string;
  /** Классы Tailwind, которые обязаны быть в CSS. */
  classes?: string[];
  /** Ожидаемый canonical (подстрока). */
  canonical?: string;
  /** Ожидается ли noindex у оболочки. */
  noindex?: boolean;
  /** Минимальный размер CSS в килобайтах. */
  minCssKb?: number;
}

export function checkBuild(
  expect: BuildExpectations,
  check: (name: string, ok: boolean, detail?: string) => void,
): void {
  const dir = expect.dir;
  if (!existsSync(dir)) {
    check(`сборка ${dir} существует (npm run build:*)`, false);
    return;
  }

  const html = readFileSync(`${dir}/index.html`, 'utf8');
  const assets = readdirSync(`${dir}/assets`);
  const css = assets.filter((f) => f.endsWith('.css'));
  const js = assets.filter((f) => f.endsWith('.js'));
  check('в сборке есть CSS и JS', css.length > 0 && js.length > 0, `css ${css.length}, js ${js.length}`);

  const cssText = css.map((f) => readFileSync(`${dir}/assets/${f}`, 'utf8')).join('');
  const minKb = expect.minCssKb ?? 15;
  check('CSS не пустой', cssText.length > minKb * 1024, `${Math.round(cssText.length / 1024)} КБ`);
  for (const cls of expect.classes ?? ['bg-canvas', 'border-line', 'text-ink']) {
    check(`класс ${cls} сгенерирован`, cssText.includes(cls));
  }

  check('в сборке есть .htaccess', existsSync(`${dir}/.htaccess`));
  if (existsSync(`${dir}/.htaccess`)) {
    const ht = readFileSync(`${dir}/.htaccess`, 'utf8');
    check('index.html помечен no-cache', ht.includes('no-cache'));
    check('хешированные ассеты кэшируются надолго', ht.includes('immutable'));
  }
  const icon = html.match(/href="\.?\/?(favicon\.svg)"/)?.[1];
  check('favicon из разметки лежит в сборке', !icon || existsSync(`${dir}/${icon}`), icon ?? '—');

  const mainJs = html.match(/assets\/main-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
  check('index.html ссылается на существующий main-*.js', mainJs !== '' && existsSync(`${dir}/${mainJs}`), mainJs);
  if (mainJs) {
    const chunks = [
      ...readFileSync(`${dir}/${mainJs}`, 'utf8').matchAll(/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js/g),
    ].map((m) => m[0]);
    const missing = [...new Set(chunks)].filter((c) => !existsSync(`${dir}/assets/${c}`));
    check(
      `все ленивые чанки на месте (проверено ${new Set(chunks).size})`,
      missing.length === 0,
      missing.slice(0, 5).join(', '),
    );
  }

  if (expect.canonical) {
    check(
      `canonical указывает на ${expect.canonical}`,
      html.includes(`canonical" href="${expect.canonical}"`),
      expect.canonical,
    );
  }
  if (expect.noindex) {
    check('оболочка закрыта от индексации', /content="noindex, follow"/.test(html));
  }

  const loads = [
    ...[...cssText.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]),
    ...[...cssText.matchAll(/@import\s+['"]([^'"]+)/g)].map((m) => m[1]),
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
  ];
  const external = loads.filter(
    (u) => /^(https?:)?\/\//.test(u) && !u.includes('xn--80abidn3bem'),
  );
  check(
    'ни один шрифт, скрипт или стиль не грузится с чужого хоста',
    external.length === 0,
    external.join(', '),
  );

  check('счётчик Метрики в разметке', html.includes('108745963'));
  check('цели инструментов в разметке', html.includes('tool_started'));
  const hosts = [...new Set([...html.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)].map((m) => m[1]))]
    .filter((h) => h !== 'mc.yandex.ru' && !h.includes('xn--80abidn3bem'));
  check('кроме Метрики чужих доменов в разметке нет', hosts.length === 0, hosts.join(', '));
  check('рекламы пока нет (блоки РСЯ создаются под страницу)', !html.includes('ap-loader'));
}

/** Достаёт word/document.xml из готового DOCX без внешних зависимостей. */
export function docXml(buf: Buffer): string {
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
