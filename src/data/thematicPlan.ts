import type { FrpClass, FrpPlan } from './frp/catalog';

/**
 * Модель тематического планирования.
 *
 * В отличие от прежнего плоского списка строк, план хранит разделы: именно так
 * устроена таблица в ФРП и в оригинальном конструкторе — с подытогами
 * «Итого по разделу» и финальным «ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ».
 */

export interface PlanTopic {
  id: string;
  /** Номер вида «1.2»; у добавленных вручную строк пустой. */
  num: string;
  name: string;
  hours: number;
  /** Программное содержание. */
  content: string;
  /** Основные виды деятельности обучающихся. */
  activity: string;
}

export interface PlanSection {
  id: string;
  name: string;
  topics: PlanTopic[];
}

let counter = 0;
/** Идентификаторы строк должны быть стабильны в пределах сессии и уникальны. */
export function newId(prefix = 'r'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function sectionHours(section: PlanSection): number {
  return section.topics.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);
}

export function planHours(sections: PlanSection[]): number {
  return sections.reduce((sum, s) => sum + sectionHours(s), 0);
}

export function planTopicCount(sections: PlanSection[]): number {
  return sections.reduce((sum, s) => sum + s.topics.length, 0);
}

/** Разделы и темы выбранного класса из ФРП — то, чем конструктор предзаполняет таблицу. */
export function buildPlanForGrade(plan: FrpPlan, grade: number): PlanSection[] {
  const cls = plan.classes.find((c) => c.grade === grade);
  if (!cls) return [];
  return cls.sections.map((s) => ({
    id: newId('s'),
    name: s.name,
    topics: s.topics.map((t) => ({
      id: newId('t'),
      num: t.num,
      name: t.name,
      hours: t.hours,
      content: t.content,
      activity: t.activity,
    })),
  }));
}

export function frpClassForGrade(plan: FrpPlan, grade: number): FrpClass | undefined {
  return plan.classes.find((c) => c.grade === grade);
}

/**
 * Предметные результаты для класса.
 *
 * Часть ФРП расписывает их по классам, часть — одним блоком на весь уровень
 * образования; во втором случае текст лежит под пустым ключом.
 */
export function frpSubjectResults(plan: FrpPlan, grade: number): string {
  return plan.subjectResults[String(grade)] ?? plan.subjectResults[''] ?? '';
}

export interface PlanIssue {
  level: 'error' | 'warning';
  message: string;
  /** Раздел, к которому относится замечание; пусто — замечание ко всему плану. */
  sectionId?: string;
}

/**
 * Проверки часов — то же, что делает оригинальный конструктор: он подсвечивает
 * ячейку красным, если сумма по строкам разошлась с контрольным значением.
 */
export function validatePlan(
  sections: PlanSection[],
  expectedHours: number | null,
  modular = false,
  /**
   * Второе допустимое значение: у предмета, которому приказ поменял норму,
   * законны и старое число, и новое — выбирает учитель (data/hoursCorrections.ts).
   */
  alsoAllowed: number | null = null,
): PlanIssue[] {
  const issues: PlanIssue[] = [];

  for (const s of sections) {
    if (!s.topics.length) {
      issues.push({ level: 'warning', message: `Раздел «${s.name}» не содержит тем`, sectionId: s.id });
      continue;
    }
    const zero = s.topics.filter((t) => !Number(t.hours));
    if (zero.length) {
      issues.push({
        level: 'warning',
        message: `В разделе «${s.name}» у ${zero.length} тем(ы) не указаны часы`,
        sectionId: s.id,
      });
    }
    // Единственный безымянный раздел — не ошибка: у ряда предметов
    // (математика, иностранные языки) ФРП не размечает разделы вовсе,
    // и таблица там плоская.
    if (!s.name.trim() && sections.length > 1) {
      issues.push({
        level: 'warning',
        message: 'У одного из разделов не заполнено наименование',
        sectionId: s.id,
      });
    }
  }

  const total = planHours(sections);
  if (expectedHours != null && total !== expectedHours && total !== alsoAllowed) {
    const diff = total - expectedHours;
    if (modular && diff > 0) {
      // У модульных предметов ФРП перечисляет все модули на выбор, поэтому
      // превышение нормы — это не ошибка, а приглашение отобрать модули.
      issues.push({
        level: 'warning',
        message:
          `Отобрано модулей на ${total} ч при годовой норме ${expectedHours} ч. ` +
          `Удалите лишние модули: программа модульная, школа выбирает из них ${expectedHours} ч.`,
      });
    } else {
      issues.push({
        level: 'error',
        message:
          // Не «по ФРП»: норма может быть изменена приказом уже после выхода
          // программы — см. data/hoursCorrections.ts.
          `Сумма часов по плану — ${total}, годовая норма — ${expectedHours} ` +
          `(${diff > 0 ? 'превышение' : 'недостаток'} ${Math.abs(diff)} ч)`,
      });
    }
  }

  return issues;
}

// --- операции редактирования ---------------------------------------------

export function updateTopic(
  sections: PlanSection[],
  sectionId: string,
  topicId: string,
  patch: Partial<PlanTopic>,
): PlanSection[] {
  return sections.map((s) =>
    s.id !== sectionId
      ? s
      : { ...s, topics: s.topics.map((t) => (t.id === topicId ? { ...t, ...patch } : t)) },
  );
}

export function updateSection(
  sections: PlanSection[],
  sectionId: string,
  patch: Partial<Omit<PlanSection, 'topics'>>,
): PlanSection[] {
  return sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s));
}

export function addTopic(sections: PlanSection[], sectionId: string): PlanSection[] {
  return sections.map((s) =>
    s.id !== sectionId
      ? s
      : {
          ...s,
          topics: [
            ...s.topics,
            { id: newId('t'), num: '', name: '', hours: 1, content: '', activity: '' },
          ],
        },
  );
}

export function duplicateTopic(
  sections: PlanSection[],
  sectionId: string,
  topicId: string,
): PlanSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const i = s.topics.findIndex((t) => t.id === topicId);
    if (i < 0) return s;
    const copy = { ...s.topics[i], id: newId('t') };
    const topics = [...s.topics];
    topics.splice(i + 1, 0, copy);
    return { ...s, topics };
  });
}

export function removeTopic(
  sections: PlanSection[],
  sectionId: string,
  topicId: string,
): PlanSection[] {
  return sections.map((s) =>
    s.id !== sectionId ? s : { ...s, topics: s.topics.filter((t) => t.id !== topicId) },
  );
}

/** Перемещение строки внутри раздела; за границами раздела — без изменений. */
export function moveTopic(
  sections: PlanSection[],
  sectionId: string,
  topicId: string,
  delta: -1 | 1,
): PlanSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    const i = s.topics.findIndex((t) => t.id === topicId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= s.topics.length) return s;
    const topics = [...s.topics];
    [topics[i], topics[j]] = [topics[j], topics[i]];
    return { ...s, topics };
  });
}

export function addSection(sections: PlanSection[]): PlanSection[] {
  return [...sections, { id: newId('s'), name: '', topics: [] }];
}

export function removeSection(sections: PlanSection[], sectionId: string): PlanSection[] {
  return sections.filter((s) => s.id !== sectionId);
}
