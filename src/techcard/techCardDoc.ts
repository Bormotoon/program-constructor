/**
 * Технологическая карта урока: модель документа и сборка DOCX.
 *
 * Смысл инструмента — не «ещё одна форма», а перенос в карту того, что уже
 * разобрано из федеральных рабочих программ. Самые тяжёлые графы техкарты —
 * «виды деятельности обучающихся» и «планируемые результаты» — в ФРП есть
 * дословно, до уровня темы (поле `activity` и разделы результатов). Учитель
 * получает их подставленными и правит, а не сочиняет с нуля.
 *
 * Документ ландшафтный: таблица этапов в портретной ориентации не читается.
 */

import { AlignmentType, Document, PageOrientation, Packer } from 'docx';
import { SIZE_SMALL, body, p, table, type KitTable } from '../utils/docxKit';
import type { FrpPlan } from '../data/frp/catalog';
import { buildPlanForGrade, frpSubjectResults } from '../data/thematicPlan';

/** Строка таблицы этапов урока. */
export interface StageRow {
  id: string;
  name: string;
  /** Минуты; 0 — не указано. */
  minutes: number;
  teacher: string;
  student: string;
  /** Формируемые УУД. */
  uud: string;
}

export interface TechCardData {
  subject: string;
  grade: number;
  /** Номер урока по КТП; 0 — не указан. */
  lessonNumber: number;
  topic: string;
  lessonType: string;
  goal: string;
  /** Основное содержание темы (из ФРП). */
  content: string;
  resultsSubject: string;
  resultsMeta: string;
  resultsPersonal: string;
  equipment: string;
  forms: string;
  homework: string;
  stages: StageRow[];
  /** Откуда взяты подстановки; пусто — заполняли руками. */
  source: string;
}

export const LESSON_TYPES = [
  'урок изучения нового материала',
  'урок закрепления знаний',
  'урок комплексного применения знаний',
  'урок обобщения и систематизации',
  'урок контроля и коррекции',
  'комбинированный урок',
];

