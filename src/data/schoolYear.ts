/**
 * Календарь учебного года: каникулы, нерабочие праздничные дни и раскладка
 * уроков по датам.
 *
 * Зачем это здесь. В поурочном планировании у каждой строки есть дата, и до
 * сих пор учитель вбивал её руками — от 34 до 136 раз на одну программу,
 * сверяясь с расписанием, каникулами и праздниками. Расчёт полностью
 * механический, и делать его руками незачем.
 *
 * ВСЕ даты здесь — РЕКОМЕНДОВАННЫЕ. Календарный учебный график школа
 * утверждает своим приказом, поэтому и каникулы, и дата начала в интерфейсе
 * правятся, а эти значения — только подставленные по умолчанию.
 */

/** Отрезок дат, включая обе границы. Даты — ISO `yyyy-mm-dd`. */
export interface DateRange {
  from: string;
  to: string;
  label: string;
}

/** Нерабочий день, который не может быть учебным. */
export interface NonTeachingDay {
  date: string;
  label: string;
  /**
   * `holiday` — нерабочий праздничный день по ст. 112 ТК РФ, дата фиксированная.
   * `carryover` — перенос выходного, совпавшего с праздником: его устанавливает
   * отдельное постановление правительства, и до его публикации дата
   * предположительная. Различаем, чтобы в интерфейсе честно сказать, что
   * переносы стоит сверить с производственным календарём.
   */
  kind: 'holiday' | 'carryover';
}

export interface SchoolYear {
  /** Идентификатор вида `2026-2027`. */
  id: string;
  label: string;
  /** Документ, из которого взяты сроки. Показывается учителю. */
  source: string;
  /** Рекомендованное начало учебного года. */
  start: string;
  /**
   * Учебный год заканчивается «не ранее» этой даты — так сформулировано в
   * первоисточнике, и это не то же самое, что «заканчивается в этот день».
   * У 9 и 11 классов окончание привязано к расписанию ГИА.
   */
  endNotEarlierThan: string;
  holidays: DateRange[];
  /** Дополнительные каникулы первоклассников. */
  extraFirstGrade: DateRange[];
  nonTeachingDays: NonTeachingDay[];
}

/**
 * 2026-2027 — по письму Минпросвещения России от 07.07.2026 № ОК-1948/03
 * (проверено по тексту документа 24.08.2026, а не по новостным пересказам:
 * пересказы дружно писали «год заканчивается 26 мая», тогда как в письме
 * стоит «не ранее 26 мая», и для 9 и 11 классов срок иной).
 */
export const SCHOOL_YEARS: SchoolYear[] = [
  {
    id: '2026-2027',
    label: '2026-2027 учебный год',
    source: 'Письмо Минпросвещения России от 07.07.2026 № ОК-1948/03',
    start: '2026-09-01',
    endNotEarlierThan: '2027-05-26',
    holidays: [
      { from: '2026-10-26', to: '2026-11-03', label: 'осенние каникулы' },
      { from: '2026-12-31', to: '2027-01-10', label: 'зимние каникулы' },
      { from: '2027-03-27', to: '2027-04-04', label: 'весенние каникулы' },
    ],
    extraFirstGrade: [
      { from: '2027-02-15', to: '2027-02-21', label: 'дополнительные каникулы 1 класса' },
    ],
    nonTeachingDays: [
      // Внутри учебного периода; те, что попадают в каникулы (1-8 января),
      // здесь не нужны — их и так закрывает отрезок каникул.
      { date: '2026-11-04', label: 'День народного единства', kind: 'holiday' },
      { date: '2027-02-23', label: 'День защитника Отечества', kind: 'holiday' },
      { date: '2027-03-08', label: 'Международный женский день', kind: 'holiday' },
      { date: '2027-05-01', label: 'Праздник Весны и Труда', kind: 'holiday' },
      { date: '2027-05-03', label: 'перенос с 1 мая (суббота)', kind: 'carryover' },
      { date: '2027-05-09', label: 'День Победы', kind: 'holiday' },
      { date: '2027-05-10', label: 'перенос с 9 мая (воскресенье)', kind: 'carryover' },
    ],
  },
];

