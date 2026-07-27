#!/usr/bin/env python3
"""
Парсер федеральных рабочих программ (ФРП) из официальных PDF edsoo.ru
в структурированный JSON.

Источник: edsoo/wp-content/uploads/2025/07/2025_{noo,ooo,soo}_frp_*.pdf
Запуск:   .venv/bin/python tools/frp_parser.py <pdf...> -o build/frp

Таблицы тематического планирования в этих PDF — настоящие таблицы Word с
линиями разметки, поэтому ячейки берём через pdfplumber (он режет по линиям),
а не восстанавливаем геометрию по координатам слов. Ручная реконструкция здесь
не работает: x-координаты колонок плывут от страницы к странице и различаются
даже между классами внутри одного документа.

Остаётся одна сложность — число колонок в извлечённой таблице не постоянно
(5 на одних страницах, 7 на других из-за разрезанных ячеек). Поэтому роли
колонок определяются по содержимому: колонка часов — та, где чаще всего стоят
целые числа; слева от неё — «№» и «наименование», справа — «программное
содержание» и «основные виды деятельности».

Самопроверка: PDF содержит строки «Итого по разделу N» и «ОБЩЕЕ КОЛИЧЕСТВО N».
Если сумма разобранных часов по темам не сходится с ними — разбор неверен,
и это видно в отчёте. Это единственная надёжная валидация парсера.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

import pdfplumber

from frp_verify import num_follows, verify

RE_TOPIC_NUM = re.compile(r"^(\d+)\.(\d+)\.?$")
RE_TOPIC_NUM_INLINE = re.compile(r"^(\d+)\.(\d+)\.?\s+(.+)$", re.S)
RE_CLASS = re.compile(r"^(\d+)\s*КЛАСС\b", re.IGNORECASE)
# Перед ключевым словом изредка прилипает мусор от соседней ячейки
# («.Итого по разделу»), поэтому допускается короткий небуквенный префикс.
# Без этого итоговая строка становилась темой: у английского СОО
# углублённого так набегало 177 часов вместо 170.
LEAD = r"^[^0-9A-Za-zА-Яа-яЁё]{0,3}"
RE_TOTAL_SECTION = re.compile(LEAD + r"Итого\s+по\s+раздел", re.IGNORECASE)
# Курс — уровень группировки НАД разделами: в истории 5 класса это
# «КУРС «ВСЕОБЩАЯ ИСТОРИЯ…»» и «КУРС «ИСТОРИЯ НАШЕГО КРАЯ»», в математике —
# алгебра, геометрия, вероятность и статистика внутри одного класса.
RE_COURSE = re.compile(r"^КУРС\s*[«\"](.+?)[»\"]\s*$", re.IGNORECASE)
RE_COURSE_TOTAL = re.compile(
    LEAD + r"(Итого\s+по\s+курсу|Общее\s+количество\s+часов\s+по\s+курсу)", re.IGNORECASE
)
# «ОБЩЕЕ» нередко оказывается в соседней ячейке, и в наименование попадает
# только «КОЛИЧЕСТВО ЧАСОВ». Без этого варианта итоговая строка считалась
# темой: в истории СОО так набегало 136 часов вместо 68.
RE_TOTAL_ALL = re.compile(
    LEAD + r"(ОБЩЕЕ\s+КОЛИЧЕСТВО|КОЛИЧЕСТВО\s+ЧАСОВ|ИТОГО)\b", re.IGNORECASE
)
RE_SECTION_PREFIX = re.compile(r"^Раздел\s+\d+\.?\s*", re.IGNORECASE)
RE_INT = re.compile(r"^\d+$")
# Часы бывают записаны дробью «6/10» — базовый/углублённый объём одной темы
# (углублённая химия 8–9). Обычным целым такая ячейка не распознавалась,
# колонка часов не находилась, и предмет выпадал из каталога целиком.
RE_HOURS = re.compile(r"^(\d+)\s*/\s*(\d+)$")


def hours_value(cell: str, prefer_last: bool) -> str:
    """Число часов из ячейки; из записи «6/10» берётся нужная половина."""
    cell = cell.strip()
    if RE_INT.match(cell):
        return cell
    m = RE_HOURS.match(cell)
    if m:
        return m.group(2) if prefer_last else m.group(1)
    return ""


def is_hours_cell(cell: str) -> bool:
    cell = cell.strip()
    return bool(RE_INT.match(cell) or RE_HOURS.match(cell))
RE_MODULE = re.compile(r"^\s*(Модуль|Инвариантный модуль|Вариативный модуль)\b", re.IGNORECASE)

RE_TABLE_HEAD = re.compile(
    r"№\s*п/п|Наименование\s+раздел|Количество\s+часов|Программное\s+содержание|"
    r"Основное\s+содержание|Основные\s+виды\s+деятельн|Характеристика\s+деятельн|"
    r"\(темы\)\s*курса|Наименование\s+раздела",
    re.IGNORECASE,
)
RE_NOTE = re.compile(
    r"^(Общее\s+количество|Порядок\s+изучения|Рекомендуемое\s+количеств|"
    r"При\s+планировании|Резерв|Всего\s+часов\s+на)",
    re.IGNORECASE,
)


# Уровень изучения текущего документа: у углублённых программ из записи
# «6/10» берётся второе число. Флаг модульный, а не параметр, чтобы не тащить
# его через всю цепочку разбора строки.
PREFER_LAST_HOURS = False


def normalise(s: str | None) -> str:
    if not s:
        return ""
    s = s.replace("\xad", "")  # SOFT HYPHEN: «Естественно­научный»
    s = s.replace("\xa0", " ")
    s = s.replace("‑", "-")
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_cell(s: str) -> str:
    """Схлопывание пробелов + склейка слов, разорванных переносом строки."""
    s = normalise(s)
    s = re.sub(r"(\w)-\s+(\w)", r"\1\2", s)
    return s


# --------------------------------------------------------------------------
# Нормализация строки таблицы к пяти ролям
# --------------------------------------------------------------------------


@dataclass
class RawRow:
    kind: str  # class | section | topic | total_section | total_all | cont | note
    num: str = ""
    name: str = ""
    hours: str = ""
    content: str = ""
    activity: str = ""


def hours_column(rows: list[list[str]]) -> int | None:
    """
    Колонка часов — та, где доля ячеек-целых чисел максимальна.
    Опираться на шапку нельзя: она есть не на каждой странице.

    Порог по числу заполненных ячеек намеренно низкий: на страницу иногда
    попадает всего одна-две строки таблицы (тема с длинным описанием), и более
    строгое требование выбрасывало бы такие страницы целиком вместе с темами.
    При равенстве долей выигрывает самая «узкая» по тексту колонка — часы это
    одно-два знака, а не абзац.
    """
    if not rows:
        return None
    ncols = max(len(r) for r in rows)
    if ncols < 3:
        return None

    # Колонка часов всегда зажата между наименованием и программным
    # содержанием, крайней она не бывает. Без этого ограничения у предметов с
    # простой нумерацией разделов («3», а не «3.1») конкурс «доли целых чисел»
    # выигрывала колонка «№», часы уезжали в название, а суммы разъезжались.
    best: tuple[float, float, int] | None = None  # (доля целых, -средняя длина, индекс)
    for c in range(1, ncols - 1):
        vals = [r[c].strip() for r in rows if c < len(r) and r[c].strip()]
        if not vals:
            continue
        frac = sum(1 for v in vals if is_hours_cell(v)) / len(vals)
        if frac < 0.5:
            continue
        avg_len = sum(len(v) for v in vals) / len(vals)
        cand = (frac, -avg_len, c)
        if best is None or cand > best:
            best = cand
    return best[2] if best else None


@dataclass
class NormRow:
    num: str
    name: str
    hours: str
    content: str
    activity: str
    left_idx: int  # индекс левой колонки, в которой реально лежит текст


def row_hours_column(cells: list[str], hint: int) -> int:
    """
    Колонку часов ищем В КАЖДОЙ СТРОКЕ отдельно.

    Из-за объединённых ячеек исходной таблицы Word число часов в одном и том же
    документе оказывается то во второй, то в третьей колонке — иногда даже в
    соседних строках одной таблицы. Фиксированная на всю таблицу колонка часов
    из-за этого теряла и часы, и границу между названием и содержанием.
    """
    # Крайние колонки исключены по той же причине, что и в hours_column:
    # слева стоит «№», справа — текстовые колонки.
    ints = [
        i
        for i, c in enumerate(cells)
        if is_hours_cell(c) and 0 < i < max(len(cells) - 1, 1)
    ]
    if not ints:
        return hint  # строка-продолжение: часов нет, но границы колонок нужны
    if len(ints) == 1:
        return ints[0]
    return min(ints, key=lambda i: abs(i - hint))


def normalise_row(cells: list[str], hcol: int) -> NormRow:
    """Свод произвольного числа колонок к пяти ролям."""
    left_cells = cells[:hcol]
    hours = hours_value(cells[hcol], PREFER_LAST_HOURS) if hcol < len(cells) else ""
    right = [c for c in cells[hcol + 1 :] if c.strip()]

    left_idx = next((i for i, c in enumerate(left_cells) if c.strip()), -1)
    left = [c for c in left_cells if c.strip()]

    num = ""
    # Номер темы бывает и составным («2.3»), и простым («3» — так пронумерованы
    # разделы в русском языке начальной школы). Простой номер принимаем только
    # когда в строке есть ещё и наименование, иначе одинокое число из другой
    # колонки было бы принято за номер.
    if left and (RE_TOPIC_NUM.match(left[0].strip()) or (len(left) > 1 and RE_INT.match(left[0].strip()))):
        num = left[0].strip().rstrip(".")
        left = left[1:]
        left_idx = next(
            (i for i, c in enumerate(left_cells) if c.strip() and not RE_TOPIC_NUM.match(c.strip())),
            left_idx,
        )
    name = " ".join(left).strip()

    if not num:
        m = RE_TOPIC_NUM_INLINE.match(name)
        if m:
            num = f"{m.group(1)}.{m.group(2)}"
            name = m.group(3).strip()

    content = right[0] if len(right) >= 1 else ""
    activity = " ".join(right[1:]) if len(right) >= 2 else ""
    return NormRow(num, name, hours, content, activity, left_idx)


def classify(r: NormRow, hcol: int) -> RawRow:
    n = r.name.strip()

    if RE_CLASS.match(n):
        return RawRow(kind="class", name=n)
    mc = RE_COURSE.match(n)
    if mc:
        return RawRow(kind="course", name=mc.group(1).strip())
    if RE_TOTAL_SECTION.match(n):
        return RawRow(kind="total_section", name=n, hours=r.hours)
    # Проверяется РАНЬШЕ примечаний: «Общее количество часов по курсу» иначе
    # попадёт под правило примечаний и его часы будут посчитаны дважды.
    if RE_COURSE_TOTAL.match(n):
        return RawRow(kind="course_total", name=n, hours=r.hours)
    if RE_TOTAL_ALL.match(n):
        return RawRow(kind="total_all", name=n, hours=r.hours)
    if RE_TABLE_HEAD.search(n) and not r.hours.strip().isdigit():
        return RawRow(kind="note", name=n)
    if RE_NOTE.match(n):
        # «Резервное время — 3» это полноценная строка плана с часами, а не
        # примечание: без неё сумма по классу не сходится с ОБЩИМ КОЛИЧЕСТВОМ.
        if r.hours.strip().isdigit():
            return RawRow(kind="reserve", name=n, hours=r.hours)
        return RawRow(kind="note", name=n)

    if r.num or (r.hours.strip().isdigit() and n):
        return RawRow(
            kind="topic", num=r.num, name=n, hours=r.hours, content=r.content, activity=r.activity
        )

    # Строка без номера и без часов — это либо заголовок раздела, либо «хвост»
    # названия темы, перенесённый на следующую строку/страницу. Различаем по
    # колонке: заголовок раздела занимает крайнюю левую (там, где «№»),
    # продолжение названия стоит в колонке «Наименование».
    if n and not r.content and not r.activity:
        if hcol >= 2:
            return RawRow(kind="section" if r.left_idx == 0 else "cont", name=n)
        # Колонки «№» нет (например, математика 5–9) — отличить по позиции
        # нельзя, решение принимается в build_plan по контексту.
        return RawRow(kind="section_or_cont", name=n)
    return RawRow(kind="cont", name=n, content=r.content, activity=r.activity)


def drop_superscripts(page: pdfplumber.page.Page) -> pdfplumber.page.Page:
    """
    Убирает надстрочные знаки сносок.

    В ряде программ (русский язык начальной школы) к числам приклеены маркеры
    сносок: «ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ 165¹» извлекается как «1651», а «0¹» — как
    «01». Маркеры набраны заметно более мелким кеглем, чем текст таблицы,
    поэтому отбрасываются по размеру символа.
    """
    sizes = [c.get("size") or 0 for c in page.chars]
    if len(sizes) < 20:
        return page
    sizes.sort()
    median = sizes[len(sizes) // 2]
    if median <= 0:
        return page
    cutoff = median * 0.82
    return page.filter(
        lambda obj: obj.get("object_type") != "char" or (obj.get("size") or median) >= cutoff
    )


def page_raw_rows(page: pdfplumber.page.Page, memo: dict[int, int]) -> list[RawRow]:
    """
    memo: последняя удачно определённая колонка часов для таблицы с таким же
    числом колонок. Нужна для страниц, где таблица состоит из одних «хвостов»
    предыдущей темы и чисел нет вовсе — без этого такой текст терялся бы.
    """
    rows: list[RawRow] = []
    page = drop_superscripts(page)

    # Заголовок класса стоит НАД таблицей, в обычном тексте страницы.
    # Окно намеренно шире первых строк: у иностранных языков между
    # «ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ» и «2 КЛАСС» вклинивается абзац пояснений,
    # и заголовок терялся. Но и всю страницу просматривать нельзя — под
    # шаблон попадает ячейка таблицы «7 класс», и класс заводится дважды.
    text = page.extract_text() or ""
    for line in text.splitlines()[:14]:
        t = normalise(line)
        if RE_CLASS.match(t) and len(t) <= 20:
            rows.append(RawRow(kind="class", name=t))
            break

    for table in page.find_tables():
        data = table.extract()
        cells = [[clean_cell(c) for c in row] for row in data]
        if not cells:
            continue
        ncols = max(len(r) for r in cells)
        hcol = hours_column(cells)
        if hcol is None:
            hcol = memo.get(ncols)
            if hcol is None:
                continue
        else:
            memo[ncols] = hcol
        for row in cells:
            if not any(c.strip() for c in row):
                continue
            rc = row_hours_column(row, hcol)
            rows.append(classify(normalise_row(row, rc), rc))
    return rows


# --------------------------------------------------------------------------
# Сырые строки -> модель программы
# --------------------------------------------------------------------------


@dataclass
class Topic:
    num: str
    name: str
    hours: int
    content: str
    activity: str


@dataclass
class Section:
    name: str
    topics: list[Topic] = field(default_factory=list)
    declared_total: int | None = None
    course: str = ""

    @property
    def computed_total(self) -> int:
        return sum(t.hours for t in self.topics)


@dataclass
class ClassPlan:
    grade: int
    sections: list[Section] = field(default_factory=list)
    declared_total: int | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def computed_total(self) -> int:
        return sum(s.computed_total for s in self.sections)

    @property
    def is_modular(self) -> bool:
        """
        Программа модульная, если её объём превышает объявленную годовую норму,
        а разделы выглядят как взаимозаменяемые модули: школа набирает нужный
        объём, выбирая из них (музыка, физкультура, ОРКСЭ, труд).

        Признак модуля — либо название («Модуль № 1 «Народная музыка России»»),
        либо равенство объёма раздела годовой норме: в ОРКСЭ шесть модулей по
        34 часа при норме 34, из которых выбирается ровно один.
        """
        if self.declared_total is None or self.computed_total <= self.declared_total:
            return False
        by_name = sum(1 for s in self.sections if RE_MODULE.match(s.name))
        full_size = sum(1 for s in self.sections if s.computed_total == self.declared_total)
        return by_name >= 2 or full_size >= 2


def continues_numbering(section: Section | None, num: str) -> bool:
    """Номер темы продолжает нумерацию уже открытого раздела («2.1» -> «2.2»)."""
    if section is None or not section.topics:
        return False
    return num_follows(section.topics[-1].num, num)


def build_plan(rows: list[RawRow]) -> list[ClassPlan]:
    classes: list[ClassPlan] = []
    cur_class: ClassPlan | None = None
    cur_section: Section | None = None
    cur_topic: Topic | None = None
    pending_section: str | None = None
    # Взводится там, где по структуре документа обязан идти заголовок раздела:
    # сразу после «N КЛАСС» и после «Итого по разделу».
    expect_section = False
    cur_course = ""
    course_sections = 0  # сколько разделов набрано в текущем курсе

    def close_topic() -> None:
        # Раздел открывается при необходимости: без этого тема, завершённая в
        # момент, когда текущий раздел уже закрыт (после «Итого по разделу» или
        # перед заголовком следующего), молча пропадала. На иностранных языках,
        # где заголовков разделов нет вовсе, так терялась почти половина тем.
        nonlocal cur_topic, cur_section
        if cur_topic is None:
            return
        if cur_section is None:
            cur_section = Section(name="")
        cur_topic.name = clean_cell(cur_topic.name)
        cur_topic.content = clean_cell(cur_topic.content)
        cur_topic.activity = clean_cell(cur_topic.activity)
        cur_section.topics.append(cur_topic)
        cur_topic = None

    def close_section() -> None:
        nonlocal cur_section, course_sections
        if cur_section is not None and cur_class is not None:
            if cur_section.topics or cur_section.declared_total is not None:
                cur_section.course = cur_course
                cur_class.sections.append(cur_section)
                course_sections += 1
        cur_section = None

    def open_section(num: str = "") -> None:
        """Заголовок раздела применяем лениво — только когда пошли темы."""
        nonlocal cur_section, pending_section
        if pending_section is not None:
            # Заголовок раздела стоит перед его первой темой, и нумерация тем
            # в новом разделе начинается заново. Если номер следующей темы
            # продолжает нумерацию уже открытого раздела, «заголовок» — на
            # самом деле обрывок текста, затёкший в колонку «№» при переносе
            # строки: у испанского НОО так появлялись разделы «Рождеством).» и
            # «глубиной проникновения», разрывавшие настоящий раздел пополам.
            if continues_numbering(cur_section, num):
                pending_section = None
            else:
                close_section()
                cur_section = Section(name=pending_section)
                pending_section = None
        if cur_section is None:
            cur_section = Section(name="")

    for r in rows:
        if r.kind == "class":
            close_topic()
            close_section()
            pending_section = None
            m = RE_CLASS.match(r.name)
            grade = int(m.group(1)) if m else 0
            # Один и тот же «N КЛАСС» встречается и в тексте, и в шапке таблицы.
            if cur_class is not None and cur_class.grade == grade and not cur_class.sections:
                continue
            cur_class = ClassPlan(grade=grade)
            classes.append(cur_class)
            expect_section = True
            cur_course = ""
            course_sections = 0

        elif r.kind == "section_or_cont":
            # Заголовок раздела и «хвост» названия темы выглядят одинаково,
            # когда в таблице нет колонки «№». Решаем по позиции в документе.
            if expect_section:
                close_topic()
                name = clean_cell(RE_SECTION_PREFIX.sub("", r.name)) or clean_cell(r.name)
                if name:
                    pending_section = name
                    expect_section = False
            elif cur_topic is not None and r.name:
                cur_topic.name += " " + r.name

        elif r.kind == "note":
            if cur_class is not None and r.name and not RE_TABLE_HEAD.search(r.name):
                cur_class.notes.append(r.name)

        elif r.kind == "section":
            close_topic()
            name = clean_cell(RE_SECTION_PREFIX.sub("", r.name)) or clean_cell(r.name)
            if not name:
                continue
            pending_section = name
            expect_section = False

        elif r.kind == "topic":
            close_topic()
            if cur_class is None:
                cur_class = ClassPlan(grade=0)
                classes.append(cur_class)
            open_section(r.num)
            cur_topic = Topic(
                num=r.num,
                name=r.name,
                hours=int(r.hours) if r.hours.isdigit() else 0,
                content=r.content,
                activity=r.activity,
            )

        elif r.kind == "cont":
            if cur_topic is not None:
                if r.name:
                    cur_topic.name += " " + r.name
                if r.content:
                    cur_topic.content += " " + r.content
                if r.activity:
                    cur_topic.activity += " " + r.activity

        elif r.kind == "course":
            close_topic()
            close_section()
            cur_course = r.name
            course_sections = 0
            expect_section = True

        elif r.kind == "course_total":
            close_topic()
            close_section()
            # Курс без разбивки по темам (например, «История нашего края» —
            # только «Итого по курсу 34») существует в плане лишь этой строкой.
            # Без неё сумма по классу не сойдётся с ОБЩИМ КОЛИЧЕСТВОМ.
            if course_sections == 0 and cur_class is not None and r.hours.isdigit():
                h = int(r.hours)
                name = cur_course or r.name
                cur_class.sections.append(
                    Section(
                        name=name,
                        declared_total=h,
                        course=cur_course,
                        topics=[Topic(num="", name=name, hours=h, content="", activity="")],
                    )
                )
            expect_section = True

        elif r.kind == "reserve":
            close_topic()
            close_section()
            if cur_class is not None and r.hours.isdigit():
                h = int(r.hours)
                cur_class.sections.append(
                    Section(
                        name=r.name,
                        declared_total=h,
                        topics=[Topic(num="", name=r.name, hours=h, content="", activity="")],
                    )
                )
            expect_section = True

        elif r.kind == "total_section":
            close_topic()
            if cur_section is not None and r.hours.isdigit():
                cur_section.declared_total = int(r.hours)
            close_section()
            expect_section = True

        elif r.kind == "total_all":
            close_topic()
            close_section()
            if cur_class is not None and r.hours.isdigit():
                cur_class.declared_total = int(r.hours)

    close_topic()
    close_section()

    for cls in classes:
        for section in cls.sections:
            reconcile_section(section)

    return [c for c in classes if c.sections]


def reconcile_section(section: Section) -> None:
    """
    Восстанавливает часы единственной темы, у которой их не удалось прочитать.

    На отдельных страницах pdfplumber дробит таблицу на два-три десятка узких
    колонок, и ячейка часов теряется. Но ФРП объявляет итог по разделу, и если
    без часов осталась ровно одна тема, недостающее значение определяется
    однозначно — это вычитание, а не догадка. Когда таких тем несколько,
    ничего не подставляется: расхождение честнее показать в отчёте.
    """
    if section.declared_total is None:
        return
    missing = [t for t in section.topics if t.hours == 0]
    if len(missing) != 1:
        return
    gap = section.declared_total - section.computed_total
    if gap > 0:
        missing[0].hours = gap


# --------------------------------------------------------------------------


LEVELS = {
    "НАЧАЛЬНОГО": "НОО",
    "ОСНОВНОГО": "ООО",
    "СРЕДНЕГО": "СОО",
}
RE_GRADES = re.compile(r"\(для\s+(\d+)\s*[–—-]\s*(\d+)\s+класс", re.IGNORECASE)
RE_GRADE_ONE = re.compile(r"\(для\s+(\d+)\s+класс", re.IGNORECASE)
RE_VARIANT = re.compile(r"\((базовый|углубл[её]нный)\s+уровень\)", re.IGNORECASE)
RE_TITLE_STOP = re.compile(
    r"^\(\s*(для\s+\d|базовый|углубл[её]нный)|^Москва\b|^\d{4}\s*$", re.IGNORECASE
)


def parse_title_page(pdf: pdfplumber.PDF) -> dict:
    """
    Титульный лист — самый надёжный источник названия предмета, уровня
    образования, диапазона классов и уровня изучения. Имя файла для этого
    не годится: транслитерация в нём непоследовательна.
    """
    text = pdf.pages[0].extract_text() or ""
    lines = [normalise(l) for l in text.splitlines() if normalise(l)]

    meta: dict = {"subject": "", "level": "", "grades": [], "variant": ""}

    for i, line in enumerate(lines):
        for key, code in LEVELS.items():
            if line.upper().startswith(key) and "ОБЩЕГО ОБРАЗОВАНИЯ" in line.upper():
                meta["level"] = code
                # Название предмета — прописные строки до строки с классами
                # или уровнем изучения. Обрывать на первой открывающей скобке
                # нельзя: названия сами содержат скобки и переносятся по
                # строкам — «ИНОСТРАННЫЙ\n(ФРАНЦУЗСКИЙ) ЯЗЫК»,
                # «ТРУД (ТЕХНОЛОГИЯ)», «ОСНОВЫ РЕЛИГИОЗНЫХ\nКУЛЬТУР…».
                parts: list[str] = []
                for nxt in lines[i + 1 :]:
                    if RE_TITLE_STOP.match(nxt):
                        break
                    if nxt.upper() == nxt and len(nxt) > 1:
                        parts.append(nxt)
                    elif parts:
                        break
                meta["subject"] = re.sub(r"\s+", " ", " ".join(parts)).strip()
                break
        if meta["level"]:
            break

    blob = " ".join(lines)
    m = RE_GRADES.search(blob)
    if m:
        meta["grades"] = list(range(int(m.group(1)), int(m.group(2)) + 1))
    else:
        m1 = RE_GRADE_ONE.search(blob)
        if m1:
            meta["grades"] = [int(m1.group(1))]

    v = RE_VARIANT.search(blob)
    if v:
        meta["variant"] = "базовый" if v.group(1).lower().startswith("баз") else "углублённый"

    return meta


RE_COURSE_MENTION = re.compile(r"учебного\s+курса\s*[«\"](.+?)[»\"]", re.IGNORECASE)


def probe_layout(pdf: pdfplumber.PDF, first: int, last: int) -> dict[int, int]:
    """
    Наиболее частая колонка часов для таблиц с данным числом колонок.

    Считается по всему блоку сразу, чтобы страницы без чисел могли опереться
    на раскладку соседних.
    """
    votes: dict[int, dict[int, int]] = {}
    for i in range(first, last + 1):
        page = drop_superscripts(pdf.pages[i])
        for table in page.find_tables():
            cells = [[clean_cell(c) for c in row] for row in table.extract()]
            if not cells:
                continue
            ncols = max(len(r) for r in cells)
            hcol = hours_column(cells)
            if hcol is not None:
                votes.setdefault(ncols, {})
                votes[ncols][hcol] = votes[ncols].get(hcol, 0) + 1

    memo = {n: max(c.items(), key=lambda kv: kv[1])[0] for n, c in votes.items()}

    return memo


def thematic_blocks(pdf: pdfplumber.PDF) -> list[tuple[int, int, str]]:
    """
    Все блоки «Тематическое планирование» с их учебными курсами.

    Некоторые ФРП — это сборник самостоятельных курсов под одной обложкой:
    «Математика. 5–9 классы» содержит алгебру, геометрию и вероятность со
    статистикой, у каждого свои пояснительная записка и тематическое
    планирование. Школы пишут по ним ОТДЕЛЬНЫЕ рабочие программы, поэтому
    блоки нужно разделять, а не сливать в один план.

    Возвращает список (первая страница, последняя страница, название курса),
    индексы 0-based включительно.
    """
    starts: list[int] = []
    stop: int | None = None
    course_at: dict[int, str] = {}
    last_course = ""

    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        for m in RE_COURSE_MENTION.finditer(text):
            last_course = m.group(1).strip()
        # Хвостовая цифра — маркер сноски: в ряде программ заголовок извлекается
        # как «ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ 1», и строгий шаблон его не находил.
        if re.search(r"^\s*ТЕМАТИЧЕСКОЕ\s+ПЛАНИРОВАНИЕ\s*\d?\s*$", text, re.M):
            starts.append(i)
            course_at[i] = last_course
        elif stop is None and re.search(r"^\s*ПОУРОЧНОЕ\s+ПЛАНИРОВАНИЕ\s*\d?\s*$", text, re.M):
            stop = i

    if not starts:
        return []

    blocks: list[tuple[int, int, str]] = []
    for j, s in enumerate(starts):
        e = starts[j + 1] - 1 if j + 1 < len(starts) else len(pdf.pages) - 1
        if stop is not None and s < stop <= e:
            e = stop - 1
        if e >= s:
            blocks.append((s, e, course_at.get(s, "")))

    # Если курс упомянут лишь у части блоков, единственный блок курса не несёт.
    if len(blocks) == 1:
        blocks = [(blocks[0][0], blocks[0][1], "")]
    return blocks


def split_multiyear(classes: list[ClassPlan], grades: list[int]) -> list[ClassPlan]:
    """
    Одну таблицу на несколько лет обучения делим по годам, если это однозначно.

    ОБЗР даёт тематическое планирование общей таблицей на 8–9 (и на 10–11)
    классы, объявляя суммарные 68 часов без разметки по годам. Без деления
    учитель 8 класса получал план на два года сразу, а 9 класса — вообще
    ничего.

    Делим только при точном совпадении: границы разделов должны нарезать
    таблицу на равные годовые части. У ОБЗР сумма выходит на 34 ровно на
    границе модуля № 6, и это подтверждается поурочным планированием — там
    9 класс начинается с модуля № 7 «Безопасность в природной среде». Если
    такого разреза нет, таблица остаётся неразделённой.
    """
    if len(grades) < 2 or len(classes) != 1:
        return classes
    src = classes[0]
    if src.grade != 0 or src.declared_total is None:
        return classes
    n = len(grades)
    per_year, rest = divmod(src.declared_total, n)
    if rest or per_year <= 0 or src.computed_total != src.declared_total:
        return classes

    groups: list[list[Section]] = []
    current: list[Section] = []
    running = 0
    for section in src.sections:
        current.append(section)
        running += section.computed_total
        if running == per_year:
            groups.append(current)
            current, running = [], 0
        elif running > per_year:
            return classes
    if current or len(groups) != n:
        return classes

    return [
        ClassPlan(grade=grade, sections=group, declared_total=per_year, notes=src.notes)
        for grade, group in zip(grades, groups)
    ]


def parse(path: Path) -> dict:
    with pdfplumber.open(path) as pdf:
        meta = parse_title_page(pdf)
        global PREFER_LAST_HOURS
        PREFER_LAST_HOURS = meta.get("variant") == "углублённый"
        blocks = thematic_blocks(pdf)
        if not blocks:
            return {
                "source": path.name,
                **meta,
                "error": "раздел «Тематическое планирование» не найден",
                "courses": [],
            }
        parsed: list[tuple[str, list[int], list[ClassPlan]]] = []
        for first, last, course in blocks:
            # Разбор двухпроходный. Первый проход собирает раскладку колонок
            # по ВСЕМУ блоку: на отдельной странице таблица бывает целиком
            # из «хвостов» предыдущей темы, где чисел нет вовсе и колонку
            # часов определить не по чему. Раньше такие страницы молча
            # выпадали, а если неудачными оказывались первые страницы блока —
            # выпадал и весь предмет (углублённая химия 8–9).
            memo = probe_layout(pdf, first, last)
            rows: list[RawRow] = []
            for i in range(first, last + 1):
                rows.extend(page_raw_rows(pdf.pages[i], memo))
            classes = build_plan(rows)
            # Часть программ не размечает таблицу заголовками «N КЛАСС»:
            # у ОРКСЭ она одна на единственный 4 класс, у ОБЗР — общая на два
            # года. Класс берём с титульного листа, а двухлетнюю таблицу
            # пробуем разделить по годам.
            grades = meta.get("grades") or []
            if grades:
                classes = split_multiyear(classes, grades)
                for c in classes:
                    if c.grade == 0:
                        c.grade = grades[0]
            parsed.append((course, [first + 1, last + 1], classes))

    return {
        "source": path.name,
        **meta,
        "courses": [
            {"name": course, "pages": pages, "classes": serialise_classes(classes)}
            for course, pages, classes in parsed
            if classes
        ],
    }


def serialise_classes(classes: list[ClassPlan]) -> list[dict]:
    return [
        {
            "grade": c.grade,
            "declaredTotal": c.declared_total,
            "computedTotal": c.computed_total,
            "modular": c.is_modular,
            "notes": c.notes,
            "sections": [
                {
                    "name": s.name,
                    "course": s.course,
                    "declaredTotal": s.declared_total,
                    "computedTotal": s.computed_total,
                    "topics": [asdict(t) for t in s.topics],
                }
                for s in c.sections
            ],
        }
        for c in classes
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="ФРП PDF -> JSON")
    ap.add_argument("pdf", type=Path, nargs="+")
    ap.add_argument("-o", "--outdir", type=Path)
    ap.add_argument("-q", "--quiet", action="store_true")
    ap.add_argument(
        "--resume",
        action="store_true",
        help="пропускать файлы, для которых JSON уже собран (прогон по всему корпусу "
        "занимает десятки минут, и его не должно быть нужно начинать заново)",
    )
    args = ap.parse_args()

    ok = failed = skipped = 0
    for path in args.pdf:
        if args.resume and args.outdir and (args.outdir / (path.stem + ".json")).exists():
            skipped += 1
            continue
        try:
            doc = parse(path)
        except Exception as exc:  # noqa: BLE001 — один битый файл не должен ронять прогон
            print(f"[СБОЙ ] {path.name}: {type(exc).__name__}: {exc}")
            failed += 1
            continue

        parse_errors, source_errors = verify(doc)
        doc["problems"] = parse_errors
        doc["sourceProblems"] = source_errors

        if args.outdir:
            args.outdir.mkdir(parents=True, exist_ok=True)
            (args.outdir / (path.stem + ".json")).write_text(
                json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8"
            )

        if doc.get("error"):
            print(f"[СБОЙ ] {path.name}: {doc['error']}")
            failed += 1
            continue

        courses = doc["courses"]
        n_topics = sum(
            len(s["topics"]) for co in courses for c in co["classes"] for s in c["sections"]
        )
        n_classes = sum(len(co["classes"]) for co in courses)
        if not parse_errors:
            ok += 1

        names = [co["name"] for co in courses if co["name"]]
        suffix = f" курсы={names}" if names else ""
        print(
            f"[{'OK   ' if not parse_errors else 'ПРОБЛ'}] {path.name}: "
            f"{doc.get('subject', '?')} / {doc.get('level', '?')}"
            f"{' / ' + doc['variant'] if doc.get('variant') else ''} — "
            f"классов={n_classes} тем={n_topics}{suffix}"
        )
        if source_errors:
            print(f"        ~ расхождений в самом PDF: {len(source_errors)}")
        if parse_errors and not args.quiet:
            for p in parse_errors[:6]:
                print("        -", p)
            if len(parse_errors) > 6:
                print(f"        … ещё {len(parse_errors) - 6}")

    processed = len(args.pdf) - skipped
    tail = f", пропущено готовых: {skipped}" if skipped else ""
    print(f"\nразобрано без ошибок: {ok} из {processed} (сбоев: {failed}{tail})")
    return 0 if ok == processed else 1


if __name__ == "__main__":
    sys.exit(main())
