#!/usr/bin/env python3
"""
Извлечение раздела «Поурочное планирование» из ФРП.

Такой раздел есть у 14 программ из 65. Там, где он есть, поурочный план не
нужно разворачивать из тематического — можно взять готовые формулировки уроков
прямо из федеральной программы, как это делает оригинальный конструктор.

Таблица проще тематической: «№ урока | Тема урока» и, у части предметов,
третья колонка «Количество часов на практические работы». Отдельная сложность —
окружающий мир, где планирований два: под конкретный учебник и «для
самостоятельного конструирования».

Запуск: .venv/bin/python tools/frp_lessons.py <pdf...> -o build/frp-lessons
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frp_parser import clean_cell, drop_superscripts, normalise  # noqa: E402

RE_HEADING = re.compile(r"^\s*ПОУРОЧНОЕ\s+ПЛАНИРОВАНИЕ\s*\d?\s*$", re.M)
RE_STOP = re.compile(r"^\s*(ПЕРЕЧЕНЬ|ПРИЛОЖЕНИЕ|УЧЕБНО-МЕТОДИЧЕСКОЕ)\b", re.M)
# Заголовок класса бывает с пояснением: «6 КЛАСС. Планирование для
# Федерального недельного учебного плана» — это отдельный вариант плана для
# того же класса с другой недельной нагрузкой.
RE_CLASS = re.compile(r"^\s*(\d+)\s*КЛАСС\b\s*[.,:—–-]?\s*(.*)$", re.IGNORECASE)
RE_VARIANT = re.compile(r"^\s*ВАРИАНТ\s+(\d+)\.?\s*(.*)$", re.IGNORECASE)
RE_LESSON = re.compile(r"^\s*Урок\s*№?\s*(\d+)\.?\s*$", re.IGNORECASE)
RE_LESSON_INLINE = re.compile(r"^\s*Урок\s*№?\s*(\d+)\.?\s+(.+)$", re.IGNORECASE | re.S)
# Блок уроков одной строкой: «Уроки 69–102 | История нашего края | 34».
# Так ФРП оставляет школе часы на региональное содержание. Без этого шаблона
# строка выпадала целиком: у истории 5 класса поурочный план обрывался на
# 68 уроках при объявленных 102.
RE_LESSON_RANGE = re.compile(
    r"^\s*Уроки\s*№?\s*(\d+)\s*[–—−-]\s*(\d+)\.?\s*(.*)$", re.IGNORECASE | re.S
)
RE_INT = re.compile(r"^\d+$")
RE_TABLE_HEAD = re.compile(r"№\s*урока|№\s*п/п|Тема\s+урока|Количество\s+часов", re.IGNORECASE)
# Числовая колонка значит разное: у русского языка это «Количество часов на
# практические работы», у истории — «Количество часов. Всего», где у каждого
# урока стоит единица. Без различения все 408 уроков истории уезжали в графу
# практических работ, и в выгрузке набегало 102 часа практикума на класс.
RE_PRACTICE_HEAD = re.compile(r"практическ", re.IGNORECASE)


def lesson_pages(pdf: pdfplumber.PDF) -> tuple[int, int] | None:
    """
    Границы раздела в страницах (0-based включительно).

    Заголовок в оглавлении отличается тем, что за ним идут отточие и номер
    страницы, поэтому шаблон требует конца строки и в оглавление не попадает.
    """
    start = stop = None
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        if start is None:
            if RE_HEADING.search(text):
                start = i
        elif RE_STOP.search(text):
            stop = i - 1
            break
    if start is None:
        return None
    return start, (stop if stop is not None else len(pdf.pages) - 1)


def parse_row(cells: list[str], practice_col: bool) -> tuple[int, int, str, int] | None:
    """(первый урок, последний урок, тема, часы на практические работы) или None."""
    filled = [c for c in cells if c.strip()]
    if not filled:
        return None

    first = last = None
    rest: list[str] = []
    for c in filled:
        m = RE_LESSON_RANGE.match(c) or RE_LESSON.match(c) or RE_LESSON_INLINE.match(c)
        if m and first is None:
            first = int(m.group(1))
            if m.re is RE_LESSON_RANGE:
                last = int(m.group(2))
                tail = m.group(3).strip()
            else:
                last = first
                tail = m.group(2).strip() if m.re is RE_LESSON_INLINE else ""
            if tail:
                rest.append(tail)
        else:
            rest.append(c)

    if first is None or last is None or last < first:
        return None

    # Последняя ячейка-число — содержимое числовой колонки. Часами на
    # практические работы она считается, только если так названа в шапке;
    # иначе это общее число часов и в план его переносить не нужно.
    practice = 0
    if rest and RE_INT.match(rest[-1].strip()):
        value = int(rest.pop().strip())
        if practice_col:
            practice = value

    topic = " ".join(r for r in rest if not RE_TABLE_HEAD.search(r)).strip()
    return first, last, topic, practice


def extract(path: Path) -> dict:
    with pdfplumber.open(path) as pdf:
        rng = lesson_pages(pdf)
        if rng is None:
            return {"source": path.name, "error": "раздел «Поурочное планирование» не найден"}

        first, last = rng
        variants: list[dict] = []
        current_variant: dict | None = None
        current_grade: str | None = None
        # Тема урока может переноситься на следующую строку таблицы, поэтому
        # держим ссылку на последний урок и дописываем хвост в него.
        last_lesson: dict | None = None
        # Смысл числовой колонки берётся из шапки таблицы; до первой шапки
        # безопаснее считать её общим числом часов, а не практикумом.
        practice_col = False

        for i in range(first, last + 1):
            page = drop_superscripts(pdf.pages[i])
            text = page.extract_text() or ""

            # Просматривается вся страница, а не её начало: в русском языке
            # 5–9 поурочный план повторяется вторым блоком, и его заголовок
            # «5 КЛАСС» оказывался ниже — 170 уроков утекали в шестой класс.
            # От ложных срабатываний защищает ограничение длины строки.
            for line in text.splitlines():
                t = normalise(line)
                mv = RE_VARIANT.match(t)
                if mv:
                    # Явно объявленный вариант («ВАРИАНТ 2. Для
                    # самостоятельного конструирования») действует до
                    # следующего такого заголовка, включая все классы внутри.
                    current_variant = {"name": t.strip(), "classes": {}, "explicit": True}
                    variants.append(current_variant)
                    current_grade = None
                    last_lesson = None
                mc = RE_CLASS.match(t)
                # Без пояснения заголовок короткий; с пояснением — длинный, но
                # тогда пояснение и служит названием варианта. Ограничение
                # длины нужно, чтобы под шаблон не попадали ячейки таблицы.
                note = mc.group(2).strip() if mc else ""
                if mc and (len(t) <= 20 or note):
                    grade = mc.group(1)
                    if not variants:
                        variants.append({"name": "", "classes": {}})
                    base = variants[0]

                    if current_variant is not None and current_variant.get("explicit"):
                        # Внутри явно объявленного варианта классы идут подряд
                        # и остаются в нём.
                        pass
                    elif note:
                        # Пояснение у заголовка — альтернативный план для того
                        # же класса («Планирование для Федерального недельного
                        # учебного плана»).
                        current_variant = {"name": note, "classes": {}}
                        variants.append(current_variant)
                    elif grade not in base["classes"]:
                        # Обычный заголовок возвращает к основному плану: после
                        # альтернативного блока для одного класса документ
                        # продолжает основную последовательность классов.
                        current_variant = base
                    else:
                        current_variant = {
                            "name": f"Вариант {len(variants) + 1}",
                            "classes": {},
                        }
                        variants.append(current_variant)

                    current_grade = grade
                    current_variant["classes"].setdefault(current_grade, [])
                    last_lesson = None

            if current_variant is None or current_grade is None:
                continue

            bucket = current_variant["classes"][current_grade]
            for table in page.find_tables():
                for raw in table.extract():
                    cells = [clean_cell(c) for c in raw]
                    if any(RE_TABLE_HEAD.search(c) for c in cells if c):
                        practice_col = bool(RE_PRACTICE_HEAD.search(" ".join(filter(None, cells))))
                        continue
                    parsed = parse_row(cells, practice_col)
                    if parsed:
                        first_num, last_num, topic, practice = parsed
                        # Блок «Уроки 69–102» разворачивается в отдельные уроки:
                        # школа заполняет их своим региональным содержанием, и в
                        # редакторе для этого нужны строки, а не одна ячейка.
                        for n in range(first_num, last_num + 1):
                            last_lesson = {"number": n, "topic": topic, "practice": practice}
                            bucket.append(last_lesson)
                        if last_num > first_num:
                            last_lesson = None  # хвост дописывать некуда
                    elif last_lesson is not None:
                        # Строка без номера — продолжение темы предыдущего урока.
                        tail = " ".join(
                            c for c in cells if c.strip() and not RE_TABLE_HEAD.search(c)
                        ).strip()
                        if tail and not RE_INT.match(tail):
                            last_lesson["topic"] = f"{last_lesson['topic']} {tail}".strip()

    variants = [v for v in variants if any(v["classes"].values())]
    for v in variants:
        v["classes"] = {g: rows for g, rows in v["classes"].items() if rows}
        v.pop("explicit", None)
    return {"source": path.name, "pages": [first + 1, last + 1], "variants": variants}


def verify(doc: dict) -> list[str]:
    """Номера уроков внутри класса должны идти подряд с единицы."""
    problems: list[str] = []
    for v in doc.get("variants", []):
        tag = f"{v['name'][:30]}: " if v["name"] else ""
        for grade, rows in v["classes"].items():
            numbers = [r["number"] for r in rows]
            expected = list(range(1, len(numbers) + 1))
            if numbers != expected:
                gaps = sorted(set(expected) - set(numbers))[:5]
                problems.append(
                    f"{tag}{grade} кл.: уроков {len(numbers)}, "
                    f"нумерация с разрывами (нет {gaps})"
                )
            empty = sum(1 for r in rows if not r["topic"].strip())
            if empty:
                problems.append(f"{tag}{grade} кл.: {empty} урок(ов) без темы")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="ФРП: поурочное планирование -> JSON")
    ap.add_argument("pdf", type=Path, nargs="+")
    ap.add_argument("-o", "--outdir", type=Path, required=True)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)
    ok = absent = 0
    for path in args.pdf:
        try:
            doc = extract(path)
        except Exception as exc:  # noqa: BLE001
            print(f"[СБОЙ ] {path.name}: {type(exc).__name__}: {exc}")
            continue

        if doc.get("error"):
            absent += 1
            continue

        problems = verify(doc)
        doc["problems"] = problems
        (args.outdir / f"{path.stem}.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8"
        )

        total = sum(len(r) for v in doc["variants"] for r in v["classes"].values())
        names = [v["name"][:24] for v in doc["variants"] if v["name"]]
        tail = f" варианты={len(names)}" if names else ""
        if not problems:
            ok += 1
        print(
            f"[{'OK   ' if not problems else 'ПРОБЛ'}] {path.name}: уроков={total}{tail}"
        )
        for p in problems[:4]:
            print("        -", p)

    print(f"\nс поурочным планированием: {ok + len(args.pdf) - absent - ok} "
          f"(без разрывов: {ok}), без раздела: {absent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
