#!/usr/bin/env python3
"""
Превращает результат работы tools/frp_parser.py в данные, которые потребляет
приложение.

На выходе:
  src/data/frp/<slug>.json  — тематическое планирование одного предмета
  src/data/frp/catalog.ts   — лёгкий каталог + карта ленивых импортов

Планы лежат отдельными файлами и подгружаются через dynamic import: полный
корпус ФРП весит миллионы знаков, и тянуть его в стартовый бандл нельзя —
пользователь за раз работает ровно с одним предметом.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "frp"
CONTENT = ROOT / "build" / "frp-content"
LESSONS = ROOT / "build" / "frp-lessons"
DST = ROOT / "src" / "data" / "frp"

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(*parts: str) -> str:
    text = " ".join(p for p in parts if p).lower()
    text = unicodedata.normalize("NFC", text)
    out = []
    for ch in text:
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug


def title_case_subject(name: str) -> str:
    """«ФИЗИКА» -> «Физика», «ТРУД (ТЕХНОЛОГИЯ)» -> «Труд (технология)»."""
    if not name:
        return name
    words = name.split()
    out = []
    for i, w in enumerate(words):
        lead = ""
        while w and not w[0].isalnum():
            lead += w[0]
            w = w[1:]
        if not w:
            out.append(lead)
            continue
        w = w[0].upper() + w[1:].lower() if i == 0 else w.lower()
        out.append(lead + w)
    return " ".join(out)


RE_ISSUE_GRADE = re.compile(r"^(\d+)\s+кл\.")


def course_issues(problems: list[str], course_name: str) -> list[dict]:
    """
    Отбирает расхождения источника, относящиеся к одному курсу, и достаёт класс.

    Одна ФРП может давать несколько записей каталога: «Математика. 5–9 классы»
    содержит алгебру, геометрию и вероятность со статистикой. Сообщения проверки
    в таких сборниках помечены именем курса, и без разбора префикса замечание
    про геометрию показывалось бы и в алгебре. Класс вынесен отдельным полем,
    чтобы учителю 7 класса не показывать дефект в плане 4 класса.
    """
    marker = f"{course_name}: " if course_name else ""
    issues: list[dict] = []
    for text in problems:
        if marker:
            if not text.startswith(marker):
                continue
            text = text[len(marker) :]
        m = RE_ISSUE_GRADE.match(text)
        issues.append({"grade": int(m.group(1)) if m else 0, "text": text})
    return issues


def main() -> int:
    if not SRC.exists():
        print(f"нет каталога {SRC}; сначала запустите tools/frp_parser.py", file=sys.stderr)
        return 1

    DST.mkdir(parents=True, exist_ok=True)
    for old in DST.glob("*.json"):
        old.unlink()

    catalog: list[dict] = []
    skipped: list[str] = []
    missing_content = 0

    for path in sorted(SRC.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))

        # Текстовые разделы — содержание обучения, пояснительная записка и
        # планируемые результаты — извлекаются отдельным проходом
        # (tools/frp_content.py) и подмешиваются сюда по имени исходного PDF.
        content_file = CONTENT / path.name
        content_by_course: dict[str, dict[str, str]] = {}
        notes_by_course: dict[str, str] = {}
        results: dict = {}
        if content_file.exists():
            text_doc = json.loads(content_file.read_text(encoding="utf-8"))
            content_by_course = text_doc.get("courses", {})
            notes_by_course = text_doc.get("notes", {})
            results = text_doc.get("results", {})
        else:
            missing_content += 1

        # Поурочное планирование есть лишь у части программ; там, где оно есть,
        # уроки берутся из ФРП дословно, а не разворачиваются из тематического.
        lessons_file = LESSONS / path.name
        lesson_variants: list[dict] = []
        if lessons_file.exists():
            lesson_variants = json.loads(lessons_file.read_text(encoding="utf-8")).get(
                "variants", []
            )
        if doc.get("error") or not doc.get("courses"):
            skipped.append(f"{path.name}: {doc.get('error', 'нет курсов')}")
            continue

        base_subject = title_case_subject(doc.get("subject", "")) or path.stem
        level = doc.get("level") or ""
        variant = doc.get("variant") or ""
        if not level:
            skipped.append(f"{path.name}: не определён уровень образования")
            continue

        for course in doc["courses"]:
            # Сборники курсов (математика 5–9 = алгебра + геометрия +
            # вероятность) дают отдельную запись каталога на каждый курс:
            # школа пишет по ним отдельные рабочие программы.
            subject = title_case_subject(course["name"]) if course.get("name") else base_subject
            slug = slugify(subject, level, variant)

            # Текстовые разделы ищутся по названию курса; у обычных программ
            # курс один и лежит под пустым ключом. В сборниках у каждого курса
            # своя пояснительная записка и свои предметные результаты, а
            # личностные и метапредметные — общие на весь предмет.
            course_key = course.get("name") or ""
            content_by_grade = content_by_course.get(course_key, {})
            if not content_by_grade and len(content_by_course) == 1:
                content_by_grade = next(iter(content_by_course.values()))

            def for_course(by_course: dict, default=""):
                """Значение курса, а при его отсутствии — общее для программы."""
                if course_key in by_course:
                    return by_course[course_key]
                return by_course.get("", default)

            note = for_course(notes_by_course)
            subject_results = for_course(results.get("subject", {}), {})

            classes = []
            for c in course["classes"]:
                sections = []
                for s in c["sections"]:
                    topics = [
                        {
                            "num": t["num"],
                            "name": t["name"],
                            "hours": t["hours"],
                            "content": t["content"],
                            "activity": t["activity"],
                        }
                        for t in s["topics"]
                    ]
                    if topics:
                        sections.append(
                            {"name": s["name"], "hours": s["computedTotal"], "topics": topics}
                        )
                if sections:
                    # Если разметки по классам в содержании нет, текст один
                    # на всю программу и подставляется каждому классу.
                    text = content_by_grade.get(str(c["grade"])) or content_by_grade.get("", "")
                    classes.append(
                        {
                            "grade": c["grade"],
                            "content": text,
                            # Вариантов планирования бывает несколько
                            # (окружающий мир: под учебник и для
                            # самостоятельного конструирования), выбор — за
                            # учителем, поэтому сохраняются все.
                            "lessonVariants": [
                                {
                                    "name": v["name"],
                                    "lessons": v["classes"].get(str(c["grade"]), []),
                                }
                                for v in lesson_variants
                                if v["classes"].get(str(c["grade"]))
                            ],
                            "hours": c["computedTotal"],
                            "declaredHours": c["declaredTotal"],
                            # Модульная программа: перечислены все модули на
                            # выбор, поэтому сумма часов больше годовой нормы.
                            "modular": bool(c.get("modular")),
                            "notes": c.get("notes", []),
                            "sections": sections,
                        }
                    )

            if not classes:
                skipped.append(f"{path.name} / {subject}: пустой план")
                continue

            # Некоторые PDF содержат раздел «Тематическое планирование» дважды
            # (у физкультуры он повторён на стр. 33 и 274 с теми же классами и
            # часами). Без проверки второй блок молча затирал первый файл,
            # а в каталоге появлялась пара одинаковых записей.
            existing = next((e for e in catalog if e["slug"] == slug), None)
            if existing is not None:
                new_topics = sum(len(s["topics"]) for c in classes for s in c["sections"])
                if new_topics <= existing["topicCount"]:
                    skipped.append(f"{path.name} / {subject}: повтор блока, оставлен первый")
                    continue
                catalog.remove(existing)

            plan = {
                "subject": subject,
                "level": level,
                "variant": variant,
                "source": doc["source"],
                # Пояснительная записка и результаты, не зависящие от класса,
                # берутся из ФРП дословно — это те же тексты, которыми
                # оригинальный конструктор предзаполняет соответствующие
                # разделы. В сборниках курсов они общие на весь документ.
                "note": note,
                "personalResults": for_course(results.get("personal", {})),
                "metaResults": for_course(results.get("meta", {})),
                # Предметные результаты у одних ФРП расписаны по классам, у
                # других идут одним блоком на весь уровень образования — тогда
                # ключ пустой. Хранятся здесь, а не в классе: у истории это
                # 28 тысяч знаков, и в каждом из пяти классов лежал бы один и
                # тот же текст.
                "subjectResults": subject_results,
                "classes": classes,
            }
            (DST / f"{slug}.json").write_text(
                json.dumps(plan, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
            )

            catalog.append(
                {
                    "slug": slug,
                    "subject": subject,
                    "level": level,
                    "variant": variant,
                    "grades": sorted({c["grade"] for c in classes}),
                    # Норма часов берётся из объявленной в самой ФРП строки
                    # «ОБЩЕЕ КОЛИЧЕСТВО»: она авторитетна и не зависит от того,
                    # всё ли удалось вычитать из таблицы. Сумма разобранных
                    # строк остаётся в плане и сверяется с этой нормой — так
                    # расхождение видно учителю, а ориентир остаётся верным.
                    "hoursByGrade": {
                        str(c["grade"]): (c["declaredHours"] or c["hours"]) for c in classes
                    },
                    "modular": any(c["modular"] for c in classes),
                    # Признак для интерфейса: можно взять готовый поурочный
                    # план из ФРП, а не разворачивать его из тематического.
                    "hasLessons": any(c["lessonVariants"] for c in classes),
                    # Сумма годовых норм, а не всех строк таблицы: у модульных
                    # предметов перечислены все модули на выбор.
                    "totalHours": sum((c["declaredHours"] or c["hours"]) for c in classes),
                    "source": doc["source"],
                    "verified": not doc.get("problems"),
                    # Расхождения самой ФРП: перечень тем не сходится с
                    # объявленным в ней же итогом. Приложение показывает их
                    # дословно — учителю полезнее знать, чего именно не
                    # хватает, чем общее «проверьте план».
                    "sourceIssues": course_issues(
                        doc.get("sourceProblems", []), course.get("name") or ""
                    ),
                    "topicCount": sum(len(s["topics"]) for c in classes for s in c["sections"]),
                }
            )

    catalog.sort(key=lambda e: (e["level"], e["subject"], e["variant"]))

    entries = ",\n".join(
        "  " + json.dumps(e, ensure_ascii=False) for e in catalog
    )
    loaders = "\n".join(
        f"  {json.dumps(e['slug'])}: () => import('./{e['slug']}.json')," for e in catalog
    )

    ts = f"""// СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать вручную.
