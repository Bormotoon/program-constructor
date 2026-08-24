/**
 * Календарный учебный график: модель документа и сборка DOCX/PDF.
 *
 * Это отдельный документ приложения к ООП, а не раздел рабочей программы,
 * поэтому и живёт отдельно. Кирпичики оформления — общие (docxKit), чтобы
 * шрифт, кегли и рамки не разъезжались с рабочей программой.
 *
 * Всё, что можно посчитать, считается: границы четвертей, число учебных дней
 * и недель, длительность каникул. Учитель вводит только реквизиты и режим.
 */

import { AlignmentType, Document, Packer } from 'docx';
import {
  SIZE_SMALL,
  body,
  p,
  table,
  type KitTable,
} from '../utils/docxKit';
import {
  SCHOOL_YEARS,
  formatRu,
  rangeDays,
  studyPeriods,
  type SchoolYear,
  type StudyPeriod,
} from '../data/schoolYear';

export interface ScheduleData {
  schoolName: string;
  locality: string;
  /** Реквизиты приказа об утверждении; пусто — строка не печатается. */
  orderNumber: string;
  orderDate: string;
  yearId: string;
  /** Учебная неделя. */
  weekDays: 5 | 6;
  /** Последний учебный день; пусто — «не ранее» из года. */
  lastDay: string;
  lessonMinutes: number;
  shifts: 1 | 2;
  /** Сроки промежуточной аттестации, свободным текстом. */
  attestation: string;
}

export function defaultSchedule(): ScheduleData {
  return {
    schoolName: '',
    locality: '',
    orderNumber: '',
    orderDate: '',
    yearId: SCHOOL_YEARS[0].id,
    weekDays: 5,
    lastDay: '',
    lessonMinutes: 40,
    shifts: 1,
    attestation:
      'Промежуточная аттестация проводится по итогам освоения образовательной программы '
      + 'за учебный год в период с 4 по 22 мая 2027 года без прекращения образовательной '
      + 'деятельности по предметам учебного плана.',
  };
}

export function yearOf(data: ScheduleData): SchoolYear {
  return SCHOOL_YEARS.find((y) => y.id === data.yearId) ?? SCHOOL_YEARS[0];
}

/** Периоды по данным формы — для обычных классов и отдельно для первого. */
export function schedulePeriods(data: ScheduleData): {
  common: StudyPeriod[];
  firstGrade: StudyPeriod[];
} {
  const year = yearOf(data);
  const base = { weekDays: data.weekDays, end: data.lastDay || undefined };
  return {
    common: studyPeriods(year, base),
    firstGrade: studyPeriods(year, { ...base, extraRanges: year.extraFirstGrade }),
  };
}

function weeksOf(periods: StudyPeriod[]): number {
  return Math.round(periods.reduce((a, q) => a + q.weeks, 0));
}

/** Таблица «Продолжительность учебного года». */
export function yearTable(data: ScheduleData): KitTable {
  const year = yearOf(data);
  const { common, firstGrade } = schedulePeriods(data);
  const end = data.lastDay || year.endNotEarlierThan;
  return {
    head: ['Классы', 'Начало учебного года', 'Окончание учебного года', 'Учебных недель'],
    widths: [0.16, 0.28, 0.28, 0.28],
    rows: [
      [
        { text: '1 класс' },
        { text: formatRu(year.start), align: 'center' },
        { text: formatRu(end), align: 'center' },
        { text: String(weeksOf(firstGrade)), align: 'center' },
      ],
      [
        { text: '2–8, 10 классы' },
        { text: formatRu(year.start), align: 'center' },
        { text: formatRu(end), align: 'center' },
        { text: String(weeksOf(common)), align: 'center' },
      ],
      [
        { text: '9, 11 классы' },
        { text: formatRu(year.start), align: 'center' },
        // Не выдумываем дату: у выпускных классов окончание привязано к
        // расписанию ГИА, и в первоисточнике так и сказано.
        { text: 'по расписанию ГИА', align: 'center' },
        { text: `${weeksOf(common)} + ГИА`, align: 'center' },
      ],
    ],
  };
}

/** Таблица учебных периодов. */
export function periodsTable(data: ScheduleData): KitTable {
  const { common } = schedulePeriods(data);
  return {
    head: ['Учебный период', 'Начало', 'Окончание', 'Учебных дней', 'Учебных недель'],
    widths: [0.24, 0.19, 0.19, 0.19, 0.19],
    rows: [
      ...common.map((q) => [
        { text: q.label },
        { text: formatRu(q.from), align: 'center' as const },
        { text: formatRu(q.to), align: 'center' as const },
        { text: String(q.days), align: 'center' as const },
        { text: String(q.weeks), align: 'center' as const },
      ]),
      [
        { text: 'Итого', bold: true },
        { text: '', align: 'center' },
        { text: '', align: 'center' },
        { text: String(common.reduce((a, q) => a + q.days, 0)), bold: true, align: 'center' },
        { text: String(weeksOf(common)), bold: true, align: 'center' },
      ],
    ],
  };
}

