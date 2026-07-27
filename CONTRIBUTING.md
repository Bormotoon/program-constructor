# Как участвовать в проекте

*[English version below](#contributing-english)*

Спасибо за интерес к проекту. Он делается для учителей, поэтому полезны не
только правки кода: сообщение о том, что программа по вашему предмету
собирается неправильно, ценнее большинства патчей — данные разбираются из PDF
машинно, и увидеть ошибку может только человек, знающий предмет.

## Что особенно нужно

- **Расхождения с официальной ФРП.** Если тематическое планирование, содержание
  обучения или результаты в приложении не совпадают с PDF на edsoo.ru — заведите
  issue по шаблону «Расхождение с ФРП» и укажите предмет, класс и раздел.
- **Формат выгрузки.** Если DOCX или ODT открывается с поехавшей вёрсткой в
  вашем офисном пакете — приложите файл и назовите пакет с версией.
- **Доступность.** Клавиатурная навигация, экранные дикторы, контраст.

## Быстрый старт

```bash
git clone https://github.com/Bormotoon/program-constructor.git
cd program-constructor
npm install
npm run dev            # http://localhost:3000
```

Данные ФРП уже в репозитории (`src/data/frp/`), поэтому приложение работает
сразу после `npm install` — скачивать PDF и запускать разбор нужно, только если
вы правите сам конвейер разбора. Как его запустить — в
[README](README.md#откуда-берутся-данные).

Слабой машине помогает `DISABLE_HMR=true npm run dev`: слежение за файлами
отключается.

## Перед тем как отправить pull request

Прогоните те же шесть проверок, что гоняет CI:

```bash
npm run lint           # типы
npm run frp:check      # целостность корпуса ФРП
npm run verify:export  # данные -> DOCX, ODT, PDF, TXT, Markdown
npm run verify:import  # импорт КТП: книга Excel и CSV во всех кодировках
npm run ui:contrast    # контрастность палитры по WCAG
npm run ui:check       # сценарий учителя в настоящем браузере
```

`ui:check` требует установленного Chrome; путь задаётся переменной
`CHROME_PATH`, по умолчанию `/usr/bin/google-chrome`.

## Соглашения

- **Язык.** Интерфейс, комментарии и сообщения коммитов — на русском. Это
  проект для русской школы, и разночтения в терминах («раздел», «тема»,
  «модуль») дороже, чем удобство англоязычного чтения кода.
- **Комментарии объясняют «почему», а не «что».** В `tools/frp_parser.py`
  каждое исключение сопровождается описанием документа, из-за которого оно
  появилось. Такие комментарии — часть проекта, а не шум: без них любая правка
  разбора выглядит безобидной.
- **Каталог `src/data/frp/` генерируется.** Правки в нём затрутся при
  следующем `npm run frp:build`. Ошибку в данных надо чинить в разборе.
- **Состав документа** описан один раз в `src/utils/programOutline.ts`. Новый
  раздел добавляется туда, а не в каждую из пяти выгрузок по отдельности.
- **Коммиты** — в повелительном наклонении, одна мысль на коммит: «Разделить
  таблицу ОБЗР по годам», а не «фиксы».
- **`xlsx` ставится тарболлом с cdn.sheetjs.com**, а не из npm: в реестре пакет
  заброшен на 0.18.5 с двумя неисправленными уязвимостями. Это не опечатка в
  `package.json` — подробности в
  [ARCHITECTURE.md](ARCHITECTURE.md#приложение-почему-xlsx-стоит-не-из-npm).

## Ошибки в самих ФРП

В официальных PDF есть арифметические расхождения (перечислены в
[README](README.md#расхождения-в-самих-исходниках)). Их **не надо** исправлять
в данных: приложение показывает программу так, как она утверждена, и
предупреждает учителя. Если вы нашли ещё одно такое расхождение — добавьте его
в классификацию `tools/frp_verify.py`, чтобы разбор не считал его своей ошибкой.

## Правила общения

Действует [кодекс поведения](CODE_OF_CONDUCT.md).

---

<a name="contributing-english"></a>

# Contributing

Thanks for your interest. This project is built for schoolteachers, so code is
not the only useful contribution: a report that the curriculum for your subject
comes out wrong is worth more than most patches — the data is machine-extracted
from PDFs, and only someone who knows the subject can spot the error.

## Especially welcome

- **Mismatches against the official curriculum.** If the thematic plan, content
  or learning outcomes in the app disagree with the PDF on edsoo.ru, open an
  issue using the "Mismatch with the federal curriculum" template and name the
  subject, grade and section.
- **Export fidelity.** If DOCX or ODT opens with broken layout in your office
  suite, attach the file and name the suite and its version.
- **Accessibility.** Keyboard navigation, screen readers, contrast.

## Getting started

```bash
git clone https://github.com/Bormotoon/program-constructor.git
cd program-constructor
npm install
npm run dev            # http://localhost:3000
```

The curriculum data ships in the repository (`src/data/frp/`), so the app runs
right after `npm install`. You only need the source PDFs and the extraction
pipeline if you are changing the pipeline itself — see the
[README](README.en.md#where-the-data-comes-from).

On a low-memory machine, `DISABLE_HMR=true npm run dev` turns off file watching.

## Before opening a pull request

Run the same six checks CI runs:

```bash
npm run lint           # types
npm run frp:check      # curriculum corpus integrity
npm run verify:export  # data -> DOCX, ODT, PDF, TXT, Markdown
npm run verify:import  # plan import: Excel workbook and CSV encodings
npm run ui:contrast    # WCAG contrast of the palette
npm run ui:check       # the teacher's scenario in a real browser
```

`ui:check` needs Chrome installed; set `CHROME_PATH` if it is not at
`/usr/bin/google-chrome`.

## Conventions

- **Language.** The UI, code comments and commit messages are in Russian. This
  is a tool for Russian schools, and ambiguity in domain terms costs more than
  the convenience of English-readable code.
- **Comments explain *why*, not *what*.** Every special case in
  `tools/frp_parser.py` names the document that forced it. Those comments are
  part of the project: without them, any change to the parser looks harmless.
- **`src/data/frp/` is generated.** Edits there are overwritten by the next
  `npm run frp:build`. Fix data bugs in the extraction pipeline.
- **The document outline** lives once, in `src/utils/programOutline.ts`. Add new
  sections there rather than to each of the five exporters.
- **Commits** use the imperative mood, one idea per commit.
- **`xlsx` is installed from a cdn.sheetjs.com tarball**, not from npm: the
  registry copy is abandoned at 0.18.5 with two unpatched advisories. That entry
  in `package.json` is deliberate — see
  [ARCHITECTURE.md](ARCHITECTURE.md#приложение-почему-xlsx-стоит-не-из-npm)
  (in Russian).

## Bugs in the official curricula

The official PDFs contain arithmetic inconsistencies (listed in the
[README](README.en.md#inconsistencies-in-the-sources-themselves)). Do **not**
"fix" them in the data: the app reproduces the curriculum as approved and warns
the teacher instead. If you find another such case, add it to the
classification in `tools/frp_verify.py` so the parser stops blaming itself.

## Conduct

The [Code of Conduct](CODE_OF_CONDUCT.md) applies.
