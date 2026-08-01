/**
 * Проверка интерфейса в настоящем браузере.
 *
 * Проходит основной сценарий учителя целиком — выбрать предмет, заполнить
 * планирование из ФРП, развернуть поурочный план, открыть предпросмотр — и
 * снимает экраны в светлой и тёмной темах. Статический рендер главной
 * страницы этого не покрывает: таблицы появляются только после действий.
 *
 * Запуск: node tools/ui_check.mjs [базовый-URL] [каталог-для-скриншотов]
 */

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, statSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4180/';
const OUT = process.argv[3] ?? 'build/ui';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (ok, text) => {
  console.log(`${ok ? '[OK   ]' : '[ОШИБКА]'} ${text}`);
  if (!ok) problems.push(text);
};

/**
 * КТП в том виде, в каком его выдаёт русский Excel: точка с запятой,
 * кодировка cp1251, без BOM. Именно на таком файле ломался импорт (#12),
 * поэтому проверка идёт настоящими байтами, а не строкой в UTF-8.
 */
function cp1251Csv() {
  const text = [
    'Раздел;№ п/п;Тема;Количество часов',
    'Импортированный раздел;1.1;Импортированная тема;7',
  ].join('\r\n');
  const out = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 128) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
    else if (c === 0x2116) out.push(0xb9);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    colorScheme: theme,
    // Выгрузка проверяется настоящим скачиванием файла.
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // --- титульный лист ---
  await page.getByRole('combobox', { name: /Образовательная организация/i }).fill('МБОУ СШ № 1');
  await page.getByLabel('ФИО составителя').fill('Иванова Мария Петровна');

  const subject = page.getByLabel('Предмет', { exact: true });
  const options = await subject.locator('option').allTextContents();
  note(options.length > 5, `предметов в списке: ${options.length - 1}`);

  // Берём предмет с несколькими классами — на нём видна и таблица, и контроль часов.
  await subject.selectOption({ index: 1 });
  await page.waitForTimeout(400);

  const gradeSelect = page.getByLabel('Класс', { exact: true });
  const gradeOptions = await gradeSelect.locator('option').count();
  note(gradeOptions > 1, `классов доступно: ${gradeOptions - 1}`);
  await gradeSelect.selectOption({ index: 1 });

  await page.screenshot({ path: `${OUT}/01-title-${theme}.png`, fullPage: false });

  // --- тексты из ФРП ---
  // Они подставляются после асинхронной загрузки плана, поэтому ломаются
  // незаметно: интерфейс выглядит рабочим, а разделы остаются пустыми.
  await page.getByRole('button', { name: 'Пояснительная записка' }).click();
  const noteText = await page.getByLabel('Пояснительная записка', { exact: true }).inputValue();
  note(noteText.length > 1500, `пояснительная записка из ФРП: ${noteText.length} знаков`);

  await page.getByRole('button', { name: 'Планируемые результаты' }).click();
  for (const label of ['Личностные результаты', 'Метапредметные результаты', 'Предметные результаты']) {
    const value = await page.getByLabel(label, { exact: true }).inputValue();
    note(value.length > 500, `${label.toLowerCase()} из ФРП: ${value.length} знаков`);
  }

  // --- тематическое планирование ---
  await page.getByRole('button', { name: 'Тематическое планирование' }).click();
  await page.getByRole('button', { name: /Заполнить из ФРП/ }).first().click();
  await page.waitForTimeout(900);

  const rows = await page.locator('table tbody tr').count();
  note(rows > 5, `строк в тематическом планировании: ${rows}`);

  const totalCell = await page.locator('text=ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ').first().isVisible();
  note(totalCell, 'строка «ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ» отображается');

  await page.screenshot({ path: `${OUT}/02-plan-${theme}.png`, fullPage: false });

  // Диалог импорта грузится лениво (тянет парсер xlsx) — проверяем,
  // что чанк подтягивается и диалог действительно открывается.
  await page.getByRole('button', { name: /Импорт из Excel/ }).click();
  const dialog = page.getByRole('dialog', { name: /Импорт планирования из Excel/ });
  // Ждём именно появления: чанк с парсером xlsx грузится сетью.
  const dialogOk = await dialog
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  note(dialogOk, 'диалог импорта Excel открывается (ленивый чанк)');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // --- поурочное планирование ---
  await page.getByRole('button', { name: 'Поурочное планирование' }).click();
  await page.getByRole('button', { name: /Сформировать из тематического/ }).click();
  await page.waitForTimeout(600);
  const lessons = await page.locator('table tbody tr').count();
  note(lessons > 5, `строк в поурочном планировании: ${lessons}`);
  await page.screenshot({ path: `${OUT}/03-lessons-${theme}.png`, fullPage: false });

  // Отклик ввода в большой таблице: без мемоизации строк каждое нажатие
  // перерисовывает всю сотню строк, и печатать становится невозможно.
  const cell = page.getByLabel('Тема урока 1', { exact: true });
  const t0 = Date.now();
  await cell.fill('Проверка отклика ввода в большой таблице');
  const typing = Date.now() - t0;
  note(typing < 2000, `отклик ввода в таблице из ${lessons} строк: ${typing} мс`);

  // --- предпросмотр ---
  await page.getByRole('button', { name: 'Предпросмотр' }).click();
  await page.waitForTimeout(500);
  const previewOk = await page.locator('text=РАБОЧАЯ ПРОГРАММА').first().isVisible();
  note(previewOk, 'предпросмотр документа отрисован');
  await page.screenshot({ path: `${OUT}/04-preview-${theme}.png`, fullPage: false });

  // Печать — второй способ вывода наравне с файлами, и ломается она незаметно:
  // на экране всё хорошо, а на бумаге интерфейс или разъехавшиеся таблицы.
  if (theme === 'light') {
    const pdf = await page.pdf({ format: 'A4', printBackground: false, path: `${OUT}/06-print.pdf` });
    const text = pdf.toString('latin1');
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    note(pages >= 2, `печатная версия: страниц ${pages}`);
    note(pdf.length > 20_000, `размер печатного PDF: ${(pdf.length / 1024).toFixed(0)} КБ`);

    // Выгрузка во все пять форматов. Проверяется именно в браузере: каждая
    // библиотека грузится отдельным чанком по нажатию, и сломанный импорт
    // виден только здесь — сборка и типы на него не ругаются.
    const support = page.getByRole('dialog', { name: /Файл готов/ });

    for (const [label, expect] of [
      ['DOCX', /\.docx$/],
      ['ODT', /\.odt$/],
      ['PDF', /\.pdf$/],
      ['TXT', /\.txt$/],
      ['Markdown', /\.md$/],
    ]) {
      if (label !== 'DOCX') {
        await page.getByRole('button', { name: 'Другие форматы выгрузки' }).click();
        await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
      } else {
        await page.getByRole('button', { name: /Скачать DOCX/ }).click();
      }
      const download = await page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      if (!download) {
        note(false, `выгрузка ${label}: файл не пришёл`);
        continue;
      }
      const file = `${OUT}/export-${label.toLowerCase()}`;
      await download.saveAs(file);
      const size = statSync(file).size;
      note(
        expect.test(download.suggestedFilename()) && size > 2000,
        `выгрузка ${label}: ${download.suggestedFilename().slice(-24)}, ${(size / 1024).toFixed(0)} КБ`,
      );

      /* Просьба о поддержке: приходит один раз, после первой выгрузки, и
         только после неё — иначе окно превращается в помеху. Проверяем оба
         условия здесь же: перекрывая меню выгрузки, оно сломало бы и сам
         сценарий. */
      if (label === 'DOCX') {
        const shown = await support
          .waitFor({ state: 'visible', timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        note(shown, 'после первой выгрузки показана просьба о поддержке');
        await page.keyboard.press('Escape');
        await support.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      } else {
        // Окно приходит с паузой в 900 мс — ждём дольше, чтобы «не появилось»
        // значило именно это, а не «не успело».
        await page.waitForTimeout(1500);
        note(!(await support.isVisible()), `на выгрузке ${label} просьба не повторилась`);
      }
    }
  }

  // --- импорт КТП из файла ---
  // Идёт последним в проходе: импорт заменяет тематический план, и любая
  // проверка после него считала бы уже не данные ФРП. К этому моменту открыт
  // предпросмотр, поэтому сначала возвращаемся к редактированию.
  await page
    .getByRole('button', { name: /К редактированию/ })
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Тематическое планирование' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Импорт из Excel/ }).click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  // Через диалог пропускается настоящий файл: CSV в cp1251 — то, что по
  // умолчанию выдаёт русский Excel. Раньше проверялось только открытие
  // диалога, и порча кириллицы (issue #12) прошла мимо CI.
  if (dialogOk) {
    await page.setInputFiles('input[type=file]', {
      name: 'ktp-cp1251.csv',
      mimeType: 'text/csv',
      buffer: cp1251Csv(),
    });
    await page.waitForTimeout(400);

    const mappedName = await page
      .getByLabel('Колонка файла для поля «Тема»')
      .inputValue()
      .catch(() => '');
    const mappedHours = await page
      .getByLabel('Колонка файла для поля «Количество часов»')
      .inputValue()
      .catch(() => '');
    note(mappedName === 'Тема', `CSV в cp1251: колонка «Тема» найдена автоматически («${mappedName}»)`);
    note(
      mappedHours === 'Количество часов',
      `CSV в cp1251: колонка часов найдена автоматически («${mappedHours}»)`,
    );

    await page.getByRole('button', { name: 'Импортировать' }).click();
    await page.waitForTimeout(500);

    const importedRow = page.locator('table tbody tr', { hasText: 'Импортированная тема' });
    const imported = await importedRow.count();
    note(imported > 0, `CSV в cp1251: строка доехала в план без порчи кириллицы (${imported})`);

    // Файл с неузнаваемой шапкой: диалог обязан сказать об этом, а не
    // показывать молча пустые списки соответствия.
    await page.getByRole('button', { name: /Импорт из Excel/ }).click();
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.setInputFiles('input[type=file]', {
      name: 'bez-shapki.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('alpha;beta;gamma\r\n1;2;3\r\n', 'utf8'),
    });
    await page.waitForTimeout(400);
    const warned = await dialog
      .getByText(/не удалось узнать колонки/i)
      .isVisible()
      .catch(() => false);
    note(warned, 'неузнаваемая шапка: диалог предупреждает, а не молчит');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  note(consoleErrors.length === 0, `ошибок в консоли: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 5)) console.log('        ', e.slice(0, 160));

  await context.close();
}

// --- библиотека программ ---
// Главное обещание хранилища: работа не пропадает. Проверяется тем же
// способом, каким её теряют на практике — завести вторую программу и
// перезагрузить страницу.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const openLibrary = () => page.getByRole('button', { name: /Мои программы/ }).click();
  const teacher = page.getByLabel('ФИО составителя');

  await teacher.fill('Первая программа');
  await page.getByLabel('Предмет', { exact: true }).selectOption({ index: 1 });
  await page.waitForTimeout(800);

  await openLibrary();
  await page.getByRole('button', { name: 'Новая программа' }).click();
  await page.waitForTimeout(400);
  await teacher.fill('Вторая программа');
  await page.waitForTimeout(800);

  await openLibrary();
  const rows = await page.getByRole('dialog').locator('li').count();
  note(rows === 2, `программ в списке: ${rows}`);

  // Возврат к первой: вторая при этом должна сохраниться, а не потеряться.
  await page.getByRole('dialog').locator('li').last().locator('button').first().click();
  await page.waitForTimeout(500);
  note(
    (await teacher.inputValue()) === 'Первая программа',
    'переключение на другую программу возвращает её данные',
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  note(
    (await teacher.inputValue()) === 'Первая программа',
    'после перезагрузки открывается та же программа',
  );

  await openLibrary();
  const afterReload = await page.getByRole('dialog').locator('li').count();
  note(afterReload === 2, `после перезагрузки программ в списке: ${afterReload}`);

  // Резервная копия — то, чем работу переносят на другой компьютер.
  await page.getByRole('button', { name: 'Резервная копия' }).click();
  const backup = await page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  if (backup) {
    const file = `${OUT}/backup.json`;
    await backup.saveAs(file);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    note(
      doc.format === 'fgos-library' && doc.programs?.length === 2,
      `резервная копия: программ ${doc.programs?.length}, ${(statSync(file).size / 1024).toFixed(0)} КБ`,
    );
  } else {
    note(false, 'резервная копия: файл не пришёл');
  }

  note(errors.length === 0, `ошибок страницы в библиотеке: ${errors.length}`);
  await context.close();
}

// --- узкий экран: таблицы не должны ломать вёрстку ---
const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU' });
const mp = await mobile.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
const overflow = await mp.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
note(!overflow, 'на 375px нет горизонтальной прокрутки страницы');
await mp.screenshot({ path: `${OUT}/05-mobile.png`, fullPage: false });
await mobile.close();

await browser.close();

console.log(`\nскриншоты: ${OUT}`);
console.log(problems.length ? `проблем: ${problems.length}` : 'проверка пройдена');
process.exit(problems.length ? 1 : 0);
