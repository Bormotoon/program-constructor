#!/usr/bin/env python3
"""
Приводит разобранный корпус ФРП к редакции, действующей с 1 сентября 2026 года.

Программы на edsoo.ru опубликованы в июле 2025 года, а приказы Минпросвещения
России от 08.10.2025 № 729 и от 10.11.2025 № 808 вышли позже. ИСРО их не
переиздал (проверено 20.08.2026: файлы на сервере не менялись с 15.07.2025,
а собственный конструктор ИСРО шаблоны по иностранному языку и обществознанию
не выдаёт — новость ЕДСОО от 13.07.2026). Поэтому изменения вносятся здесь,
из текста самих приказов: orders/prikaz-729-ot-2025-10-08.txt и
orders/prikaz-808-ot-2025-11-10.txt.

Скрипт работает между tools/frp_parser.py и tools/build_frp_data.py
(`npm run frp:build` запускает его сам) и правит промежуточные файлы:
  build/frp          — тематическое планирование,
  build/frp-content  — пояснительная записка, содержание, результаты,
  build/frp-lessons  — поурочное планирование.

Что делает:
  * добавляет ФРП по ДНК России (приказ № 808, пункт 160-1) — нового предмета
    нет ни у ИСРО, ни в его конструкторе, официальный текст есть только в приказе;
  * заменяет обществознание ООО программой 9 класса (приказ № 729, пункт 151):
    с 01.09.2026 предмет изучается только в 9 классе;
  * заменяет обществознание СОО (базовый): 10 класс — новая программа
    (приказ № 729, пункт 123-1), 11 класс — переходная (пункт 123 в редакции
    того же приказа), которая действует до 01.09.2027;
  * вносит точечные правки в уроки литературы, географии и в содержание курса
    «История нашего края».

Текст приказов — это машинописная расшифровка правовой базы: официальная
публикация на publication.pravo.gov.ru представляет собой скан без текстового
слоя. Там, где расшифровка сама себе противоречит (пропущенный номер урока,
неверное число часов), скрипт не молчит и не догадывается: расхождение уходит
в sourceProblems, а оттуда — в предупреждение учителю.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDERS = ROOT / "orders"
FRP = ROOT / "build" / "frp"
CONTENT = ROOT / "build" / "frp-content"
LESSONS = ROOT / "build" / "frp-lessons"

ORDER_729 = "Приказ Минпросвещения России от 08.10.2025 № 729"
ORDER_808 = "Приказ Минпросвещения России от 10.11.2025 № 808"


def order(number: str) -> str:
    """Текст приказа одной строкой: переносы в файле — только для чтения."""
    path = next(ORDERS.glob(f"prikaz-{number}-*.txt"))
    body = "\n".join(
        line for line in path.read_text(encoding="utf-8").splitlines()
        if not line.startswith("#")
    )
    return " ".join(body.split())


def between(text: str, start: str, end: str) -> str:
    """Кусок текста между двумя дословными метками; обе обязаны найтись."""
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"не найдено начало фрагмента: {start!r}")
    j = text.find(end, i + len(start))
    if j < 0:
        raise SystemExit(f"не найден конец фрагмента: {end!r}")
    return text[i:j]


def strip_numbering(block: str, prefix: str) -> str:
    """
    Убирает номера подпунктов («151.3.2. ») — в рабочей программе они не нужны.

    Каждый подпункт становится абзацем: так текст и читается в документе.
    """
    return re.sub(rf"\s*{prefix}(?:\.\d+)+\.\s*", "\n", block).strip()


def subitem(block: str, prefix: str, number: str, upto: str | None = None) -> str:
    """Текст одного подпункта (со вложенными), без его номера."""
    start = f"{prefix}.{number}. "
    i = block.find(start)
    if i < 0:
        raise SystemExit(f"не найден подпункт {start!r}")
    j = block.find(f"{prefix}.{upto}. ", i) if upto else len(block)
    if j < 0:
        raise SystemExit(f"не найден подпункт {prefix}.{upto}.")
    return strip_numbering(block[i:j], re.escape(prefix))


# --- разбор таблиц поурочного планирования -----------------------------------

GAP_TOPIC = "[тема урока пропущена в доступном тексте приказа — впишите по официальной публикации]"

EXTRA_LESSON = re.compile(r"(Повторительно-обобщающ|Итогов|Заключение)")

RE_SECTION_TAIL = re.compile(
    r"\.\s(?:(?P<hours>\d+)\s)?(?P<section>[А-ЯЁ][^0-9]*?)\s(?P<total>\d+)\s+час(?:а|ов)?\.?\s*$"
)


def parse_hourly_table(table: str, problems: list[str], label: str):
    """
    Таблица «№ | Тема урока | Количество часов» с заголовками разделов внутри.

    Так свёрстано поурочное планирование ДНК России: строка-заголовок
    («Россия - наша Родина. 4 часа.») отделяет группы уроков, а уроки идут
    сплошной нумерацией. Возвращает уроки и разделы (имя, число уроков).
    Часы урока в этих таблицах всегда 1; если в расшифровке стоит другое
    число, оно не подставляется молча, а уходит в problems.
    """
    body = table.split("Количество часов", 1)[1]
    anchors: list[tuple[int, int, list[int]]] = []
    expected = 1
    for m in re.finditer(r"(?<= )(\d+)(?:, (\d+))?(?= [А-ЯЁ«])", body):
        nums = [int(g) for g in m.groups() if g]
        if nums[0] != expected:
            continue
        anchors.append((m.start(), m.end(), nums))
        expected = nums[-1] + 1

    lessons: list[dict] = []
    groups: list[dict] = [{"name": None, "count": 0, "declared": None}]
    # У 7 класса таблица открывается заголовком раздела, у 5 и 6 — уроком.
    head = re.match(r"\s*(?P<section>[А-ЯЁ][^0-9]*?)\s(?P<total>\d+)\s+час(?:а|ов)?\.",
                    body[: anchors[0][0]] if anchors else "")
    if head:
        groups = [{"name": head.group("section").strip(" ."), "count": 0,
                   "declared": int(head.group("total"))}]
    for pos, (start, end, nums) in enumerate(anchors):
        stop = anchors[pos + 1][0] if pos + 1 < len(anchors) else len(body)
        span = body[end:stop].strip().strip('";«» ').strip()
        tail = RE_SECTION_TAIL.search(span)
        next_section = None
        if tail:
            next_section = (tail.group("section").strip(" ."), int(tail.group("total")))
            span = span[: tail.start()] + "."
        hours = re.search(r"\s(\d+)$", span)
        if hours:
            if hours.group(1) != "1":
                problems.append(
                    f"{label}: у урока {nums[0]} в тексте приказа {hours.group(1)} ч, "
                    "хотя в таблице час на урок"
                )
            span = span[: hours.start()]
        topic = span.strip().rstrip(".")
        for n in nums:
            lessons.append({"number": n, "topic": topic, "practice": 0})
            # Итоговые уроки идут в таблице без заголовка раздела: приписывать
            # их к предыдущему — значит развалить его часы.
            if EXTRA_LESSON.match(topic):
                if groups[-1].get("extra") and groups[-1]["name"] == topic:
                    groups[-1]["count"] += 1
                else:
                    groups.append({"name": topic, "count": 1,
                                   "declared": None, "extra": True})
            else:
                groups[-1]["count"] += 1
        if next_section:
            groups.append({"name": next_section[0], "count": 0,
                           "declared": next_section[1]})

    if groups[0]["name"] is None:
        if groups[0]["count"]:
            groups[0]["name"] = lessons[0]["topic"]
        else:
            groups.pop(0)
    return lessons, groups


def parse_urok_table(table: str, problems: list[str], label: str) -> list[dict]:
    """
    Таблица «Урок 1 Тема урока…» — так свёрстано поурочное планирование
    обществознания. Часов в таблице нет: урок равен часу.
    """
    marks = list(re.finditer(r"Урок (\d+) ", table))
    lessons = []
    for i, m in enumerate(marks):
        stop = marks[i + 1].start() if i + 1 < len(marks) else len(table)
        topic = table[m.end(): stop].strip().rstrip('";').strip()
        lessons.append({"number": int(m.group(1)), "topic": topic, "practice": 0})
    numbers = [x["number"] for x in lessons]
    missing = sorted(set(range(1, max(numbers) + 1)) - set(numbers)) if numbers else []
    for n in missing:
        # Пропуск оставляем видимым: строка в плане есть, тема в ней — прямая
        # просьба сверить с официальной публикацией. Убрать строку значило бы
        # сдвинуть нумерацию и потерять час, придумать тему — соврать.
        problems.append(
            f"{label}: в доступном тексте приказа пропущен урок {n} — "
            "в плане он оставлен пустой строкой, впишите тему по официальной публикации"
        )
        lessons.append({"number": n, "topic": GAP_TOPIC, "practice": 0})
    lessons.sort(key=lambda x: x["number"])
    return lessons


def sections_by_summary(lessons: list[dict], blocks: list[str],
                        problems: list[str], label: str) -> list[dict]:
    """
    Разделы для таблиц без заголовков: границу задаёт сам поурочный план —
    «Повторительно-обобщающий урок по теме «X»». Имя и программное содержание
    раздела берутся из раздела «Содержание обучения» того же приказа.
    """
    groups: list[tuple[str, list[dict]]] = []
    current: list[dict] = []
    for lesson in lessons:
        current.append(lesson)
        m = re.search(r"по теме «(.+?)»", lesson["topic"])
        if m:
            if groups and groups[-1][0] == m.group(1):
                groups[-1][1].extend(current)  # обобщение занимает два урока
            else:
                groups.append((m.group(1), current))
            current = []
    if current:
        groups.append((current[0]["topic"], current))

    names = [name for name, _ in groups]
    sections = []
    for i, (name, text) in enumerate(zip(names, contents_for(names, blocks)), 1):
        if not text and not EXTRA_LESSON.match(name):
            problems.append(f"{label}: к разделу «{name}» не нашлось содержания обучения")
        sections.append(section(i, name, len(groups[i - 1][1]), text))
    return sections


def normalize(name: str) -> str:
    return re.sub(r"[^а-яa-z0-9]", "", name.lower().replace("ё", "е"))


def section(num: int, name: str, hours: int, content: str = "") -> dict:
    """
    Раздел тематического планирования с единственной темой.

    Новые программы тематического планирования не содержат вовсе — только
    содержание обучения и поурочный план. Раздел здесь и есть тема: тот же
    приём уже применён в ФРП по истории к курсу «История нашего края».
    """
    return {
        "name": name,
        "course": "",
        "declaredTotal": hours,
        "computedTotal": hours,
        "topics": [{
            "num": str(num), "name": name, "hours": hours,
            "content": content, "activity": "",
        }],
    }


def without_heading(text: str) -> str:
    """Убирает заголовок подпункта («Пояснительная записка.») — он свой у нас."""
    head, _, rest = text.partition("\n")
    return rest.strip() if rest and len(head.split()) <= 12 else text


def content_blocks(block: str, prefix: str, first: str, upto: str) -> list[str]:
    """Подпункты «Содержания обучения» — по одному на раздел, в порядке текста."""
    body = subitem(block, prefix, first, upto)
    return [p.strip() for p in without_heading(body).split("\n") if p.strip()]


def locate_content(name: str, blocks: list[str]) -> tuple[int, int] | None:
    """
    Где в «Содержании обучения» начинается раздел: (номер подпункта, смещение).

    Обычно раздел — это подпункт целиком. Но в обществознании 11 класса
    «Правовое регулирование общественных отношений» идёт внутри подпункта
    «Политическая сфера», а поурочный план обобщает их порознь, — поэтому
    ищется и начало предложения внутри подпункта.
    """
    # «Заключение. Единство системы ценностей России» в поурочном плане —
    # это раздел «Единство системы ценностей России» в содержании обучения.
    keys = [name, re.sub(r"^(Введение|Заключение)\.\s*", "", name)]
    for key in keys:
        for i, text in enumerate(blocks):
            if normalize(text).startswith(normalize(key)):
                return i, 0
    for key in keys:
        for i, text in enumerate(blocks):
            at = text.find(key)
            if at > 0 and text[at - 2: at] == ". ":
                return i, at
    return None


def contents_for(names: list[str], blocks: list[str]) -> list[str]:
    """Содержание каждого раздела; общий подпункт делится по границам разделов."""
    found = [locate_content(name, blocks) for name in names]
    out = []
    for k, place in enumerate(found):
        if place is None:
            out.append("")
            continue
        i, start = place
        end = len(blocks[i])
        for other in found[k + 1:]:
            if other and other[0] == i and other[1] > start:
                end = other[1]
                break
        out.append(blocks[i][start:end].strip())
    return out


def klass(grade: int, hours: int, content: str, sections: list[dict],
          notes: list[str] | None = None) -> dict:
    return {
        "grade": grade,
        "declaredTotal": hours,
        "computedTotal": sum(s["computedTotal"] for s in sections),
        "modular": False,
        "notes": notes or [],
        "sections": sections,
    }


def write(name: str, doc: dict, content: dict, lessons: dict | None) -> None:
    doc.setdefault("problems", [])
    doc.setdefault("sourceProblems", [])
    FRP.mkdir(parents=True, exist_ok=True)
    CONTENT.mkdir(parents=True, exist_ok=True)
    LESSONS.mkdir(parents=True, exist_ok=True)
    (FRP / f"{name}.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    (CONTENT / f"{name}.json").write_text(
        json.dumps(content, ensure_ascii=False), encoding="utf-8")
    if lessons:
        (LESSONS / f"{name}.json").write_text(
            json.dumps(lessons, ensure_ascii=False), encoding="utf-8")


def drop(*names: str) -> None:
    """Убирает программу, которую приказ отменил, из промежуточных файлов."""
    for name in names:
        for folder in (FRP, CONTENT, LESSONS):
            path = folder / f"{name}.json"
            if path.exists():
                path.unlink()


# --- ДНК России (приказ № 808, пункт 160-1) ----------------------------------

def dnkr(text: str) -> None:
    prefix = "160 1 "
    block = between(
        text,
        'дополнить пунктом 160 1 следующего содержания: "160 1 . Федеральная рабочая программа',
        "144) в подпункте 161.1 пункта 161",
    )
    problems: list[str] = []
    hours_by_grade = {5: 17, 6: 34, 7: 34}
    classes, lesson_classes, content_by_grade = [], {}, {}
    for grade, (first, upto) in {5: ("3", "4"), 6: ("4", "5"), 7: ("5", "6")}.items():
        blocks = content_blocks(block, prefix, first, upto)
        content_by_grade[str(grade)] = "\n".join(blocks)
        table = subitem(block, prefix, f"7.{grade - 4}",
                        f"7.{grade - 3}" if grade < 7 else None)
        label = f"{grade} кл."
        lessons, groups = parse_hourly_table(table, problems, label)
        names = [g["name"] for g in groups]
        sections = []
        for i, (group, text) in enumerate(zip(groups, contents_for(names, blocks)), 1):
            name, counted, declared = group["name"], group["count"], group["declared"]
            if declared is not None and declared != counted:
                problems.append(
                    f"{label}, раздел «{name}»: объявлено {declared} ч, уроков {counted}")
            sections.append(section(i, name, counted, text))
        classes.append(klass(grade, hours_by_grade[grade], content_by_grade[str(grade)], sections))
        lesson_classes[str(grade)] = lessons
        if len(lessons) != hours_by_grade[grade]:
            problems.append(
                f"{label}: уроков {len(lessons)}, а по учебному плану "
                f"{hours_by_grade[grade]} ч")

    subject_common = without_heading(subitem(block, prefix, "6.3", "6.4"))
    subject = {
        str(g): subject_common + "\n" + without_heading(
            subitem(block, prefix, f"6.{n}", f"6.{n + 1}" if n < 6 else "7"))
        for g, n in {5: 4, 6: 5, 7: 6}.items()
    }
    write(
        "prikaz-808-dnkr",
        {
            "source": ORDER_808, "subject": "ДУХОВНО-НРАВСТВЕННАЯ КУЛЬТУРА РОССИИ",
            "level": "ООО", "grades": [5, 6, 7], "variant": "",
            "courses": [{"name": "", "pages": [], "classes": classes}],
            "sourceProblems": problems,
        },
        {
            "source": ORDER_808,
            "notes": {"": without_heading(subitem(block, prefix, "2", "3"))},
            "results": {
                "personal": {"": without_heading(subitem(block, prefix, "6.1", "6.2"))},
                "meta": {"": without_heading(subitem(block, prefix, "6.2", "6.3"))},
                "subject": {"": subject},
            },
            "courses": {"": content_by_grade},
        },
        {"source": ORDER_808, "pages": [], "variants": [
            {"name": "", "classes": lesson_classes}], "problems": []},
    )
    print(f"ДНК России: классы 5–7, уроков "
          f"{sum(len(v) for v in lesson_classes.values())}, замечаний {len(problems)}")
    for p in problems:
        print("   ·", p)


# --- обществознание ООО (приказ № 729, пункт 151) ----------------------------

def obshhestvoznanie_ooo(text: str) -> None:
    """
    С 01.09.2026 обществознание изучается только в 9 классе — программа 6–9
    классов с этой даты не действует, поэтому она из корпуса убирается.
    """
    block = between(text, "22) пункт 151 изложить в следующей редакции",
                    "23) в пункте 152")
    problems: list[str] = []
    blocks = content_blocks(block, "151", "3", "4")
    lessons = parse_urok_table(
        between(block, "Таблица 18.2", "ОБЩЕЕ КОЛИЧЕСТВО"), problems, "9 кл.")
    sections = sections_by_summary(lessons, blocks, problems, "9 кл.")
    total = sum(s["computedTotal"] for s in sections)
    if total != 34:
        problems.append(f"9 кл.: уроков {total}, а по учебному плану 34 ч")

    drop("2025_ooo_frp_obshhestvo-6-9")
    write(
        "prikaz-729-obshhestvoznanie-ooo",
        {
            "source": ORDER_729, "subject": "ОБЩЕСТВОЗНАНИЕ", "level": "ООО",
            "grades": [9], "variant": "",
            "courses": [{"name": "", "pages": [], "classes": [
                klass(9, 34, "", sections)]}],
            "sourceProblems": problems,
        },
        {
            "source": ORDER_729,
            "notes": {"": without_heading(subitem(block, "151", "2", "3"))},
            "results": {
                "personal": {"": without_heading(subitem(block, "151", "4.1", "4.3"))},
                "meta": {"": without_heading(subitem(block, "151", "4.3", "4.4"))},
                "subject": {"": {"9": without_heading(subitem(block, "151", "4.4", "5"))}},
            },
            "courses": {"": {"9": "\n".join(blocks)}},
        },
        {"source": ORDER_729, "pages": [], "variants": [
            {"name": "", "classes": {"9": lessons}}], "problems": []},
    )
    print(f"Обществознание ООО: 9 класс, уроков {len(lessons)}, "
          f"замечаний {len(problems)}")
    for p in problems:
        print("   ·", p)


# --- обществознание СОО, базовый уровень (приказ № 729) ----------------------

def obshhestvoznanie_soo(text: str) -> None:
    """
    Переходный год. С 01.09.2026 в 10 классе действует новая программа
    (пункт 123-1), а 11 класс до 01.09.2027 доучивается по прежней (пункт 123
    в редакции того же приказа): у неё с 01.09.2026 утратили силу только
    десятиклассные части. Поэтому 10 класс собирается из новой программы,
    11 класс — из прежней. В 2027/2028 году 11 класс перейдёт на новую
    программу и станет 34-часовым — тогда этот код упрощается до одной.
    """
    new = between(text, "8) дополнить пунктом 123(1)", "9) в пункте 127")
    new = re.sub(r"123\s*\(\s*1\s*\)\s*\.\s*(?=\d)", "123(1).", new)
    old = between(text, "7) подпункты 123.1 - 123.6 пункта 123 изложить",
                  "8) дополнить пунктом 123(1)")
    problems: list[str] = []

    blocks10 = content_blocks(new, "123(1)", "3", "4")
    lessons10 = parse_urok_table(
        between(new, "Таблица 19 1 10 класс", "ОБЩЕЕ КОЛИЧЕСТВО"), problems, "10 кл.")
    sections10 = sections_by_summary(lessons10, blocks10, problems, "10 кл.")

    blocks11 = content_blocks(old, "123", "4", "5")
    lessons11 = parse_urok_table(
        between(old, "Таблица 19.1 11 класс", "ОБЩЕЕ КОЛИЧЕСТВО"), problems, "11 кл.")
    sections11 = sections_by_summary(lessons11, blocks11, problems, "11 кл.")

    drop("frp_obshhestvoznanie-10-11-klassy_baza")
    write(
        "prikaz-729-obshhestvoznanie-soo-baza",
        {
            "source": ORDER_729, "subject": "ОБЩЕСТВОЗНАНИЕ", "level": "СОО",
            "grades": [10, 11], "variant": "базовый",
            "courses": [{"name": "", "pages": [], "classes": [
                klass(10, 68, "", sections10),
                klass(11, 68, "", sections11),
            ]}],
            "sourceProblems": problems,
        },
        {
            "source": ORDER_729,
            "notes": {"": without_heading(subitem(new, "123(1)", "2", "3"))},
            "results": {
                "personal": {"": without_heading(subitem(new, "123(1)", "5.1", "5.3"))},
                "meta": {"": without_heading(subitem(new, "123(1)", "5.3", "5.4"))},
                "subject": {"": {
                    "10": without_heading(subitem(new, "123(1)", "5.4", "5.5")),
                    "11": without_heading(subitem(old, "123", "5.5", "6")),
                }},
            },
            "courses": {"": {"10": "\n".join(blocks10), "11": "\n".join(blocks11)}},
        },
        {"source": ORDER_729, "pages": [], "variants": [
            {"name": "", "classes": {"10": lessons10, "11": lessons11}}], "problems": []},
    )
    print(f"Обществознание СОО (базовый): 10 класс — {len(lessons10)} уроков "
          f"(новая программа), 11 класс — {len(lessons11)} уроков (переходная), "
          f"замечаний {len(problems)}")
    for p in problems:
        print("   ·", p)


# --- точечные правки в уже разобранных программах ----------------------------

def load(folder: Path, name: str) -> dict:
    return json.loads((folder / f"{name}.json").read_text(encoding="utf-8"))


def save(folder: Path, name: str, doc: dict) -> None:
    (folder / f"{name}.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def set_lesson(doc: dict, grade: int, number: int, topic: str, done: list[str]) -> None:
    for variant in doc["variants"]:
        for lesson in variant["classes"].get(str(grade), []):
            if lesson["number"] == number:
                lesson["topic"] = topic
                done.append(f"{grade} кл., урок {number}")
                return
    raise SystemExit(f"не найден урок {number} в {grade} классе")


def replace_everywhere(doc: dict, pairs: list[tuple[str, str]], done: list[str]) -> dict:
    """Замена дословных строк по всему документу — так правятся ссылки
    на переименованные документы стратегического планирования."""
    text = json.dumps(doc, ensure_ascii=False)
    for old, new in pairs:
        if old not in text:
            # Правка уже применена — скрипт должен переживать повторный запуск.
            if new in text:
                continue
            raise SystemExit(f"нечего заменять: {old!r}")
        text = text.replace(old, new)
        done.append(old[:40])
    return json.loads(text)


def istoriya_nashego_kraya(text808: str) -> None:
    """
    Содержание курса «История нашего края» ФРП по истории не приводит — его
    определил приказ № 729 и переписал приказ № 808 (пункт 133). В разобранном
    планировании раздел есть, а программное содержание у него пустое.
    """
    block = between(text808, "133) в пункте 150:", "134) ")
    parts = re.findall(
        r'подпункт 150\.\d\.\d пункта 150 изложить в следующей редакции: '
        r'"150\.\d\.\d\.\s*(.*?)"\s*[;.]', block)
    if len(parts) != 3:
        raise SystemExit(f"ожидались три редакции «Истории нашего края», найдено {len(parts)}")

    doc = load(FRP, "2025_ooo_frp_istoriya_5-9")
    filled = 0
    for klass_ in doc["courses"][0]["classes"]:
        if klass_["grade"] not in (5, 6, 7):
            continue
        for part in klass_["sections"]:
            if normalize(part["name"]) != "историянашегокрая":
                continue
            part["name"] = "История нашего края"
            for topic in part["topics"]:
                topic["name"] = "История нашего края"
                topic["content"] = parts[klass_["grade"] - 5]
            filled += 1
    if filled != 3:
        raise SystemExit(f"раздел «История нашего края» найден в {filled} классах из трёх")
    save(FRP, "2025_ooo_frp_istoriya_5-9", doc)
    print("История нашего края: программное содержание проставлено в 5, 6 и 7 классах")


def lesson_patches() -> None:
    """Уроки, переписанные приказами после публикации ФРП."""
    done: list[str] = []

    name = "2025_ooo_frp_literatura_5-9"
    doc = load(LESSONS, name)
    set_lesson(doc, 9, 75, "Внеклассное чтение. Актуальность стихотворений поэтов "
               "XVIII – XIX вв. Например, «Бог» Г.Р. Державина, «Клеветникам России» "
               "А.С. Пушкина, «К славянам» Ф.И. Тютчева, «К не нашим» Н.М. Языкова", done)
    save(LESSONS, name, doc)

    name = "2025_soo_frp_literatura_10_11_baz"
    doc = load(LESSONS, name)
    set_lesson(doc, 11, 89, "Поэзия второй половины XX – начала XXI вв. Стихотворения "
               "Б.А. Ахмадулиной, А.А. Вознесенского, В.С. Высоцкого, Е.А. Евтушенко, "
               "Р.И. Рождественского и других)", done)
    set_lesson(doc, 11, 90, "Художественные приемы и особенности языка поэзии второй "
               "половины XX – начала XXI вв. Идейно-художественное своеобразие "
               "стихотворения Р.И. Рождественского «Что же такое «мы»?..", done)
    save(LESSONS, name, doc)

    # География: уроки 58 и 66 приказ поменял местами.
    name = "2025_ooo_frp_geografiya-5-9"
    doc = load(LESSONS, name)
    set_lesson(doc, 8, 58, "Половой и возрастной состав населения России", done)
    set_lesson(doc, 8, 66, "Резервный урок. Обобщающее повторение по темам «Народы "
               "и религии России» и «Половой и возрастной состав населения России»", done)
    strategies = [
        ("«Стратегия пространственного развития Российской Федерации на период "
         "до 2025 года»",
         "«Стратегия пространственного развития Российской Федерации на период "
         "до 2030 года»"),
        ("«Энергетической стратегии России на период до 2035 года», утвержденной "
         "распоряжением Правительства Российской Федерации от 9 июня 2020 г. N 1523-р",
         "«Энергетической стратегии России на период до 2050 года», утвержденной "
         "распоряжением Правительства Российской Федерации от 12 апреля 2025 г. N 908-р"),
        ("приложения N 1 и N 18", "приложения N 1 и N 2"),
        ("Стратегия экологической безопасности Российской Федерации до 2025 года",
         "Документы стратегического планирования в сфере обеспечения "
         "экологической безопасности"),
    ]
    save(LESSONS, name, replace_everywhere(doc, strategies, done))
    for folder in (FRP, CONTENT):
        doc = load(folder, name)
        text = json.dumps(doc, ensure_ascii=False)
        pairs = [p for p in strategies if p[0] in text]
        if pairs:
            save(folder, name, replace_everywhere(doc, pairs, done))
        del text

    # Труд: школа сама раскладывает модули по часам (приказ № 729, пункт 25).
    name = "20_frp_trud_tehnologiya_5_9_klassy_itog_na_sajt"
    doc = load(CONTENT, name)
    addition = ("Организация вправе самостоятельно определять последовательность "
                "изучения модулей и количество часов для их освоения (при сохранении "
                "общего количества часов).")
    for key, note in doc["notes"].items():
        if addition not in note:
            doc["notes"][key] = note.rstrip() + "\n" + addition
    save(CONTENT, name, doc)
    done.append("труд: право школы распределять часы модулей")
    print(f"Точечные правки: {len(done)}")


def main() -> int:
    if not FRP.exists():
        print(f"нет каталога {FRP}; сначала запустите tools/frp_parser.py", file=sys.stderr)
        return 1
    text729, text808 = order("729"), order("808")
    dnkr(text808)
    obshhestvoznanie_ooo(text729)
    obshhestvoznanie_soo(text729)
    istoriya_nashego_kraya(text808)
    lesson_patches()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
