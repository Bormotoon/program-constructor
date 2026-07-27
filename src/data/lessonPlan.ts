import type { FrpPlan } from './frp/catalog';
import type { LessonRow } from './program';
import { newId, planHours, type PlanSection } from './thematicPlan';

/**
 * Готовое поурочное планирование из ФРП.
 *
 * Оно есть у 14 программ из 65 — там формулировки уроков берутся дословно из
 * федеральной программы, как в оригинальном конструкторе. Для остальных
 * предметов план разворачивается из тематического (generateLessonPlan ниже).
 */
export function lessonsFromFrp(plan: FrpPlan, grade: number, variant = 0): LessonRow[] {
  const variants = frpLessonVariants(plan, grade);
  const chosen = variants[variant] ?? variants[0];
  if (!chosen) return [];
  return chosen.lessons.map((l) => ({
    id: newId('l'),
    number: l.number,
    topic: l.topic,
    // В поурочной таблице ФРП строка — это один урок; отдельной колонки часов
    // там нет, выделены только часы на практические работы.
    hours: 1,
    control: 0,
    practice: l.practice,
    date: '',
  }));
}

/** Варианты поурочного планирования для класса; пусто — их в ФРП нет. */
export function frpLessonVariants(plan: FrpPlan | null, grade: number) {
  if (!plan) return [];
  return plan.classes.find((c) => c.grade === grade)?.lessonVariants ?? [];
}

/**
 * Разбивает программное содержание темы на отдельные пункты.
 *
 * В ФРП это связный текст, где подтемы перечислены через точку:
 * «Понятие рационального числа. Арифметические действия с рациональными
 * числами. Решение текстовых задач». Такие пункты — естественные названия
 * уроков, и они гораздо полезнее, чем два десятка строк «Урок 7 из 25».
 */
function splitContent(content: string): string[] {
  return content
    .split(/(?<=[.;])\s+/)
    .map((part) => part.replace(/[.;]\s*$/, '').trim())
    // Обрывки в пару слов («и др», «в том числе») названием урока быть не могут.
    .filter((part) => part.length >= 12 && /\s/.test(part));
}

/**
 * Разворачивание поурочного плана из тематического — запасной путь для
 * программ, где готового поурочного планирования в ФРП нет: тема на N часов
 * даёт N уроков, названия берутся из её программного содержания.
 */
export function generateLessonPlan(sections: PlanSection[]): LessonRow[] {
  const rows: LessonRow[] = [];
  let n = 0;

  for (const section of sections) {
    for (const topic of section.topics) {
      const hours = Math.max(0, Math.floor(Number(topic.hours) || 0));
      if (hours === 0) continue;

      const items = splitContent(topic.content);

      for (let i = 0; i < hours; i += 1) {
        n += 1;
        let title: string;
        if (hours === 1) {
          title = topic.name;
        } else if (items.length) {
          // Пункты содержания распределяются по урокам пропорционально: при
          // 25 часах и 8 пунктах каждый пункт занимает примерно три урока.
          const item = items[Math.min(Math.floor((i * items.length) / hours), items.length - 1)];
          title = item;
        } else {
          // Содержания нет (тема добавлена вручную) — остаётся нумерация,
          // иначе строки неотличимы друг от друга.
          title = `${topic.name}. Урок ${i + 1} из ${hours}`;
        }
        rows.push({
          id: newId('l'),
          number: n,
          topic: title,
          hours: 1,
          control: 0,
          practice: 0,
          date: '',
        });
      }
    }
  }
  return rows;
}

export function renumberLessons(rows: LessonRow[]): LessonRow[] {
  return rows.map((r, i) => ({ ...r, number: i + 1 }));
}

export function lessonTotals(rows: LessonRow[]) {
  return {
    hours: rows.reduce((a, r) => a + (Number(r.hours) || 0), 0),
    control: rows.reduce((a, r) => a + (Number(r.control) || 0), 0),
    practice: rows.reduce((a, r) => a + (Number(r.practice) || 0), 0),
  };
}

export interface LessonIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Проверки те же, что подсвечивает оригинальный конструктор: сумма уроков
 * должна совпадать с тематическим планом, а часы на контрольные и
 * практические работы не могут превышать общее число часов по теме.
 */
export function validateLessonPlan(
  rows: LessonRow[],
  sections: PlanSection[],
): LessonIssue[] {
  const issues: LessonIssue[] = [];
  const totals = lessonTotals(rows);
  const planned = planHours(sections);

  if (sections.length && totals.hours !== planned) {
    const diff = totals.hours - planned;
    issues.push({
      level: 'error',
      message:
        `Часов в поурочном плане — ${totals.hours}, в тематическом — ${planned} ` +
        `(${diff > 0 ? 'превышение' : 'недостаток'} ${Math.abs(diff)} ч)`,
    });
  }

  const over = rows.filter(
    (r) => (Number(r.control) || 0) + (Number(r.practice) || 0) > (Number(r.hours) || 0),
  );
  if (over.length) {
    issues.push({
      level: 'error',
      message:
        `В ${over.length} строк(ах) сумма часов на контрольные и практические работы ` +
        'превышает количество часов урока',
    });
  }

  const empty = rows.filter((r) => !r.topic.trim()).length;
  if (empty) {
    issues.push({ level: 'warning', message: `Не заполнены темы у ${empty} урок(ов)` });
  }

  return issues;
}

export function updateLesson(
  rows: LessonRow[],
  id: string,
  patch: Partial<LessonRow>,
): LessonRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function moveLesson(rows: LessonRow[], id: string, delta: -1 | 1): LessonRow[] {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return renumberLessons(next);
}

export function addLesson(rows: LessonRow[], afterId?: string): LessonRow[] {
  const row: LessonRow = {
    id: newId('l'),
    number: 0,
    topic: '',
    hours: 1,
    control: 0,
    practice: 0,
    date: '',
  };
  if (!afterId) return renumberLessons([...rows, row]);
  const i = rows.findIndex((r) => r.id === afterId);
  const next = [...rows];
  next.splice(i + 1, 0, row);
  return renumberLessons(next);
}

export function duplicateLesson(rows: LessonRow[], id: string): LessonRow[] {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return rows;
  const next = [...rows];
  next.splice(i + 1, 0, { ...rows[i], id: newId('l') });
  return renumberLessons(next);
}

export function removeLesson(rows: LessonRow[], id: string): LessonRow[] {
  return renumberLessons(rows.filter((r) => r.id !== id));
}
