import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, TriangleAlert, X } from 'lucide-react';
import {
  SCHOOL_YEARS,
  WEEKDAY_NAMES,
  formatRu,
  lessonDates,
  parseRu,
  schoolYearFor,
  type DateRange,
} from '../data/schoolYear';
import { Button, Field, IconButton, Notice, TextInput, cx } from './ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Сколько уроков надо расставить. */
  lessonCount: number;
  /** Готовые даты в формате КТП, по порядку уроков. */
  onApply: (dates: string[]) => void;
}

/**
 * Диалог автопростановки дат в поурочном плане.
 *
 * Одна кнопка в панели плана открывает это окно; постоянного интерфейса не
 * добавляется. Учитель отмечает дни недели своего предмета по расписанию, и
 * даты раскладываются сами — с перешагиванием каникул и нерабочих дней.
 *
 * Предпросмотр показан всегда и намеренно крупно: по нему сразу видно, что
 * дни недели выбраны неверно. Информатика в 7 классе это 34 часа, то есть
 * ОДИН день в неделю; отметив два, учитель получил бы план, кончающийся в
 * январе, и без предпросмотра узнал бы об этом уже из готового документа.
 */
export function LessonDatesDialog({ isOpen, onClose, lessonCount, onApply }: Props) {
  const year = SCHOOL_YEARS[0];
  const [startText, setStartText] = useState(formatRu(year.start));
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [skipNonTeaching, setSkipNonTeaching] = useState(true);
  const [firstGrade, setFirstGrade] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const start = parseRu(startText);
  const activeYear = start ? schoolYearFor(start) : null;

  const result = useMemo(() => {
    if (!start || !weekdays.length) return null;
    const ranges: DateRange[] = [];
    if (activeYear && skipHolidays) ranges.push(...activeYear.holidays);
    if (activeYear && firstGrade) ranges.push(...activeYear.extraFirstGrade);
    const days =
      activeYear && skipNonTeaching ? activeYear.nonTeachingDays.map((d) => d.date) : [];
    return lessonDates({
      start,
      weekdays,
      count: lessonCount,
      skipRanges: ranges,
      skipDays: days,
    });
  }, [start, weekdays, lessonCount, activeYear, skipHolidays, skipNonTeaching, firstGrade]);

  // Закрытие по Escape и возврат фокуса — иначе с клавиатуры из окна не выйти.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const apply = () => {
    if (!result?.dates.length) return;
    onApply(result.dates.map(formatRu));
    onClose();
  };

  const perWeek = weekdays.length;
  const lastDate = result?.dates.at(-1) ?? '';
  const tooLate = lastDate !== '' && lastDate > `${year.endNotEarlierThan.slice(0, 4)}-06-30`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dates-dialog-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="dates-dialog-title" className="text-base font-semibold">
            Проставить даты уроков
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Дата первого урока" hint="Формат дд.мм.гггг">
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={startText}
                inputMode="numeric"
                autoComplete="off"
                placeholder="01.09.2026"
                onChange={(e) => setStartText(e.target.value)}
              />
            )}
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Дни недели по расписанию</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_NAMES.map((name, i) => {
                const day = i + 1;
                const on = weekdays.includes(day);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cx(
                      'w-12 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors duration-150',
                      on
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line text-ink-muted hover:bg-sunken',
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-subtle">
              {perWeek
                ? `${perWeek} ${perWeek === 1 ? 'урок' : perWeek < 5 ? 'урока' : 'уроков'} в неделю`
                : 'Отметьте хотя бы один день'}
            </p>
          </div>

          {activeYear ? (
            <div className="space-y-2 rounded-lg border border-line bg-sunken/50 p-3">
              <p className="text-xs text-ink-subtle">{activeYear.source}</p>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={skipHolidays}
                  onChange={(e) => setSkipHolidays(e.target.checked)}
                />
                <span>
                  Пропускать каникулы
                  <span className="block text-xs text-ink-subtle">
                    {activeYear.holidays
                      .map((h) => `${h.label} ${formatRu(h.from)}–${formatRu(h.to)}`)
                      .join('; ')}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={skipNonTeaching}
                  onChange={(e) => setSkipNonTeaching(e.target.checked)}
                />
                <span>
                  Пропускать нерабочие праздничные дни
                  <span className="block text-xs text-ink-subtle">
                    Переносы выходных устанавливает отдельное постановление — сверьте с
                    производственным календарём.
                  </span>
                </span>
              </label>
              {activeYear.extraFirstGrade.length > 0 && (
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={firstGrade}
                    onChange={(e) => setFirstGrade(e.target.checked)}
                  />
                  <span>
                    Это первый класс
                    <span className="block text-xs text-ink-subtle">
                      Добавит дополнительные каникулы{' '}
                      {activeYear.extraFirstGrade
                        .map((h) => `${formatRu(h.from)}–${formatRu(h.to)}`)
                        .join(', ')}
                    </span>
                  </span>
                </label>
              )}
            </div>
          ) : (
            <Notice tone="warn" icon={<TriangleAlert size={15} />}>
              Каникулы на этот учебный год не заданы — даты разложатся только по дням недели.
              Проверьте их вручную.
            </Notice>
          )}

          {/* Предпросмотр — главный орган этого окна, см. комментарий к компоненту. */}
          <div className="rounded-lg border border-line-strong bg-brand-soft/30 p-3">
            <p className="text-sm font-medium text-ink">
              {result?.dates.length
                ? `${result.dates.length} ${result.dates.length === 1 ? 'урок' : 'уроков'}: ` +
                  `${formatRu(result.dates[0])} — ${formatRu(lastDate)}`
                : 'Заполните дату начала и дни недели'}
            </p>
            {result?.skipped.length ? (
              <p className="mt-1 text-xs text-ink-subtle">
                перешагнуто: {result.skipped.map((s) => (s.includes('-') ? formatRu(s) : s)).join(', ')}
              </p>
            ) : null}
          </div>

          {result?.truncated && (
            <Notice tone="danger" icon={<TriangleAlert size={15} />}>
              Уроки не поместились: расставлено {result.dates.length} из {lessonCount}. Обычно это
              значит, что дней недели отмечено слишком мало.
            </Notice>
          )}
          {tooLate && (
            <Notice tone="warn" icon={<TriangleAlert size={15} />}>
              Последний урок приходится на {formatRu(lastDate)} — это уже за пределами учебного
              года. Проверьте число дней в неделю.
            </Notice>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" disabled={!result?.dates.length} onClick={apply}>
            <CalendarDays size={15} /> Проставить даты
          </Button>
        </footer>
      </div>
    </div>
  );
}