// Источник: официальные ФРП 2025 г. (edsoo.ru), разбор — tools/frp_parser.py,
// сборка — tools/build_frp_data.py.

export type FrpLevel = 'НОО' | 'ООО' | 'СОО';

export interface FrpTopic {{
  num: string;
  name: string;
  hours: number;
  content: string;
  activity: string;
}}

export interface FrpSection {{
  name: string;
  hours: number;
  topics: FrpTopic[];
}}

export interface FrpLesson {{
  number: number;
  topic: string;
  /** Часы на практические работы, если ФРП их выделяет. */
  practice: number;
}}

export interface FrpLessonVariant {{
  /** Название варианта планирования; пусто, если он единственный. */
  name: string;
  lessons: FrpLesson[];
}}

export interface FrpClass {{
  grade: number;
  /** Раздел «Содержание обучения» этого класса, как он изложен в ФРП. */
  content: string;
  /**
   * Поурочное планирование из самой ФРП, по вариантам. Пусто, если программа
   * его не содержит — тогда план разворачивается из тематического.
   */
  lessonVariants: FrpLessonVariant[];
  /** Сумма часов по всем разделам таблицы. */
  hours: number;
  /** Часы, объявленные в самой ФРП строкой «ОБЩЕЕ КОЛИЧЕСТВО». */
  declaredHours: number | null;
  /**
   * Модульная программа: ФРП перечисляет все модули на выбор, поэтому hours
   * законно больше declaredHours — школа набирает из модулей нужный объём.
   */
  modular: boolean;
  notes: string[];
  sections: FrpSection[];
}}

