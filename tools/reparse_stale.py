#!/usr/bin/env python3
"""
Повторный разбор ФРП, которые заведомо разобраны неверно.

Отбор идёт ПО СОДЕРЖИМОМУ, а не по времени файла: длинный прогон держит в
памяти ту версию парсера, с которой стартовал, поэтому свежая отметка времени
у JSON ничего не гарантирует — файл мог быть записан старым кодом.

Под переразбор попадают:
  * файлы с ошибкой разбора (раздел не найден и т. п.);
  * планы, где остался неопределённый «класс 0»;
  * планы с ошибками разбора — расхождением часов, которое не объясняется
    дефектом самого PDF, или разделом, разорванным обрывком текста.

Отбор идёт только по обнаруженному дефекту. Заодно переразбирать предметы
«на всякий случай» дороже, чем кажется: один PDF разбирается минутами, и
скопом это часы.

Выводы считаются заново, а не читаются из поля `problems`: его тоже записал
старый код. Расхождения, отнесённые к дефектам официальных PDF, переразбор не
вызывают — их не исправить.

Запуск: .venv/bin/python tools/reparse_stale.py [--dry-run]
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from frp_verify import verify

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "frp"
PDFDIR = ROOT / "edsoo" / "wp-content" / "uploads" / "2025" / "07"
PARSER = ROOT / "tools" / "frp_parser.py"
PYTHON = ROOT / ".venv" / "bin" / "python"


def needs_reparse(path: Path) -> str | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — битый JSON тоже переразбираем
        return "нечитаемый JSON"

    if doc.get("error"):
        return doc["error"]

    parse_problems, _ = verify(doc)
    if parse_problems:
        extra = f" (и ещё {len(parse_problems) - 1})" if len(parse_problems) > 1 else ""
        return parse_problems[0] + extra

    for course in doc.get("courses", []):
        for c in course.get("classes", []):
            if c.get("grade", 0) == 0:
                return "неопределённый класс"

    return None


def main() -> int:
    dry = "--dry-run" in sys.argv
    if not OUT.exists():
        print(f"нет каталога {OUT}")
        return 1

    targets: list[Path] = []
    for path in sorted(OUT.glob("*.json")):
        reason = needs_reparse(path)
        if reason:
            pdf = PDFDIR / f"{path.stem}.pdf"
            if pdf.exists():
                print(f"  {path.stem}: {reason}")
                targets.append(pdf)

    if not targets:
        print("переразбирать нечего")
        return 0

    print(f"\nпереразбор {len(targets)} файлов")
    if dry:
        return 0

    for pdf in targets:
        (OUT / f"{pdf.stem}.json").unlink(missing_ok=True)

    return subprocess.call(
        ["nice", "-n", "10", str(PYTHON), "-u", str(PARSER), *map(str, targets), "-o", str(OUT)]
    )


if __name__ == "__main__":
    sys.exit(main())
