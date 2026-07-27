<div align="center">

# Curriculum Constructor

**Build a subject curriculum from Russia's 2025 federal curricula — in the
browser, without an account, exporting to DOCX, ODT, PDF, TXT and Markdown.**

[![CI](https://github.com/Bormotoon/program-constructor/actions/workflows/ci.yml/badge.svg)](https://github.com/Bormotoon/program-constructor/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/Bormotoon/program-constructor/actions/workflows/pages.yml/badge.svg)](https://github.com/Bormotoon/program-constructor/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/Bormotoon/program-constructor?label=release)](https://github.com/Bormotoon/program-constructor/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Donate](https://img.shields.io/badge/%E2%9D%A4-Support%20the%20project-E53935)](https://dalink.to/bormotoon)

[**Open the app**](https://bormotoon.github.io/program-constructor/) ·
[Features](#what-it-does-differently) ·
[Quick start](#quick-start) ·
[Contributing](CONTRIBUTING.md)

[Русский](README.md) · **English**

</div>

---

> **What this is, in one paragraph.** Every schoolteacher in Russia has to write
> a *рабочая программа* — a per-subject curriculum document — and hand it to the
> school administration. Its content is fixed by the federal curricula (ФРП)
> published by the Institute for Educational Development Strategy: the sections,
> the topics, the hour counts and the required learning outcomes are all
> prescribed. The official tool for assembling that document requires
> registration and works online only. This is an open, offline alternative that
> produces the same document from the same source material.

An open alternative to the official
[curriculum constructor](https://workprogram.edsoo.ru/). It assembles a subject
curriculum from the federal curricula currently in force (ФРП, 2025 edition) and
exports it to DOCX, ODT, PDF, TXT or Markdown.

The app is entirely client-side: programs live in the browser, there is no
backend. No registration, no accounts, no analytics — the document itself never
leaves the machine.

The single outbound request is the school-name lookup: what you type goes to
[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/). The field says
so, and it is optional — the school name can simply be typed in.

![Thematic plan pre-filled from the federal curriculum](docs/screenshots/plan-light.png)

## What it does differently

The official tool requires an account and works only online. Here the same
result is produced locally, with the curriculum corpus shipped in the repository
in parsed form.

Everything essential to the original is implemented:

- subject selection from the catalog of curricula in force (education level →
  subject → grade), including basic and advanced tracks;
- **a pre-filled thematic plan** — sections, topics, hours, prescribed content
  and core learning activities, all taken from the federal curriculum;
- **the explanatory note, the content of instruction and all three groups of
  learning outcomes** inserted verbatim: personal and meta-subject outcomes are
  shared across the program, content and subject outcomes are per grade. In
  compound documents (Mathematics, grades 5–9), algebra, geometry and
  probability-and-statistics each get their own note and their own outcomes;
- **lesson-by-lesson planning**: 14 of the 65 curricula spell it out and it is
  taken verbatim; for the rest it is expanded from the thematic plan. Where the
  curriculum offers several planning variants (textbook-bound versus
  self-designed for "The World Around Us"; different weekly loads for Russian
  language in grade 6) the choice is left to the teacher;
- hour accounting: per-section subtotals, a grand total row, and a check against
  the hour norm declared by the curriculum, with mismatches highlighted;
- a configurable approval block on the title page (the same four combinations as
  the original);
- optional table columns can be hidden;
- rows can be reordered, duplicated, added and removed;
- preview, print and export in the 2025 curriculum format.

Export comes in five formats, all assembled in the browser — no server needed:

| Format | Why |
|---|---|
| DOCX | the format the document is submitted and edited in |
| ODT | native to LibreOffice, R7-Office and MyOffice |
| PDF | print-ready, and it will not reflow on someone else's machine |
| TXT | plain text: readable without an office suite, pastes anywhere |
| Markdown | for school wikis and repositories — with a meaningful `diff` |

All five derive their sections, ordering and column widths from a single model
(`src/utils/programOutline.ts`), so the formats cannot drift apart: a new section
appears in all of them at once, and `npm run verify:export` asserts that every
heading reached every format.

<details>
<summary>More screenshots</summary>

**Title page and program parameters**

![Title page](docs/screenshots/title-light.png)

**Document preview**

![Preview](docs/screenshots/preview-light.png)

**Dark theme**

![Dark theme](docs/screenshots/plan-dark.png)

</details>

## Where programs are stored

In this browser's `localStorage`. The program list is stored apart from program
contents: otherwise, showing ten titles would mean parsing a couple of megabytes
of JSON — one program with curriculum texts and a lesson plan weighs hundreds of
kilobytes.

Two consequences, which the app states plainly:

- clearing browser history or using private mode erases the programs;
- `localStorage` holds about 5 MB, roughly two dozen programs. When it runs out,
  the browser refuses the write — the app surfaces that as a bar with a "Save to
  file" button rather than silently losing work.

So transfer and backup go through files: one program as a JSON file, or all of
them at once. The format is readable and does not need this app to open it.

How it all works inside is in [ARCHITECTURE.md](ARCHITECTURE.md) (in Russian):
the PDF extraction pipeline, the data model, the exporters, deployment, known
traps and recipes for typical changes.

## Quick start

Requires [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (a Vite 8 constraint).

```bash
git clone https://github.com/Bormotoon/program-constructor.git
cd program-constructor
npm install
npm run dev
```

The app comes up at `http://localhost:3000`. The curriculum data ships in the
repository, so nothing else needs downloading.

For a production build run `npm run build`; the result lands in `dist/`. It
needs no backend, but it does need a static HTTP server: the app ships as ES
modules, and browsers refuse to load those over `file://`. `base` is relative,
so the directory can go into any subdirectory — your own domain, GitHub Pages,
or `python3 -m http.server` inside `dist/`. A prebuilt archive for each version
is attached to the
[releases](https://github.com/Bormotoon/program-constructor/releases/latest).

## Where the data comes from

The source is the official 2025 federal curricula from [edsoo.ru](https://edsoo.ru/),
files named `2025_{noo,ooo,soo}_frp_*.pdf`. Those PDFs and the offline copy of
the site are **not** part of this repository — several gigabytes of someone
else's documents. What is committed is the result of parsing them,
`src/data/frp/`, and that is all the app needs.

You only need to re-run the pipeline if you are changing the extraction itself.
That takes the source PDFs in `edsoo/` and Python 3.11+:

```bash
python3 -m venv .venv && .venv/bin/pip install pdfplumber

npm run frp:parse    # planning tables: PDF -> build/frp/*.json (tens of minutes, resumable)
npm run frp:content  # note, content, outcomes (fast, pdftotext)
npm run frp:lessons  # lesson planning (present in 14 curricula)
npm run frp:reparse  # re-parse the files where extraction failed
npm run frp:build    # -> src/data/frp/*.json + catalog.ts
```

`npm run frp:parse` is resumable: already-parsed files are skipped, so an
interrupted run continues with the same command.

### How the extraction works

The thematic-planning tables are real Word tables with ruling lines, so cells
are read through `pdfplumber`. Reconstructing the geometry from word coordinates
does not work: column x-positions drift from page to page and differ even
between grades within one document.

The main difficulties that had to be handled (details live in the comments of
`tools/frp_parser.py`):

- the number of extracted columns is not constant, so the hours column is
  identified by content — and **separately for each row**: merged cells push the
  hours into the second or the third column in adjacent rows of one table;
- the hours column can never be the outermost one (a "№" column on the left,
  text columns on the right) — without that constraint, subjects with plain
  section numbering ("3" rather than "3.1") had the section number read as hours;
- section headings are formatted inconsistently: "Раздел 1. Text" in Russian
  language versus a bare "Physics and its role in understanding the world" in
  physics;
- some documents are collections of independent courses: "Mathematics, grades
  5–9" contains algebra, geometry and probability-and-statistics, and schools
  write separate curricula for each — so the courses are split apart;
- the religious-cultures subject (ОРКСЭ) lists all six selectable modules at 34
  hours each, so the table total legitimately exceeds the annual norm sixfold —
  the school picks one module;
- the total row is sometimes extracted without the leading word, as "КОЛИЧЕСТВО
  ЧАСОВ". Unhandled, it counted as an ordinary topic: history at upper-secondary
  level accumulated 136 hours instead of 68;
- markup debris sometimes sticks to the word "Итого" (".Итого по разделу") and
  the row again reads as a topic: advanced English accumulated 177 hours instead
  of 170. Total-row patterns therefore tolerate a short non-letter prefix;
- on some pages the table shatters into two or three dozen narrow columns and
  the hours cell is lost. If the curriculum declares a section total and exactly
  one topic is left without hours, the value is recovered by subtraction —
  unambiguously, not by guessing;
- footnote markers are set in a smaller type size and glue themselves to numbers
  ("165¹" extracts as "1651"), so they are dropped by glyph size;
- a wrapped line fragment sometimes leaks into the "№" column and looks like a
  section heading there: Spanish at primary level grew phantom "sections" that
  split a real one in half. Caught by numbering — a heading precedes the first
  topic of its section, whereas these continued the previous numbering
  ("2.1" → "2.2");
- the safety-and-defense subject (ОБЗР) gives one table for two years (grades
  8–9 and 10–11) totalling 68 hours with no per-grade markup. It is split by
  year, but only on an exact match: section boundaries must cut the table into
  equal annual halves. For ОБЗР the sum reaches 34 exactly at the boundary of
  module 6, and the lesson plan confirms it — the second year starts at module
  7. Otherwise the table is left unsplit.

The extraction checks itself: the PDFs carry "Итого по разделу N" and "ОБЩЕЕ
КОЛИЧЕСТВО N" rows, and any disagreement with the parsed sum shows up in the
report.

### Inconsistencies in the sources themselves

The report separates extraction errors from inconsistencies in the official
PDFs. The latter were established by checking against the source text — the list
of topics in the document does not add up to the total the same document
declares:

| Curriculum | What the document says |
|---|---|
| History, grade 5 | section "The Ancient World": "section total 33" against topics summing to 22 h; meanwhile 6+22+20+20 = 68 matches the course total stated in the same document |
| History, grade 11 | section "The USSR in 1945–1991": "section total 27" against topics 1.1–1.6 summing to 4+7+8+5+1+1 = 26 h; the grade total of 68 agrees with 26 |
| Literature, grade 7 | the section declares 5 h, three topics are listed summing to 1+1+2 |
| English, grade 4 | section "The World Around Me": two rows share the number "3.8", topics give 21 h against 23 declared |
| Music, grade 4 | module topics give 33 h against 34 declared |
| Technology, grade 4 | nine topics summing to 34 h plus a "portfolio preparation — 1 h" row, 34 declared |
| German, grades 10 and 11 | topics give 102 h against 105 declared |

Two signals distinguish these from extraction errors: the declared section
totals add up to the grade total, or topic numbering runs unbroken — meaning no
row was lost.

The distinction is carried all the way into the data: `verified` in the catalog
means "extraction reconciles", while document inconsistencies sit separately in
`sourceIssues` tagged by grade. The app surfaces them verbatim and only for the
selected grade — there is no point warning a grade 7 plan about a missing hour
in grade 4. The wording differs too: "the plan needs checking" is one thing,
"the federal curriculum itself declares 5 hours for a section whose topics sum
to 1+1+2" is another.

## Layout

```
src/
  App.tsx                        shell, tabs, pre-filling
  components/
    ThematicPlanEditor.tsx       thematic planning table
    LessonPlanEditor.tsx         lesson planning table
    ProgramPreview.tsx           preview and print
    ExcelImportDialog.tsx        lesson-plan import from Excel
    ExportMenu.tsx               export menu, five formats
    LibraryDialog.tsx            saved programs
    SchoolCombobox.tsx           school lookup (OpenStreetMap)
    ErrorBoundary.tsx            recovery screen on UI failure
    ui.tsx                       primitives: buttons, fields, cards, notices
  data/
    program.ts                   the program model and its normalization
    library.ts                   the in-browser program library
    thematicPlan.ts              plan model, operations, hour validation
    lessonPlan.ts                lesson plan expansion and checks
    normativeBase.ts             the regulatory base (federal standard orders)
    frp/                         GENERATED curriculum data + catalog
  hooks/useTheme.ts              light/dark theme
  index.css                      design tokens, light and dark palettes
  utils/programOutline.ts        the document outline — shared by all exporters
  utils/docxExport.ts            DOCX export
  utils/odtExport.ts             ODT export (a zip of XML, no library)
  utils/pdfExport.ts             PDF export with an embedded font
  utils/textExport.ts            TXT and Markdown export
  utils/programFile.ts           program and backup files

tools/
  frp_parser.py                  planning tables: PDF -> JSON
  frp_verify.py                  extraction bug or source defect: classification
  frp_content.py                 note, content, outcomes: PDF -> JSON
  frp_lessons.py                 lesson planning: PDF -> JSON
  build_frp_data.py              JSON -> application data
  check_frp_data.py              corpus checks
  verify_export.ts               end-to-end check of all five exports
  build_pdf_fonts.py             font subsetting for PDF
  ui_check.mjs                   browser scenario check and screenshots
  check_contrast.py              WCAG contrast of the palette
  reparse_stale.py               re-parse known-bad files
```

`src/data/frp/` is generated — there is no need to edit it by hand. It weighs
about 22 MB across 74 subjects, but is never loaded whole: each subject is a
separate file, fetched when that subject is chosen.

## Quality and checks

Five checks run before every release — the same ones
[CI](.github/workflows/ci.yml) runs on every commit and pull request:

| Command | What it checks |
|---|---|
| `npm run lint` | types (`tsc --noEmit`) |
| `npm run frp:check` | hour reconciliation and catalog integrity |
| `npm run verify:export` | data → plans → DOCX, ODT, PDF, TXT and Markdown |
| `npm run ui:check` | the teacher's scenario in a browser, all five exports |
| `npm run ui:contrast` | WCAG contrast of the palette in both themes |

`npm run ui:check` walks the whole path — pick a subject, fill from the
curriculum, expand the lesson plan, open the preview — in both light and dark
themes, asserts there are no console errors and no horizontal scrolling at
375 px, and drops screenshots into `build/ui/`. It needs Chrome installed; the
path is set via `CHROME_PATH`.

Specifically addressed:

- **input latency** in the tables — rows are memoized and handlers are stable,
  so editing one cell does not re-render a hundred rows (measured in `ui:check`);
- **download weight** — the initial bundle is 90 KB gzipped (74 KB brotli).
  Everything heavy is split out and loaded on demand: DOCX (103 KB), PDF with
  its embedded font (204 KB), Excel parsing (125 KB); subject plans arrive with
  the subject. Text and Markdown export weighs 1 KB — it needs nothing but the
  data itself;
- **keyboard focus** — every field and icon button has a visible focus ring;
  `focus:outline-none` is never used without a replacement;
- **the dark theme** is defined by its own token values rather than inverted
  from the light ones; contrast is computed from those tokens by the WCAG
  formula (`ui:contrast`) rather than judged by eye;
- **printing** — the UI is hidden, the document goes out black-on-white in Times
  New Roman, table headers repeat on every page; `ui:check` prints a program to
  PDF and asserts it came out multi-page.

## Limitations

- In six curricula the hour sum differs from the total declared in the document
  by one to three hours — defects in the official PDFs (listed above), not in
  the extraction. The app warns about them when the affected grade is open, but
  the call — leave it as the document has it, or add the hour — is the
  teacher's. `npm run frp:check` prints the exact list.
- The regulatory base (the list of orders enacting the federal standards) is
  compiled by us: the curricula do not contain it. Every other text section
  comes from the curriculum verbatim.
- Extracurricular activities and adapted programs are not supported.

## Contributing

A report that the curriculum for your subject comes out wrong is worth more than
most patches: the data is machine-extracted, and only someone who knows the
subject can spot the error. How to file an issue and what to run before a pull
request is in [CONTRIBUTING.md](CONTRIBUTING.md). The
[Code of Conduct](CODE_OF_CONDUCT.md) applies; report vulnerabilities privately
per [SECURITY.md](SECURITY.md).

Version history is in [CHANGELOG.md](CHANGELOG.md).

## Support the project

The constructor is free and runs right in your browser — no accounts, no
subscriptions. If it saved you a weekend, support development:

[![Support Curriculum Constructor](docs/images/donate_banner.png)](https://dalink.to/bormotoon)

## License

The code is under the [MIT license](LICENSE).

The federal curriculum texts in `src/data/frp/` do not belong to the authors of
this project: they are a machine extraction of official documents published by
the Institute for Educational Development Strategy. This project is not
affiliated with that institute or with the Russian Ministry of Education and is
not an official service; refer to the [primary source](https://edsoo.ru/) for
the content of the curricula.

Fonts, OpenStreetMap data and third-party library licenses are listed in
[NOTICE.md](NOTICE.md).
