#!/usr/bin/env python3
"""
Извлечение текстовых разделов ФРП: пояснительной записки, содержания обучения
и планируемых результатов.

Это отдельный проход, а не часть tools/frp_parser.py, по двум причинам:
разделы набраны обычным текстом без таблиц, поэтому берутся быстрым pdftotext,
а не медленным pdfplumber; и запускать его можно независимо, не переразбирая
заново весь корпус таблиц (это десятки минут).

Запуск: .venv/bin/python tools/frp_content.py <pdf...> -o build/frp-content
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RE_START = re.compile(r"^\s*СОДЕРЖАНИЕ\s+ОБУЧЕНИЯ\s*\d?\s*$", re.M)
RE_STOP = re.compile(
    r"^\s*(ПЛАНИРУЕМЫЕ\s+РЕЗУЛЬТАТЫ|ТЕМАТИЧЕСКОЕ\s+ПЛАНИРОВАНИЕ)\b", re.M
)
RE_CLASS = re.compile(r"^\s*(\d+)\s*КЛАСС\s*\d?\s*$", re.M)
# Предметные результаты размечены по классам не заголовком, а фразой. Оборот
# у разных ФРП свой: «К концу обучения в 1 классе обучающийся научится:»
# у русского языка, «Предметные результаты освоения программы по биологии
# к концу обучения в 5 классе:» у биологии. Без разбивки учителю второго
# класса доставались результаты всех лет обучения сразу.
RE_RESULTS_CLASS = re.compile(
    r"^[^\n]{0,90}?\bк\s+концу\s+обучения\s+в?о?\s*(\d+)\s*класс\w*[^\n]*$",
    re.M | re.IGNORECASE,
)
# Колонтитул повторяется на каждой странице и в текст содержания не входит.
RE_RUNNING = re.compile(r"^\s*Федеральная рабочая программа\s*\|.*$", re.M)
RE_PAGENO = re.compile(r"^\s*\d{1,3}\s*$", re.M)
# Сборники курсов (математика 5–9) содержат по разделу «Содержание обучения»
# на каждый курс, поэтому блоки помечаются названием курса — так же, как это
# делает разбор тематического планирования.
RE_COURSE_MENTION = re.compile(r"учебного\s+курса\s*[«\"](.+?)[»\"]", re.IGNORECASE)

# Заголовки остальных текстовых разделов. Требование «конец строки сразу за
# заголовком» отсекает оглавление: там за названием идут отточие и номер
# страницы. Длинные названия в оглавлении переносятся, и первая строка переноса
# отточия не содержит, поэтому поиск ведётся только ПОСЛЕ пояснительной
# записки — оглавление всегда идёт до неё.
RE_NOTE_START = r"ПОЯСНИТЕЛЬНАЯ\s+ЗАПИСКА"
RESULT_PARTS = (
    ("personal", r"ЛИЧНОСТНЫЕ\s+РЕЗУЛЬТАТЫ"),
    ("meta", r"МЕТАПРЕДМЕТНЫЕ\s+РЕЗУЛЬТАТЫ"),
    ("subject", r"ПРЕДМЕТНЫЕ\s+РЕЗУЛЬТАТЫ"),
)
# Границей блока служит ЛЮБОЙ следующий заголовок верхнего уровня. Без этого
# в сборниках курсов предметные результаты первого курса вбирали в себя
# пояснительную записку и содержание обучения следующего: у математики 5–9
# «результаты» начинались словами «Натуральные числа и нуль».
RE_ANY_HEAD = re.compile(
    r"^\s*(ПОЯСНИТЕЛЬНАЯ\s+ЗАПИСКА|СОДЕРЖАНИЕ\s+ОБУЧЕНИЯ|ПЛАНИРУЕМЫЕ\s+РЕЗУЛЬТАТЫ|"
    r"ЛИЧНОСТНЫЕ\s+РЕЗУЛЬТАТЫ|МЕТАПРЕДМЕТНЫЕ\s+РЕЗУЛЬТАТЫ|ПРЕДМЕТНЫЕ\s+РЕЗУЛЬТАТЫ|"
    r"ТЕМАТИЧЕСКОЕ\s+ПЛАНИРОВАНИЕ|ПОУРОЧНОЕ\s+ПЛАНИРОВАНИЕ|ПЕРЕЧЕНЬ)\b",
    re.M,
)


def normalise(s: str) -> str:
    s = s.replace("\xad", "").replace("\xa0", " ")
    return unicodedata.normalize("NFC", s)


def clean_block(text: str) -> str:
    """Убирает колонтитулы и номера страниц, склеивает разорванные абзацы."""
    text = RE_RUNNING.sub("", text)
    text = RE_PAGENO.sub("", text)

    out: list[str] = []
    for raw in text.splitlines():
        line = normalise(raw).rstrip()
        if not line.strip():
            if out and out[-1] != "":
                out.append("")
            continue
        # Абзац в исходнике начинается с отступа; строки без отступа —
        # продолжение предыдущего и приклеиваются к нему.
        indented = raw.startswith(("    ", "\t")) or not out or out[-1] == ""
        if indented:
            out.append(line.strip())
        else:
            out[-1] = f"{out[-1]} {line.strip()}"

    # Переносы вида «естественно-\nнаучный» склеиваем обратно.
    joined = "\n".join(out)
    joined = re.sub(r"(\w)-\s+(\w)", r"\1\2", joined)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    return joined.strip()


# Признак строки таблицы в выводе pdftotext -layout: широкий пробельный
# разрыв внутри строки, которым разделены колонки.
RE_WIDE_GAP = re.compile(r"\S\s{3,}\S")


def drop_trailing_table(text: str) -> str:
    """
    Убирает таблицу, оказавшуюся в хвосте пояснительной записки.

    Пояснительная записка по истории заканчивается таблицей распределения
    курсов по классам, и в текстовом виде она разваливается: «История России.
    Россия в XVIII – начале XIX в.: от царства к империи 9 Всеобщая история.
    История нового времени. XIX – начало ХХ в.». Часы по классам всё равно
    берутся из тематического планирования, поэтому такой хвост только мешает.

    Подпись таблицы («Таблица 1. Распределение учебных часов…») остаётся: это
    законченное предложение из ФРП, и то же самое сказано абзацем выше. А вот
    названия колонок, перенесённые на отдельные строки («Обобщающее
    повторение»), отрезаются вместе с таблицей — сами по себе они выглядят
    обрывком.
    """
    lines = text.splitlines()
    start = None
    rows = 0
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        if not line:
            continue
        if RE_WIDE_GAP.search(lines[i]):
            rows += 1
            start = i
        elif len(line) < 80:
            continue  # перенос ячейки на следующую строку — они короткие
        else:
            break
    if rows < 4 or start is None:
        return text

    # Выше первой строки таблицы могут стоять её же заголовки колонок,
    # перенесённые по словам. От текста они отличаются тем, что не заканчивают
    # предложение.
    while start > 0:
        prev = lines[start - 1].strip()
        if not prev or prev.endswith((".", ":", "!", "?", ";")):
            break
        start -= 1
    return "\n".join(lines[:start]).rstrip()


def by_class(body: str, marks_re: re.Pattern[str] = RE_CLASS) -> dict[str, str]:
    """
    Текст, разбитый по классам; без разметки классов весь текст под ключом "".

    Так устроены и содержание обучения, и предметные результаты: у русского
    языка они расписаны по классам, у истории идут одним блоком на весь
    уровень образования. Разметка при этом разная — содержание размечено
    заголовками «N КЛАСС», а результаты строкой «К концу обучения в N классе
    обучающийся научится», — поэтому шаблон передаётся снаружи.

    Текст до первого заголовка отбрасывается: это остаток предыдущего раздела,
    а не содержание класса. Проверено по всему корпусу — потерь нет.
    """
    marks = list(marks_re.finditer(body))
    if not marks:
        content = clean_block(body)
        return {"": content} if content else {}

    out: dict[str, str] = {}
    for j, mk in enumerate(marks):
        end = marks[j + 1].start() if j + 1 < len(marks) else len(body)
        # Строка «К концу обучения…» — часть текста результатов, а не только
        # заголовок, поэтому у неё сохраняется всё совпадение целиком.
        head = mk.start() if marks_re is RE_RESULTS_CLASS else mk.end()
        content = clean_block(body[head:end])
        if content:
            out[mk.group(1)] = content
    return out


def section_blocks(text: str, pattern: str, start: int) -> list[tuple[int, str]]:
    """Блоки одноимённого раздела после позиции start: (позиция заголовка, текст)."""
    out: list[tuple[int, str]] = []
    for m in re.finditer(rf"^\s*{pattern}\s*\d?\s*$", text, re.M):
        if m.start() < start:
            continue
        nxt = RE_ANY_HEAD.search(text, m.end())
        out.append((m.start(), text[m.end() : nxt.start() if nxt else len(text)]))
    return out


def pair_with_courses(blocks: list[tuple[int, str]], courses: list[str]) -> list[tuple[str, str]]:
    """
    Сопоставляет блоки раздела курсам по порядку следования.

    Сборник курсов (математика 5–9 = математика + алгебра + геометрия +
    вероятность) идёт единицами «пояснительная записка → содержание обучения →
    предметные результаты → тематическое планирование», а перед ними стоит
    общая часть на весь предмет. Поэтому таких блоков бывает на один больше,
    чем курсов: лишний первый — общий, остальные идут по порядку.

    Привязка по ближайшему содержанию обучения не годится: записка курса стоит
    ПЕРЕД его содержанием, а результаты — после, и одно правило на оба случая
    сдвигает записки на курс назад. Личностные и метапредметные результаты
    в сборниках одни на весь предмет, поэтому блоков меньше, чем курсов —
    тогда все они общие.
    """
    if len(blocks) < len(courses):
        return [("", body) for _, body in blocks]
    extra = len(blocks) - len(courses)
    out: list[tuple[str, str]] = []
    for i, (_, body) in enumerate(blocks):
        j = i - extra
        out.append((courses[j] if 0 <= j < len(courses) else "", body))
    return out


def extract(path: Path) -> dict:
    text = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"],
        capture_output=True,
        text=True,
        timeout=600,
    ).stdout

    # Всё ищется ПОСЛЕ первой пояснительной записки: до неё идёт оглавление,
    # где те же заголовки стоят с отточием и номером страницы.
    first = re.search(rf"^\s*{RE_NOTE_START}\s*\d?\s*$", text, re.M)
    note_at = first.start() if first else 0

    content_blocks = section_blocks(text, r"СОДЕРЖАНИЕ\s+ОБУЧЕНИЯ", note_at)
    # Курс блока содержания определяется по последнему упоминанию «учебного
    # курса «X»» перед его началом. У обычных программ курс один и лежит под
    # пустым ключом; порядок этого списка задаёт порядок курсов в документе.
    course_names: list[str] = []
    for pos, _ in content_blocks:
        mentions = list(RE_COURSE_MENTION.finditer(text[:pos]))
        course_names.append(
            mentions[-1].group(1).strip() if mentions and len(content_blocks) > 1 else ""
        )

    courses: dict[str, dict[str, str]] = {}
    for name, (_, body) in zip(course_names, content_blocks):
        classes = by_class(body)
        if classes:
            courses.setdefault(name, {}).update(classes)

    notes: dict[str, str] = {}
    for name, body in pair_with_courses(section_blocks(text, RE_NOTE_START, note_at), course_names):
        block = drop_trailing_table(clean_block(body))
        if block:
            notes.setdefault(name, block)

    results: dict = {}
    for key, pattern in RESULT_PARTS:
        pairs = pair_with_courses(section_blocks(text, pattern, note_at), course_names)
        for name, body in pairs:
            if key == "subject":
                classes = by_class(body, RE_RESULTS_CLASS)
                if len(classes) == 1 and "" in classes:
                    # Разметки «К концу обучения…» нет — пробуем заголовки
                    # «N КЛАСС»: так размечены результаты у части программ.
                    classes = by_class(body)
                if classes:
                    results.setdefault("subject", {}).setdefault(name, {}).update(classes)
            else:
                block = clean_block(body)
                if block:
                    results.setdefault(key, {}).setdefault(name, block)

    if not content_blocks:
        return {
            "source": path.name,
            "error": "раздел «Содержание обучения» не найден",
            "notes": notes,
            "results": results,
            "courses": {},
        }

    return {"source": path.name, "notes": notes, "results": results, "courses": courses}


def main() -> int:
    ap = argparse.ArgumentParser(description="ФРП: раздел «Содержание обучения» -> JSON")
    ap.add_argument("pdf", type=Path, nargs="+")
    ap.add_argument("-o", "--outdir", type=Path, required=True)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)
    ok = 0
    for path in args.pdf:
        try:
            doc = extract(path)
        except Exception as exc:  # noqa: BLE001
            print(f"[СБОЙ ] {path.name}: {type(exc).__name__}: {exc}")
            continue

        (args.outdir / f"{path.stem}.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        if doc.get("error"):
            print(f"[СБОЙ ] {path.name}: {doc['error']}")
            continue

        ok += 1
        total = sum(len(v) for cls in doc["courses"].values() for v in cls.values())
        names = [c for c in doc["courses"] if c]
        tail = f" курсы={names}" if names else ""
        n_classes = sum(len(c) for c in doc["courses"].values())
        missing = [
            label
            for label, present in (
                ("записка", doc["notes"]),
                ("личностные", doc["results"].get("personal")),
                ("метапредметные", doc["results"].get("meta")),
                ("предметные", doc["results"].get("subject")),
            )
            if not present
        ]
        if missing:
            tail += f" НЕТ: {', '.join(missing)}"
        print(f"[OK   ] {path.name}: классов={n_classes} знаков={total}{tail}")

    print(f"\nизвлечено: {ok} из {len(args.pdf)}")
    return 0 if ok == len(args.pdf) else 1


if __name__ == "__main__":
    sys.exit(main())
