# Политика безопасности

*[English version below](#security-policy-english)*

## Что вообще может пойти не так

Приложение целиком клиентское: сервера нет, учётных записей нет, ничего никуда
не отправляется. Поэтому классических уязвимостей вроде утечки базы у него нет
в принципе. Реальная поверхность атаки — три вещи:

1. **Содержимое программы попадает в DOCX, ODT, PDF и HTML-предпросмотр.**
   Текст, введённый учителем или импортированный из Excel, экранируется перед
   вставкой в XML и HTML. Способ обойти экранирование — уязвимость.
2. **Данные хранятся в `localStorage`** и доступны любому скрипту на том же
   источнике. Отсюда следует, что XSS в предпросмотре читает все программы.
3. **Единственный внешний запрос** — подсказка при поиске школы через
   [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/). Наружу
   уходит только набранная строка поиска.

## Поддерживаемые версии

| Версия | Поддержка |
|---|---|
| 1.x | да |

## Как сообщить

Пожалуйста, **не открывайте публичный issue** для уязвимостей. Вместо этого
воспользуйтесь приватным каналом GitHub:

**[Сообщить об уязвимости](https://github.com/Bormotoon/program-constructor/security/advisories/new)**

Полезно приложить:

- версию приложения (номер релиза или хеш коммита) и браузер;
- шаги воспроизведения — лучше всего файлом программы (`.json`) или таблицей
  Excel, на которых проблема видна;
- что именно получилось сделать: прочитать чужие данные, выполнить скрипт,
  подменить содержимое выгрузки.

Ответ придёт в течение 7 дней. Если уязвимость подтвердится, исправление
выйдет отдельным релизом, а сообщивший будет упомянут в примечаниях — если
захочет.

## Что не считается уязвимостью

- Доступ к `localStorage` при физическом доступе к разблокированной машине.
- Потеря программ при очистке истории браузера или в режиме инкогнито — это
  описанное поведение, приложение предупреждает о нём и предлагает выгрузку в
  файл.
- Расхождения в часах, унаследованные из официальных PDF: это дефекты
  источника, они перечислены в README и показываются учителю.

---

<a name="security-policy-english"></a>

# Security Policy

## What can actually go wrong

The application is entirely client-side: no server, no accounts, nothing sent
anywhere. Classic vulnerabilities such as database leaks do not apply. The real
attack surface is three things:

1. **Program content ends up in DOCX, ODT, PDF and the HTML preview.** Text
   typed by the teacher or imported from Excel is escaped before being placed
   into XML and HTML. A way around that escaping is a vulnerability.
2. **Data lives in `localStorage`** and is readable by any script on the same
   origin — so an XSS in the preview reads every saved program.
3. **The only outbound request** is the school-name lookup via
   [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/). Only the
   typed search string leaves the browser.

## Supported versions

| Version | Supported |
|---|---|
| 1.x | yes |

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private channel instead:

**[Report a vulnerability](https://github.com/Bormotoon/program-constructor/security/advisories/new)**

Useful details:

- app version (release tag or commit hash) and browser;
- reproduction steps — ideally a program file (`.json`) or an Excel sheet that
  triggers the problem;
- what you were able to achieve: read other programs, execute a script, or
  tamper with exported documents.

You will get a reply within 7 days. Confirmed issues are fixed in a dedicated
release, and reporters are credited in the notes if they wish.

## Out of scope

- Reading `localStorage` given physical access to an unlocked machine.
- Losing programs when browser history is cleared or in private mode — this is
  documented behavior; the app warns about it and offers file export.
- Hour-count mismatches inherited from the official PDFs: these are source
  defects, listed in the README and surfaced to the teacher.