export interface FrpPlan {{
  subject: string;
  level: FrpLevel;
  variant: string;
  source: string;
  /** Пояснительная записка ФРП дословно. */
  note: string;
  /** Личностные результаты — общие для всей программы. */
  personalResults: string;
  /** Метапредметные результаты — общие для всей программы. */
  metaResults: string;
  /**
   * Предметные результаты по классам. Ключ — номер класса; пустой ключ значит,
   * что ФРП излагает их одним блоком на весь уровень образования.
   */
  subjectResults: Record<string, string>;
  classes: FrpClass[];
}}

export interface FrpSourceIssue {{
  /** Класс, к плану которого относится расхождение; 0 — ко всей программе. */
  grade: number;
  text: string;
}}

export interface FrpCatalogEntry {{
  slug: string;
  subject: string;
  level: FrpLevel;
  variant: string;
  grades: number[];
  /** Годовая норма часов по классам (для модульных предметов — норма, а не сумма модулей). */
  hoursByGrade: Record<string, number>;
  totalHours: number;
  /** Предмет модульный (музыка, физкультура, ОРКСЭ, труд): модули выбираются. */
  modular: boolean;
  /** В ФРП есть готовое поурочное планирование. */
  hasLessons: boolean;
  /** Источник — имя файла ФРП на edsoo.ru. */
  source: string;
  /** true, если сумма разобранных часов сошлась с объявленной в ФРП. */
  verified: boolean;
  /**
   * Расхождения в самой ФРП: перечень тем не сходится с объявленным в ней
   * итогом. Это дефекты исходного документа, а не разбора.
   */
  sourceIssues: FrpSourceIssue[];
  /** Число тем во всех классах — используется при отборе дубликатов. */
  topicCount: number;
}}