/** Таблица каникул. */
export function holidaysTable(data: ScheduleData): KitTable {
  const year = yearOf(data);
  const rows = [
    ...year.holidays.map((h) => [
      { text: h.label.charAt(0).toUpperCase() + h.label.slice(1) },
      { text: formatRu(h.from), align: 'center' as const },
      { text: formatRu(h.to), align: 'center' as const },
      { text: String(rangeDays(h)), align: 'center' as const },
      { text: 'все классы', align: 'center' as const },
    ]),
    ...year.extraFirstGrade.map((h) => [
      { text: h.label.charAt(0).toUpperCase() + h.label.slice(1) },
      { text: formatRu(h.from), align: 'center' as const },
      { text: formatRu(h.to), align: 'center' as const },
      { text: String(rangeDays(h)), align: 'center' as const },
      { text: '1 класс', align: 'center' as const },
    ]),
  ];
  return {
    head: ['Каникулы', 'Начало', 'Окончание', 'Дней', 'Классы'],
    widths: [0.3, 0.17, 0.17, 0.12, 0.24],
    rows,
  };
}

/** Таблица нерабочих праздничных дней внутри учебного года. */
export function nonTeachingTable(data: ScheduleData): KitTable {
  const year = yearOf(data);
  return {
    head: ['Дата', 'Нерабочий день'],
    widths: [0.24, 0.76],
    rows: year.nonTeachingDays.map((d) => [
      { text: formatRu(d.date), align: 'center' as const },
      { text: d.kind === 'carryover' ? `${d.label} — уточнить по производственному календарю` : d.label },
    ]),
  };
}

export function scheduleTitle(data: ScheduleData): string {
  return `Календарный учебный график на ${yearOf(data).label}`;
}

export function scheduleFileName(data: ScheduleData): string {
  const school = data.schoolName.replace(/[^\wа-яёА-ЯЁ]+/gi, '_').replace(/^_+|_+$/g, '');
  return ['kalendarnyy_uchebnyy_grafik', school, yearOf(data).id].filter(Boolean).join('_');
}

export function buildScheduleDocument(data: ScheduleData): Document {
  const year = yearOf(data);
  const head = [
    ...(data.schoolName ? [p(data.schoolName, { alignment: AlignmentType.CENTER, bold: true })] : []),
    ...(data.locality ? [p(data.locality, { alignment: AlignmentType.CENTER })] : []),
    ...(data.orderNumber || data.orderDate
      ? [
          p(
            `Утверждён приказом ${[data.orderNumber && `№ ${data.orderNumber}`, data.orderDate && `от ${data.orderDate}`]
              .filter(Boolean)
              .join(' ')}`,
            { alignment: AlignmentType.CENTER, size: SIZE_SMALL },
          ),
        ]
      : []),
    p(scheduleTitle(data).toUpperCase(), {
      alignment: AlignmentType.CENTER,
      bold: true,
      spacing: { before: 240, after: 240 },
    }),
  ];

  const section = (n: number, title: string) =>
    p(`${n}. ${title}`, { bold: true, spacing: { before: 240, after: 120 } });

  return new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 28 } } } },
    sections: [
      {
        children: [
          ...head,

          section(1, 'Продолжительность учебного года'),
          table(yearTable(data)),

          section(2, 'Учебные периоды'),
          table(periodsTable(data)),

          section(3, 'Каникулы'),
          table(holidaysTable(data)),

          section(4, 'Нерабочие праздничные дни в учебном году'),
          table(nonTeachingTable(data)),

          section(5, 'Режим работы'),
          ...body(
            [
              `Продолжительность учебной недели: ${data.weekDays} дней.`,
              `Сменность занятий: ${data.shifts === 1 ? 'одна смена' : 'две смены'}.`,
              `Продолжительность урока: ${data.lessonMinutes} минут.`,
            ].join('\n'),
          ),

          section(6, 'Промежуточная аттестация'),
          ...body(data.attestation),

          p(
            `Сроки каникул приведены по рекомендациям: ${year.source}. `
              + 'Календарный учебный график утверждается локальным актом образовательной организации.',
            { size: SIZE_SMALL, italics: true, spacing: { before: 240 } },
          ),
        ],
      },
    ],
  });
}

export async function scheduleDocxBlob(data: ScheduleData): Promise<Blob> {
  return Packer.toBlob(buildScheduleDocument(data));
}
