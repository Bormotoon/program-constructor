#!/usr/bin/env python3
"""
Проверка контрастности палитры по WCAG.

Токены заданы в oklch, и на глаз соотношение контраста по ним не оценить —
особенно в тёмной теме, где насыщенные цвета кажутся ярче, чем измеряются.
Скрипт читает значения прямо из src/index.css, чтобы проверка не разъезжалась
с реальной палитрой.

Запуск: python3 tools/check_contrast.py
Код возврата 1, если хоть одна пара не дотягивает до нормы.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "src" / "index.css"

# Норма WCAG AA: 4.5:1 для основного текста, 3:1 для крупного текста,
# значков и границ элементов интерфейса.
REQUIRED = {
    "ink": 4.5,
    "ink-muted": 4.5,
    "ink-subtle": 3.0,
    "brand": 3.0,
    "ok": 3.0,
    "warn": 3.0,
    "danger": 3.0,
}


def oklch_to_srgb(L: float, C: float, H: float) -> tuple[float, float, float]:
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(x: float) -> float:
        x = max(0.0, min(1.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055

    return gamma(r), gamma(g), gamma(bl)


def luminance(rgb: tuple[float, float, float]) -> float:
    def lin(u: float) -> float:
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(c1, c2) -> float:
    a, b = luminance(c1), luminance(c2)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


RE_TOKEN = re.compile(r"--color-([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)")


def read_palettes() -> dict[str, dict[str, tuple[float, float, float]]]:
    """Светлые токены объявлены в @theme, тёмные — в html.dark."""
    text = CSS.read_text(encoding="utf-8")
    dark_start = text.index("html.dark")
    light = {m[1]: (float(m[2]), float(m[3]), float(m[4])) for m in RE_TOKEN.finditer(text[:dark_start])}
    dark = dict(light)
    dark.update({m[1]: (float(m[2]), float(m[3]), float(m[4])) for m in RE_TOKEN.finditer(text[dark_start:])})
    return {"светлая": light, "тёмная": dark}


def main() -> int:
    palettes = read_palettes()
    failures = 0

    for name, tokens in palettes.items():
        missing = [k for k in ("surface", *REQUIRED) if k not in tokens]
        if missing:
            print(f"[ОШИБКА] {name}: не найдены токены {missing}")
            failures += 1
            continue

        bg = oklch_to_srgb(*tokens["surface"])
        print(f"=== {name} тема (на фоне поверхности)")
        for token, need in REQUIRED.items():
            ratio = contrast(oklch_to_srgb(*tokens[token]), bg)
            ok = ratio >= need
            if not ok:
                failures += 1
            print(f"  {token:<11} {ratio:5.2f}:1  норма {need}  {'OK' if ok else 'НИЗКО'}")

    print(f"\nнедостаточный контраст: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