export const FRP_CATALOG: FrpCatalogEntry[] = [
{entries}
];

// Тип импортируемого JSON вывести точно нельзя: TypeScript расширяет строковые
// литералы до string, и level не сходится с FrpLevel. Данные готовит
// tools/build_frp_data.py по той же схеме, поэтому приведение здесь безопасно.
const LOADERS: Record<string, () => Promise<{{ default: unknown }}>> = {{
{loaders}
}};

/** Тематическое планирование грузится по требованию — корпус слишком велик для стартового бандла. */
export async function loadFrpPlan(slug: string): Promise<FrpPlan | null> {{
  const loader = LOADERS[slug];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as FrpPlan;
}}

export function findCatalogEntry(
  subject: string,
  level: FrpLevel,
  variant?: string,
): FrpCatalogEntry | undefined {{
  const matches = FRP_CATALOG.filter((e) => e.subject === subject && e.level === level);
  if (variant) {{
    const exact = matches.find((e) => e.variant === variant);
    if (exact) return exact;
  }}
  return matches[0];
}}

export function subjectsForLevel(level: FrpLevel): FrpCatalogEntry[] {{
  return FRP_CATALOG.filter((e) => e.level === level);
}}
"""
    (DST / "catalog.ts").write_text(ts, encoding="utf-8")

    total_kb = sum(p.stat().st_size for p in DST.glob("*.json")) / 1024
    print(f"предметов в каталоге: {len(catalog)}")
    print(f"файлов планов: {len(list(DST.glob('*.json')))}, суммарно {total_kb:.0f} КБ")
    if missing_content:
        print(f"без раздела «Содержание обучения»: {missing_content} (запустите tools/frp_content.py)")
    if skipped:
        print(f"пропущено: {len(skipped)}")
        for s in skipped[:10]:
            print("   -", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