/** Учебный год, в который попадает дата; null — такого года в наборе нет. */
export function schoolYearFor(isoDate: string): SchoolYear | null {
  return (
    SCHOOL_YEARS.find((y) => isoDate >= y.start && isoDate <= lastPossibleDay(y)) ?? null
  );
}

/**
 * Крайняя дата, до которой имеет смысл раскладывать уроки: конец июня года
 * окончания. Границей служит не `endNotEarlierThan` (учебный год у части
 * классов длиннее), а именно запас — раскладка всё равно ограничена числом
 * уроков, а не датой.
 */
function lastPossibleDay(y: SchoolYear): string {
  return `${y.endNotEarlierThan.slice(0, 4)}-06-30`;
}

/* ── Арифметика дат ──────────────────────────────────────────────────────────
 * Всё через Date.UTC и UTC-геттеры. Локальное время здесь — источник ошибок на
 * сутки: полночь по местному в отрицательном смещении приходится на предыдущий
 * день по UTC, и урок уезжает на день назад.
 * ─────────────────────────────────────────────────────────────────────────── */

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function toIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const DAY_MS = 86400000;

/** День недели: 1 — понедельник, 7 — воскресенье (как в ISO, а не как в JS). */
export function isoWeekday(iso: string): number {
  const js = new Date(toUtc(iso)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** `2026-09-01` → `01.09.2026` — формат, в котором дата лежит в КТП. */
export function formatRu(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** `01.09.2026` → `2026-09-01`; пустая строка, если разобрать не удалось. */
export function parseRu(value: string): string {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export const WEEKDAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export interface LessonDatesOptions {
  /** С какого дня начинаем искать первый урок. */
  start: string;
  /** Дни недели предмета по расписанию, 1..7. */
  weekdays: number[];
  /**
   * Сколько дат нужно. Обычно это число строк поурочного плана; строка с
   * `hours > 1` занимает столько же учебных дней.
   */
  count: number;
  /** Отрезки, целиком выпадающие из учебного времени (каникулы). */
  skipRanges?: DateRange[];
  /** Отдельные нерабочие дни. */
  skipDays?: string[];
}

export interface LessonDatesResult {
  /** Даты уроков по порядку, ISO. Короче `count`, если упёрлись в предел. */
  dates: string[];
  /** Каникулы и праздники, которые пришлось перешагнуть. */
  skipped: string[];
  /** Раскладка не поместилась в отведённый предел дат. */
  truncated: boolean;
}

/**
 * Раскладывает `count` уроков по календарю, начиная с `start`, только по
 * указанным дням недели, перешагивая каникулы и нерабочие дни.
 *
 * Предел прохода — два года от начала: это заведомо больше любого учебного
 * года и одновременно защита от бесконечного цикла, если `weekdays` пуст.
 */
export function lessonDates(opts: LessonDatesOptions): LessonDatesResult {
  const { start, weekdays, count } = opts;
  const ranges = opts.skipRanges ?? [];
  const days = new Set(opts.skipDays ?? []);
  const wanted = new Set(weekdays);

  const dates: string[] = [];
  const skipped = new Set<string>();
  if (!wanted.size || count <= 0) {
    return { dates, skipped: [], truncated: count > 0 };
  }

  const limit = toUtc(start) + 730 * DAY_MS;
  for (let ms = toUtc(start); ms <= limit && dates.length < count; ms += DAY_MS) {
    const iso = toIso(ms);
    if (!wanted.has(isoWeekday(iso))) continue;

    const range = ranges.find((r) => iso >= r.from && iso <= r.to);
    if (range) {
      skipped.add(range.label);
      continue;
    }
    if (days.has(iso)) {
      skipped.add(iso);
      continue;
    }
    dates.push(iso);
  }

  return { dates, skipped: [...skipped], truncated: dates.length < count };
}

/**
 * Сколько учебных недель между двумя датами без каникул — для календарного
 * учебного графика.
 */
export function teachingWeeks(from: string, to: string, skipRanges: DateRange[]): number {
  let teachingDays = 0;
  for (let ms = toUtc(from); ms <= toUtc(to); ms += DAY_MS) {
    const iso = toIso(ms);
    if (isoWeekday(iso) === 7) continue;
    if (skipRanges.some((r) => iso >= r.from && iso <= r.to)) continue;
    teachingDays += 1;
  }
  return Math.round((teachingDays / 6) * 10) / 10;
}
