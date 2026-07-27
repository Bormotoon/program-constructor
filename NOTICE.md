# Права на содержимое / Third-party notices

Лицензия [MIT](LICENSE) распространяется на код этого репозитория. Всё
остальное перечислено ниже.

The [MIT license](LICENSE) covers the code in this repository. Everything else
is listed below.

## Тексты федеральных рабочих программ — `src/data/frp/`

Это не результат творчества авторов проекта, а машинный разбор официальных
документов, опубликованных Институтом стратегии развития образования на
[edsoo.ru](https://edsoo.ru/): федеральных рабочих программ по учебным
предметам, редакция 2025 года. Их правовой режим определяется
законодательством об официальных документах, а не лицензией этого репозитория.

Проект не связан с ИСРО и Минпросвещения России и не является официальным
сервисом. За содержанием программ обращайтесь к первоисточнику.

The curriculum texts in `src/data/frp/` are not authored by this project: they
are a machine-readable extraction of official documents published by the
Russian Institute for Educational Development Strategy at
[edsoo.ru](https://edsoo.ru/) — the federal subject curricula, 2025 edition.
Their legal status is governed by the law on official documents, not by this
repository's license. This project is not affiliated with that institute or
with the Russian Ministry of Education, and is not an official service.

## Шрифт для выгрузки в PDF — `src/assets/fonts/`

Liberation Serif, © 2012 Red Hat, Inc., под SIL Open Font License 1.1.
Полный текст лицензии — в [`src/assets/fonts/LICENSE`](src/assets/fonts/LICENSE).

Liberation Serif, © 2012 Red Hat, Inc., under the SIL Open Font License 1.1.
The full text is in [`src/assets/fonts/LICENSE`](src/assets/fonts/LICENSE).

## Шрифт интерфейса

Inter (`@fontsource-variable/inter`), SIL Open Font License 1.1.

## Поиск образовательной организации

Подсказки приходят из [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/).
Данные OpenStreetMap — под [ODbL 1.0](https://opendatacommons.org/licenses/odbl/),
© участники OpenStreetMap.

Suggestions come from [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/).
OpenStreetMap data is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/),
© OpenStreetMap contributors.

## Библиотеки

Основная часть дерева зависимостей — MIT, ISC, BSD-3-Clause и Apache 2.0
(в том числе SheetJS). Отдельно стоит отметить:

| Пакет | Лицензия | Где используется |
|---|---|---|
| `dompurify` (через `jspdf`) | MPL-2.0 или Apache-2.0 | выгрузка в PDF, попадает в бандл |
| `jszip` (через `xlsx`) | MIT или GPL-3.0-or-later | разбор XLSX, попадает в бандл |
| `lightningcss` (через `tailwindcss`) | MPL-2.0 | только сборка, в бандл не входит |
| `caniuse-lite` (через `autoprefixer`) | CC-BY-4.0 | только сборка, в бандл не входит |

У двух дуальных лицензий выбран разрешительный вариант: Apache 2.0 для
`dompurify` и MIT для `jszip`. MPL-2.0 у `lightningcss` — послабляющий копилефт
на уровне файла, а сам пакет не изменялся и в поставку приложения не входит.

Полный список даёт `npm ls --all`; лицензия каждого пакета — в поле `license`
его `package.json`.

Most of the dependency tree is MIT, ISC, BSD-3-Clause and Apache 2.0 (SheetJS
included). For the dual-licensed packages the permissive option is taken:
Apache 2.0 for `dompurify`, MIT for `jszip`. `lightningcss` (MPL-2.0) and
`caniuse-lite` (CC-BY-4.0) are build-time only and are not shipped.