let seq = 0;
function newId(): string {
  seq += 1;
  return `s${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Этапы по умолчанию — каркас урока системно-деятельностного типа.
 * Минуты в сумме дают 40: это не норматив, а рабочая раскладка, которую
 * учитель поправит под свой урок.
 */
export function defaultStages(): StageRow[] {
  return [
    { id: newId(), name: 'Организационный момент', minutes: 2, teacher: '', student: '', uud: 'Регулятивные: организация рабочего места' },
    { id: newId(), name: 'Актуализация знаний', minutes: 5, teacher: '', student: '', uud: 'Познавательные: воспроизведение изученного' },
    { id: newId(), name: 'Постановка учебной задачи', minutes: 3, teacher: '', student: '', uud: 'Регулятивные: постановка цели, планирование' },
    { id: newId(), name: 'Изучение нового материала', minutes: 12, teacher: '', student: '', uud: 'Познавательные: работа с информацией, анализ' },
    { id: newId(), name: 'Первичное закрепление', minutes: 8, teacher: '', student: '', uud: 'Познавательные: применение по образцу' },
    { id: newId(), name: 'Самостоятельная работа', minutes: 7, teacher: '', student: '', uud: 'Регулятивные: самоконтроль' },
    { id: newId(), name: 'Рефлексия', minutes: 2, teacher: '', student: '', uud: 'Регулятивные: оценка результата' },
    { id: newId(), name: 'Домашнее задание', minutes: 1, teacher: '', student: '', uud: 'Регулятивные: планирование работы' },
  ];
}

export function defaultTechCard(): TechCardData {
  return {
    subject: '',
    grade: 0,
    lessonNumber: 0,
    topic: '',
    lessonType: LESSON_TYPES[0],
    goal: '',
    content: '',
    resultsSubject: '',
    resultsMeta: '',
    resultsPersonal: '',
    equipment: '',
    forms: 'фронтальная, индивидуальная, парная',
    homework: '',
    stages: defaultStages(),
    source: '',
  };
}

/**
 * Разбивает «виды деятельности» ФРП на отдельные действия.
 *
 * В ФРП это связный текст из повелительных формулировок, разделённых точкой:
 * «Раскрывать смысл изучаемых понятий. Анализировать устройства компьютера…
 * Практические работы: 1. Включение компьютера…». Каждая фраза — готовая
 * строка для графы «деятельность обучающихся».
 */
export function splitActivity(activity: string): { actions: string[]; practice: string[] } {
  const marker = activity.search(/Практическ(ие|ая)\s+работ/i);
  const head = marker >= 0 ? activity.slice(0, marker) : activity;
  const tail = marker >= 0 ? activity.slice(marker) : '';

  const actions = head
    .split(/(?<=[.;])\s+/)
    .map((s) => s.replace(/[.;]\s*$/, '').trim())
    .filter((s) => s.length >= 8);

  const practice = tail
    // Нумерация внутри перечня практических работ: «1. …  2. …».
    .replace(/^Практическ\S*\s+работ\S*\s*:?\s*/i, '')
    .split(/\s*\d+\.\s+/)
    .map((s) => s.replace(/[.;]\s*$/, '').trim())
    .filter((s) => s.length >= 8);

  return { actions, practice };
}

/** Тема ФРП, пригодная для подстановки в карту. */
export interface FrpTopicChoice {
  num: string;
  name: string;
  hours: number;
  content: string;
  activity: string;
  section: string;
}

/** Все темы программы для класса — плоским списком для выбора. */
export function topicsForGrade(plan: FrpPlan, grade: number): FrpTopicChoice[] {
  const out: FrpTopicChoice[] = [];
  for (const section of buildPlanForGrade(plan, grade)) {
    for (const topic of section.topics) {
      out.push({
        num: topic.num,
        name: topic.name,
        hours: topic.hours,
        content: topic.content,
        activity: topic.activity,
        section: section.name,
      });
    }
  }
  return out;
}

/**
 * Заполняет карту из выбранной темы ФРП.
 *
 * Что подставляется и куда — решение содержательное, не техническое:
 *   * тема урока и основное содержание — как в программе;
 *   * результаты трёх видов — из разделов программы для этого класса;
 *   * действия из `activity` расходятся по графе «деятельность обучающихся»
 *     содержательных этапов, а перечень практических работ — в самостоятельную
 *     работу, потому что именно там он и выполняется.
 * Остальные графы остаются пустыми намеренно: цель урока и деятельность
 * учителя — авторская часть, подставлять её было бы обманом.
 */
export function fillFromFrp(
  data: TechCardData,
  plan: FrpPlan,
  grade: number,
  topic: FrpTopicChoice,
): TechCardData {
  const { actions, practice } = splitActivity(topic.activity);
  const half = Math.ceil(actions.length / 2) || 0;
  const forStudy = actions.slice(0, half);
  const forPractice = actions.slice(half);

  const stages = data.stages.map((s) => {
    if (s.name === 'Изучение нового материала' && forStudy.length) {
      return { ...s, student: forStudy.join('. ') + '.' };
    }
    if (s.name === 'Первичное закрепление' && forPractice.length) {
      return { ...s, student: forPractice.join('. ') + '.' };
    }
    if (s.name === 'Самостоятельная работа' && practice.length) {
      return { ...s, student: 'Практические работы: ' + practice.join('; ') + '.' };
    }
    return s;
  });

  return {
    ...data,
    subject: plan.subject,
    grade,
    /*
     * Уже заполненную тему НЕ перезатираем. Из конструктора приходит
     * формулировка строки поурочного плана — она конкретнее названия темы
     * программы (тема на 4 часа даёт четыре разных урока), и подменять её
     * общим названием значит терять смысл. Пусто — берём из программы.
     */
    topic: data.topic.trim() || topic.name,
    content: topic.content,
    resultsSubject: frpSubjectResults(plan, grade),
    resultsMeta: plan.metaResults ?? '',
    resultsPersonal: plan.personalResults ?? '',
    stages,
    source: plan.source ? `ФРП: ${plan.source}` : 'федеральная рабочая программа',
  };
}

/* ── Документ ───────────────────────────────────────────────────────────── */

export function techCardTitle(data: TechCardData): string {
  const bits = ['Технологическая карта урока'];
  if (data.subject) bits.push(data.subject.toLowerCase());
  if (data.grade) bits.push(`${data.grade} класс`);
  return bits.join(', ');
}

export function techCardFileName(data: TechCardData): string {
  const clean = (s: string) => s.replace(/[^\wа-яёА-ЯЁ]+/gi, '_').replace(/^_+|_+$/g, '');
  return ['tehnologicheskaya_karta', clean(data.subject), data.grade ? `${data.grade}_klass` : '', clean(data.topic).slice(0, 40)]
    .filter(Boolean)
    .join('_');
}

/** Таблица этапов урока. */
export function stagesTable(data: TechCardData): KitTable {
  return {
    head: ['Этап урока', 'Мин.', 'Деятельность учителя', 'Деятельность обучающихся', 'Формируемые УУД'],
    widths: [0.16, 0.06, 0.26, 0.32, 0.2],
    rows: data.stages.map((s) => [
      { text: s.name },
      { text: s.minutes ? String(s.minutes) : '', align: 'center' as const },
      { text: s.teacher },
      { text: s.student },
      { text: s.uud },
    ]),
  };
}

/** Шапка карты — таблица «поле / значение», так её и сдают. */
export function headerTable(data: TechCardData): KitTable {
  const rows: [string, string][] = [
    ['Предмет', data.subject],
    ['Класс', data.grade ? `${data.grade}` : ''],
    ['Тема урока', data.topic],
    ['Номер урока по КТП', data.lessonNumber ? `${data.lessonNumber}` : ''],
    ['Тип урока', data.lessonType],
    ['Цель урока', data.goal],
    ['Основное содержание', data.content],
    ['Предметные результаты', data.resultsSubject],
    ['Метапредметные результаты', data.resultsMeta],
    ['Личностные результаты', data.resultsPersonal],
    ['Формы работы', data.forms],
    ['Оборудование и ресурсы', data.equipment],
    ['Домашнее задание', data.homework],
  ];
  return {
    head: ['Параметр', 'Значение'],
    widths: [0.26, 0.74],
    rows: rows.filter(([, v]) => v.trim() !== '').map(([k, v]) => [{ text: k, bold: true }, { text: v }]),
  };
}

export function buildTechCardDocument(data: TechCardData): Document {
  const minutes = data.stages.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  return new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          p(techCardTitle(data).toUpperCase(), {
            alignment: AlignmentType.CENTER,
            bold: true,
            spacing: { after: 240 },
          }),
          table(headerTable(data)),
          p('Ход урока', { bold: true, spacing: { before: 240, after: 120 } }),
          table(stagesTable(data)),
          ...body(`Всего: ${minutes} минут.`),
          ...(data.source
            ? [
                p(
                  `Формулировки тем, содержания, видов деятельности и планируемых результатов подставлены из федеральной рабочей программы (${data.source}) и отредактированы учителем.`,
                  { size: SIZE_SMALL, italics: true, spacing: { before: 240 } },
                ),
              ]
            : []),
        ],
      },
    ],
  });
}

export async function techCardDocxBlob(data: TechCardData): Promise<Blob> {
  return Packer.toBlob(buildTechCardDocument(data));
}
