import type { PlanSection } from './thematicPlan';
import type { FrpLevel } from './frp/catalog';

/**
 * Модель рабочей программы.
 *
 * Состав полей повторяет оригинальный конструктор (workprogram.edsoo.ru):
 * титульный лист там требует наименование регионального органа управления
 * образованием, учредителя, населённый пункт и год, а блок согласования
 * переключается между четырьмя сочетаниями грифов.
 */

export type EducationLevel = FrpLevel;

/** Грифы блока согласования на титульном листе. */
export type ApprovalKind = 'reviewed' | 'agreed' | 'approved';

export const APPROVAL_LABELS: Record<ApprovalKind, string> = {
  reviewed: 'Рассмотрено',
  agreed: 'Согласовано',
  approved: 'Утверждено',
};

/** Сочетания грифов, доступные в оригинальном конструкторе. */
export const APPROVAL_PRESETS: ApprovalKind[][] = [
  ['reviewed', 'agreed', 'approved'],
  ['reviewed', 'approved'],
  ['agreed', 'approved'],
  ['approved'],
];

export interface LessonRow {
  id: string;
  /** Номер урока по порядку. */
  number: number;
  topic: string;
  hours: number;
  /** Часы на контрольные работы. */
  control: number;
  /** Часы на практические работы. */
  practice: number;
  date: string;
}

export interface ProgramData {
  // --- титульный лист ---
  regionalAuthority: string;
  founder: string;
  schoolName: string;
  locality: string;
  year: string;
  approvals: ApprovalKind[];
  reviewedBy: string;
  agreedBy: string;
  approvedBy: string;

  // --- предмет ---
  /** Ключ записи каталога ФРП; пусто, если программа заполняется вручную. */
  frpSlug: string;
  subject: string;
  educationLevel: EducationLevel;
  variant: string;
  grade: string;
  teacherName: string;
  academicYear: string;

  // --- текстовые разделы ---
  /** Пояснительная записка целиком, включая цели и задачи изучения предмета. */
  normativeBase: string;
  subjectContent: string;
  personalResults: string;
  metaResults: string;
  subjectResults: string;
  methodologicalSupport: string;

  // --- таблицы ---
  thematicPlan: PlanSection[];
  lessonPlan: LessonRow[];
}

const currentYear = new Date().getFullYear();

export const defaultProgram: ProgramData = {
  regionalAuthority: '',
  founder: '',
  schoolName: '',
  locality: '',
  year: String(currentYear),
  approvals: ['reviewed', 'agreed', 'approved'],
  reviewedBy: '',
  agreedBy: '',
  approvedBy: '',

  frpSlug: '',
  subject: '',
  educationLevel: 'ООО',
  variant: '',
  grade: '',
  teacherName: '',
  academicYear: `${currentYear}-${currentYear + 1}`,

  normativeBase: '',
  subjectContent: '',
  personalResults: '',
  metaResults: '',
  subjectResults: '',
  methodologicalSupport: '',

  thematicPlan: [],
  lessonPlan: [],
};

export const STORAGE_KEY = 'fgos-program-data-v3';

/**
 * Восстановление из localStorage.
 *
 * Хранилище версионировано: v2 держал тематическое планирование плоским
 * списком строк без разделов, и молча подставить его в новую модель нельзя —
 * таблица бы отрисовалась пустой. Такие данные переносятся в один безымянный
 * раздел, чтобы работа пользователя не пропала.
 */
/**
 * Приведение разобранного JSON к модели программы.
 *
 * Недостающие поля добираются из значений по умолчанию: данные могли быть
 * записаны более ранней версией, где части полей ещё не существовало, а
 * списки — оказаться не списками, если файл правили руками. Одна функция
 * на все источники: хранилище браузера, файл программы и резервная копия.
 */
export function normalizeProgram(parsed: unknown): ProgramData {
  const p = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<ProgramData>;
  return {
    ...defaultProgram,
    ...p,
    thematicPlan: Array.isArray(p.thematicPlan) ? p.thematicPlan : [],
    lessonPlan: Array.isArray(p.lessonPlan) ? p.lessonPlan : [],
    approvals:
      Array.isArray(p.approvals) && p.approvals.length ? p.approvals : defaultProgram.approvals,
  };
}

export function loadProgram(): ProgramData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return normalizeProgram(parsed);
    } catch {
      /* повреждённое хранилище — начинаем с чистой программы */
    }
  }
  return migrateFromV2() ?? defaultProgram;
}

function migrateFromV2(): ProgramData | null {
  const raw = localStorage.getItem('fgos-program-data-v2');
  if (!raw) return null;
  try {
    const old = JSON.parse(raw);
    if (!old || typeof old !== 'object') return null;
    const rows: PlanSection[] = Array.isArray(old.thematicPlan) && old.thematicPlan.length
      ? [
          {
            id: 'migrated',
            name: '',
            topics: old.thematicPlan.map((r: Record<string, unknown>, i: number) => ({
              id: `m${i}`,
              num: '',
              name: String(r.topic ?? ''),
              hours: Number(r.hours) || 0,
              content: '',
              activity: String(r.educationPotential ?? ''),
            })),
          },
        ]
      : [];
    return {
      ...defaultProgram,
      schoolName: String(old.schoolName ?? ''),
      subject: String(old.subject ?? ''),
      grade: String(old.grade ?? ''),
      educationLevel: (['НОО', 'ООО', 'СОО'].includes(old.educationLevel)
        ? old.educationLevel
        : 'ООО') as EducationLevel,
      teacherName: String(old.teacherName ?? ''),
      academicYear: String(old.academicYear ?? defaultProgram.academicYear),
      reviewedBy: String(old.reviewedBy ?? ''),
      agreedBy: String(old.agreedBy ?? ''),
      approvedBy: String(old.approvedBy ?? ''),
      // В v2 цели хранились отдельным полем; теперь пояснительная записка
      // единая, поэтому старый текст присоединяется к ней, а не теряется.
      normativeBase: [String(old.normativeBase ?? ''), String(old.goals ?? '')]
        .filter(Boolean)
        .join('\n\n'),
      subjectContent: String(old.subjectContent ?? ''),
      personalResults: String(old.personalResults ?? ''),
      metaResults: String(old.metaResults ?? ''),
      subjectResults: String(old.subjectResults ?? ''),
      methodologicalSupport: String(old.methodologicalSupport ?? ''),
      thematicPlan: rows,
    };
  } catch {
    return null;
  }
}
