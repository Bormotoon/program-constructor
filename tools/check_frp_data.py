#!/usr/bin/env python3
"""
Проверка корпуса ФРП, который потребляет приложение.

Прежний test-generator.ts проверял шаблоны против строк, написанных теми же
авторами, и потому проходил даже на предметах-заглушках. Здесь проверяется то,
что действительно может сломаться при разборе PDF: сходимость часов,
непустые темы, отсутствие «класса 0» и совпадение каталога с файлами планов.

Проверка не зависит от pdfplumber и от исходных PDF: корпус приложения
(src/data/frp) проверяется всегда, промежуточные результаты разбора (build/) —
если они есть. Поэтому её можно запускать в чистом клоне и в CI.

Запуск: python3 tools/check_frp_data.py
Код возврата 1, если есть ошибки (пригодно для CI).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from frp_verify import verify

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "build" / "frp"
APP = ROOT / "src" / "data" / "frp"
LESSONS = ROOT / "build" / "frp-lessons"

# Разумные границы годовой нагрузки: 34 недели × от 0,5 до 6 часов в неделю.
MIN_YEAR_HOURS = 16
MAX_YEAR_HOURS = 250


def check_raw() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    files = sorted(RAW.glob("*.json")) if RAW.exists() else []
    if not files:
        # Промежуточные результаты разбора лежат в build/ и в репозиторий не
        # идут вместе с исходными PDF. В чистом клоне (и в CI) проверять
        # нечего — но корпус приложения проверить можно и нужно, поэтому это
        # замечание, а не ошибка.
        return [], ["build/frp пуст — разбор PDF не проверялся (см. npm run frp:parse)"]

    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        name = path.name

        if doc.get("error"):
            errors.append(f"{name}: {doc['error']}")
            continue

        # Сходимость часов считается тем же кодом, что и при разборе, поэтому
        # ошибкой считается только то, что разбор не смог объяснить дефектом
        # самого документа. JSON из старого прогона мог этого разделения не
        # содержать, поэтому выводы берутся не из файла, а вычисляются заново.
        parse_problems, source_problems = verify(doc)
        errors.extend(f"{name}: {p}" for p in parse_problems)
        warnings.extend(f"{name}: расхождение в самом PDF — {p}" for p in source_problems)

        if not doc.get("subject"):
            errors.append(f"{name}: не определено название предмета")
        if doc.get("level") not in ("НОО", "ООО", "СОО"):
            errors.append(f"{name}: не определён уровень образования")

        for course in doc.get("courses", []):
            tag = f"{name}" + (f" / {course['name']}" if course.get("name") else "")
            if not course["classes"]:
                errors.append(f"{tag}: нет классов")
            for c in course["classes"]:
                g = c["grade"]
                if not 1 <= g <= 11:
                    errors.append(f"{tag}: недопустимый класс {g}")
                if not c.get("modular"):
                    if not MIN_YEAR_HOURS <= c["computedTotal"] <= MAX_YEAR_HOURS:
                        warnings.append(
                            f"{tag}, {g} кл.: подозрительная годовая нагрузка "
                            f"{c['computedTotal']} ч"
                        )
                # Иероглифы — признак повреждения текста (в коде уже была
                # строка «к发声ителям» вместо «к носителям»), но в программе по
                # китайскому языку они на своём месте.
                cjk_expected = "КИТАЙСК" in doc.get("subject", "").upper()

                for s in c["sections"]:
                    for t in s["topics"]:
                        if not t["name"].strip():
                            errors.append(f"{tag}, {g} кл.: тема без названия")
                        if not cjk_expected and re.search(
                            r"[一-鿿]", t["name"] + t["content"] + t["activity"]
                        ):
                            errors.append(
                                f"{tag}, {g} кл.: иероглифы в тексте темы «{t['name'][:30]}»"
                            )

    return errors, warnings


def check_lessons() -> tuple[list[str], list[str]]:
    """
    Поурочные планы: нумерация подряд с единицы и совпадение числа уроков
    с годовой нормой часов из тематического планирования.
    """
    errors: list[str] = []
    warnings: list[str] = []
    if not LESSONS.exists() or not any(LESSONS.glob("*.json")):
        return [], ["build/frp-lessons пуст — поурочные планы из PDF не проверялись"]

    for path in sorted(LESSONS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        raw_file = RAW / path.name
        norms: dict[str, int] = {}
        if raw_file.exists():
            raw = json.loads(raw_file.read_text(encoding="utf-8"))
            for course in raw.get("courses", []):
                for c in course["classes"]:
                    # Годовая норма — сумма по всем курсам класса: в истории
                    # это всеобщая история плюс история нашего края, в
                    # математике — алгебра, геометрия и вероятность.
                    if c["declaredTotal"]:
                        norms[str(c["grade"])] = (
                            norms.get(str(c["grade"]), 0) + c["declaredTotal"]
                        )

        # Альтернативные варианты планирования существуют как раз ради другой
        # недельной нагрузки: у русского языка 6 класса вариант «для
        # Федерального недельного учебного плана» даёт 170 уроков при основной
        # норме 204. Поэтому расхождение считается замечанием, только если в
        # норму не укладывается НИ ОДИН вариант для этого класса.
        matched = {
            grade
            for v in doc.get("variants", [])
            for grade, rows in v["classes"].items()
            if norms.get(grade) == len(rows)
        }

        for v in doc.get("variants", []):
            tag = f"{path.name}" + (f" / {v['name'][:24]}" if v["name"] else "")
            for grade, rows in v["classes"].items():
                numbers = [r["number"] for r in rows]
                if numbers != list(range(1, len(numbers) + 1)):
                    errors.append(f"{tag}, {grade} кл.: нумерация уроков с разрывами")
                norm = norms.get(grade)
                if norm and len(rows) != norm and grade not in matched:
                    warnings.append(
                        f"{tag}, {grade} кл.: уроков {len(rows)} при норме {norm} ч"
                    )
    return errors, warnings


def check_app() -> list[str]:
    errors: list[str] = []
    catalog_ts = APP / "catalog.ts"
    if not catalog_ts.exists():
        return ["src/data/frp/catalog.ts не собран — запустите tools/build_frp_data.py"]

    text = catalog_ts.read_text(encoding="utf-8")
    m = re.search(r"FRP_CATALOG[^=]*=\s*\[(.*?)\n\];", text, re.S)
    if not m:
        return ["не удалось разобрать FRP_CATALOG в catalog.ts"]

    entries = []
    for line in m.group(1).strip().splitlines():
        line = line.strip().rstrip(",")
        if line:
            entries.append(json.loads(line))

    slugs = [e["slug"] for e in entries]
    dupes = {s for s in slugs if slugs.count(s) > 1}
    if dupes:
        errors.append(f"повторяющиеся slug в каталоге: {sorted(dupes)}")

    for e in entries:
        plan_file = APP / f"{e['slug']}.json"
        if not plan_file.exists():
            errors.append(f"{e['slug']}: нет файла плана")
            continue
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        grades_in_plan = sorted({c["grade"] for c in plan["classes"]})
        if grades_in_plan != sorted(e["grades"]):
            errors.append(
                f"{e['slug']}: классы каталога {e['grades']} ≠ классов плана {grades_in_plan}"
            )
        for c in plan["classes"]:
            # Каталог хранит НОРМУ часов (объявленную в ФРП), план — сумму
            # разобранных строк. Расходиться они могут по двум законным
            # причинам, поэтому здесь проверяется только согласованность
            # каталога с самим планом, а расхождение нормы и суммы уже
            # посчитано при проверке разбора и не дублируется.
            norm = e["hoursByGrade"].get(str(c["grade"]))
            expected = c["declaredHours"] or c["hours"]
            if norm != expected:
                errors.append(
                    f"{e['slug']}, {c['grade']} кл.: норма каталога {norm} ≠ нормы плана {expected}"
                )
            if c.get("modular") and norm is not None and c["hours"] < norm:
                errors.append(
                    f"{e['slug']}, {c['grade']} кл.: модулей на {c['hours']} ч при норме {norm} ч"
                )

    orphans = {p.stem for p in APP.glob("*.json")} - set(slugs)
    if orphans:
        errors.append(f"файлы планов без записи в каталоге: {sorted(orphans)}")

    return errors


def main() -> int:
    raw_errors, warnings = check_raw()
    lesson_errors, lesson_warnings = check_lessons()
    app_errors = check_app()
    errors = raw_errors + lesson_errors + app_errors
    warnings = warnings + lesson_warnings

    for w in warnings[:20]:
        print(f"[внимание] {w}")
    if len(warnings) > 20:
        print(f"[внимание] … ещё {len(warnings) - 20}")

    for e in errors[:30]:
        print(f"[ОШИБКА  ] {e}")
    if len(errors) > 30:
        print(f"[ОШИБКА  ] … ещё {len(errors) - 30}")

    n_raw = len(list(RAW.glob("*.json")))
    n_app = len(list(APP.glob("*.json")))
    n_les = len(list(LESSONS.glob("*.json"))) if LESSONS.exists() else 0
    print(f"\nразобранных ФРП: {n_raw}, предметов в приложении: {n_app}, "
          f"с поурочным планом из ФРП: {n_les}")
    print(f"ошибок: {len(errors)}, предупреждений: {len(warnings)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
