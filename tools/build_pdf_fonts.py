#!/usr/bin/env python3
"""
Подготовка шрифта для выгрузки PDF.

PDF собирается в браузере, поэтому шрифт приходится встраивать в само
приложение. Берётся Liberation Serif: он метрически совместим с Times New
Roman, которым набраны рабочие программы, и распространяется под SIL OFL 1.1 —
встраивать разрешено.

Целиком шрифт весит 394 КБ, а в base64 — больше полумегабайта на начертание.
Поэтому оставляются только нужные символы: кириллица, латиница, цифры и
типографика. Получается около 30 КБ на начертание.

Запуск: .venv/bin/python tools/build_pdf_fonts.py
"""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
DST = ROOT / "src" / "assets" / "fonts"
SRC_DIR = Path("/usr/share/fonts/truetype/liberation")

# Кириллица с Ё, латиница, цифры, знаки препинания и типографика, которая
# реально встречается в программах: кавычки-ёлочки, тире, многоточие, №.
UNICODES = (
    "U+0020-007E,U+00A0,U+00AB,U+00BB,U+0401,U+0410-044F,U+0451,"
    "U+2010-2015,U+2018-201F,U+2026,U+2116,U+00B0,U+2212"
)

FACES = [
    ("regular", "LiberationSerif-Regular.ttf"),
    ("bold", "LiberationSerif-Bold.ttf"),
    ("italic", "LiberationSerif-Italic.ttf"),
]


def main() -> int:
    missing = [n for _, n in FACES if not (SRC_DIR / n).exists()]
    if missing:
        print(f"нет исходных файлов шрифта: {missing}", file=sys.stderr)
        print(f"ожидались в {SRC_DIR} (пакет fonts-liberation2)", file=sys.stderr)
        return 1

    DST.mkdir(parents=True, exist_ok=True)
    lines = [
        "// СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать вручную.",
        "// Liberation Serif, подмножество символов; сборка — tools/build_pdf_fonts.py.",
        "// Шрифт распространяется под SIL Open Font License 1.1,",
        "// (c) 2012 Red Hat, Inc. Текст лицензии — src/assets/fonts/LICENSE.",
        "",
    ]
    total = 0
    for key, name in FACES:
        options = subset.Options()
        options.layout_features = ["kern", "liga"]
        options.drop_tables += ["DSIG"]
        options.notdef_outline = True
        font = subset.load_font(str(SRC_DIR / name), options)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)

        buf = io.BytesIO()
        subset.save_font(font, buf, options)
        font.close()
        data = buf.getvalue()
        b64 = base64.b64encode(data).decode("ascii")
        total += len(b64)
        print(f"{name}: {len(data) / 1024:.0f} КБ -> base64 {len(b64) / 1024:.0f} КБ")
        lines.append(f"export const {key} = '{b64}';")

    (DST / "liberationSerif.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")
    licence = Path("/usr/share/doc/fonts-liberation2/copyright")
    if licence.exists():
        (DST / "LICENSE").write_text(licence.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"итого base64: {total / 1024:.0f} КБ -> {DST / 'liberationSerif.ts'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
