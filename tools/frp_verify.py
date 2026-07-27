#!/usr/bin/env python3
"""
Классификация расхождений в часах: ошибка разбора или дефект самого PDF.

Вынесено из frp_parser.py, потому что этим пользуются двое: разбор — чтобы
записать выводы в JSON, и проверка корпуса — чтобы не считать ошибкой то, что
разбор уже отнёс к дефектам источника. Раньше проверка выводила те же выводы
своим кодом и о разделении не знала, поэтому шесть арифметических ошибок в
официальных ФРП постоянно числились ошибками разбора.

Модуль намеренно не зависит от pdfplumber: проверке корпуса PDF не нужны.
"""

from __future__ import annotations


def numbering_continuous(cls: dict) -> bool:
    """
    Номера тем внутри каждого раздела идут подряд с единицы.

    Номера бывают составными («2.3») и простыми («3»); неномерованные строки
    (резерв, итоговый контроль) пропускаются — их в ФРП не нумеруют.
    """
    seen_any = False
    for section in cls["sections"]:
        tail: list[int] = []
        for topic in section["topics"]:
            num = topic["num"].strip()
            if not num:
                continue
            part = num.split(".")[-1]
            if not part.isdigit():
                return False
            tail.append(int(part))
        if tail:
            seen_any = True
            if tail != list(range(1, len(tail) + 1)):
                return False
    return seen_any


def num_follows(prev: str, cur: str) -> bool:
    """
    «2.1» -> «2.2»: тот же раздел и следующий по порядку номер темы.

    Условие намеренно жёсткое. У настоящего нового раздела меняется первая
    часть номера, а вторая начинается с единицы, так что признак срабатывает
    только там, где раздел разорван по ошибке.
    """
    prev, cur = prev.strip(), cur.strip()
    if "." not in prev or "." not in cur:
        return False
    prev_sec, _, prev_idx = prev.rpartition(".")
    cur_sec, _, cur_idx = cur.rpartition(".")
    if prev_sec != cur_sec or not prev_idx.isdigit() or not cur_idx.isdigit():
        return False
    return int(cur_idx) == int(prev_idx) + 1


def split_sections(cls: dict) -> list[str]:
    """
    Разделы, разорванные надвое при разборе.

    Обрывок текста, затёкший в колонку «№» при переносе строки, выглядит как
    заголовок раздела и делит настоящий раздел пополам — так у испанского НОО
    появлялись «разделы» «Рождеством).» и «глубиной проникновения». Видно это
    по нумерации: темы «нового» раздела продолжают нумерацию предыдущего.
    """
    bad: list[str] = []
    prev_last = ""
    for section in cls["sections"]:
        topics = section["topics"]
        if not topics:
            continue
        if prev_last and num_follows(prev_last, topics[0]["num"]):
            bad.append(section["name"])
        prev_last = topics[-1]["num"]
    return bad


def verify(doc: dict) -> tuple[list[str], list[str]]:
    """
    Возвращает (ошибки разбора, расхождения в самом источнике).

    Разделение существенное: если сумма часов по классу сходится с объявленным
    «ОБЩИМ КОЛИЧЕСТВОМ», разбор верен, а расхождение на уровне раздела — это
    арифметическая ошибка в официальном PDF. Такая ошибка реально есть,
    например, в истории 5 класса: «Итого по разделу 33» при сумме тем 22,
    притом что 6+22+20+20 = 68 совпадает с «Общим количеством часов по курсу».
    """
    parse_errors: list[str] = []
    source_errors: list[str] = []

    for course in doc.get("courses", []):
        prefix = f"{course['name']}: " if course.get("name") else ""
        for c in course["classes"]:
            g = c["grade"]
            for name in split_sections(c):
                parse_errors.append(
                    f"{prefix}{g} кл.: раздел разорван обрывком текста «{name[:38]}»"
                )
            # Если сумма ОБЪЯВЛЕННЫХ итогов разделов совпадает с объявленным
            # итогом класса, значит структура разобрана верно и расходится
            # только перечень тем внутри раздела — то есть ошибка в самом PDF,
            # а не в разборе. Так, в литературе 7 класса раздел объявляет
            # 5 часов при трёх темах на 1+1+2, и класс из-за этого недобирает
            # ровно один час.
            declared_sum = sum(
                s["declaredTotal"] if s["declaredTotal"] is not None else s["computedTotal"]
                for s in c["sections"]
            )
            structure_ok = (
                c["declaredTotal"] is not None
                and declared_sum == c["declaredTotal"]
                and any(s["declaredTotal"] is not None for s in c["sections"])
            )

            # Программы без строк «Итого по разделу» проверить сверкой итогов
            # нельзя, но нумерация тем показывает то же самое: если номера идут
            # сплошь и без пропусков, ни одна строка при разборе не потерялась,
            # и расхождение с объявленным итогом — свойство самого документа.
            # Так, труд 4 класса перечисляет девять тем на 34 часа И отдельную
            # строку «Подготовка портфолио — 1 час», объявляя при этом 34.
            if not structure_ok and c["declaredTotal"] is not None:
                structure_ok = numbering_continuous(c) and not any(
                    t["hours"] == 0 for s in c["sections"] for t in s["topics"]
                )
            # Модульные программы (музыка, физкультура, ОРКСЭ, труд) перечисляют
            # ВСЕ модули на выбор, поэтому сумма часов по таблице законно больше
            # годовой нормы: школа набирает из них нужный объём. Считать это
            # ошибкой разбора нельзя.
            if c.get("modular") and c["declaredTotal"] is not None:
                if c["computedTotal"] < c["declaredTotal"]:
                    parse_errors.append(
                        f"{prefix}{g} кл.: модулей на {c['computedTotal']} ч "
                        f"при годовой норме {c['declaredTotal']} ч"
                    )
                continue
            class_ok = c["declaredTotal"] is None or c["declaredTotal"] == c["computedTotal"]
            for s in c["sections"]:
                if s["declaredTotal"] is not None and s["declaredTotal"] != s["computedTotal"]:
                    msg = (
                        f"{prefix}{g} кл., раздел «{s['name'][:38]}»: "
                        f"итого {s['declaredTotal']} ≠ сумма тем {s['computedTotal']}"
                    )
                    (source_errors if class_ok or structure_ok else parse_errors).append(msg)
            if not class_ok:
                msg = (
                    f"{prefix}{g} кл.: ОБЩЕЕ КОЛИЧЕСТВО {c['declaredTotal']} "
                    f"≠ сумма {c['computedTotal']}"
                )
                (source_errors if structure_ok else parse_errors).append(msg)
    return parse_errors, source_errors
