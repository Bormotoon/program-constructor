#!/usr/bin/env python3
"""
Метаданные программ внеурочной деятельности для парсера ФРП.

У программ ВУД титульный лист устроен иначе, чем у предметных, и
parse_title_page() не находит на нём ни названия курса, ни диапазона классов.
Вторую эвристику разбора титула писать незачем: эти данные уже собраны при
зеркалировании ЕДСОО и лежат в каталоге зеркала.

Запуск:
    .venv/bin/python tools/vud_meta.py \\
        ~/VibeCoding/PedObraz/scripts/frp_mirror/catalog.json \\
        -o build/vud_meta.json --list build/vud_files.txt
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LEVELS = {"noo": "НОО", "ooo": "ООО", "soo": "СОО"}

# «1–4», «5-9», «10–11», иногда одиночный «4». Тире бывает и коротким, и длинным.
RE_RANGE = re.compile(r"(\d{1,2})\s*[–—-]\s*(\d{1,2})")
RE_ONE = re.compile(r"^\s*(\d{1,2})\s*$")


def grades_of(raw: str) -> list[int]:
    m = RE_RANGE.search(raw or "")
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return list(range(a, b + 1)) if a <= b <= 11 else []
    m = RE_ONE.match(raw or "")
    return [int(m.group(1))] if m else []


def main() -> int:
    ap = argparse.ArgumentParser(description="каталог зеркала ФРП -> мета для парсера")
    ap.add_argument("catalog", type=Path, help="scripts/frp_mirror/catalog.json портала")
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--list", type=Path, help="куда выписать список путей к PDF")
    ap.add_argument("--pdfdir", type=Path, help="каталог с PDF (для --list)")
    args = ap.parse_args()

    items = json.loads(args.catalog.read_text(encoding="utf-8"))
    meta: dict[str, dict] = {}
    skipped: list[str] = []

    for item in items:
        if str(item.get("kind", "")).lower() != "vud":
            continue
        grades = grades_of(str(item.get("grades", "")))
        levels = [LEVELS[l] for l in item.get("levels", []) if l in LEVELS]
        if not grades or not levels:
            skipped.append(f'{item["file"]}: классы={item.get("grades")!r} уровни={item.get("levels")!r}')
            continue
        meta[item["file"]] = {
            "subject": item["title"],
            # Уровень один, даже если программа охватывает два: тип корпуса
            # держит одно значение. Реальный охват несёт `grades`, и подбор
            # внеурочного курса в интерфейсе идёт по КЛАССУ, а не по уровню —
            # иначе «Музыкальный театр» на 1–9 нашёлся бы только в НОО.
            "level": levels[0],
            "grades": grades,
            "variant": item.get("variant") or "",
            "kind": "vud",
        }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"мета собрана: {len(meta)} программ -> {args.out}")

    if args.list:
        base = args.pdfdir or args.catalog.parent
        args.list.write_text("\n".join(str(base / f) for f in meta) + "\n", encoding="utf-8")
        print(f"список файлов: {args.list}")

    if skipped:
        print(f"\nНЕ разобрано ({len(skipped)}):")
        for s in skipped:
            print("  " + s)
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
