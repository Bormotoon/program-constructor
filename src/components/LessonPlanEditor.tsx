import { memo, useCallback, useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Copy, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import {
  addLesson,
  duplicateLesson,
  lessonTotals,
  moveLesson,
  removeLesson,
  updateLesson,
  validateLessonPlan,
} from '../data/lessonPlan';
import type { LessonRow } from '../data/program';
import type { PlanSection } from '../data/thematicPlan';
import { Button, EmptyState, IconButton, Notice, cx } from './ui';

interface Props {
  rows: LessonRow[];
  sections: PlanSection[];
  onChange: (rows: LessonRow[]) => void;
  onRegenerate: (variant?: number) => void;
  /**
   * Названия вариантов поурочного планирования из ФРП. Пустой массив —
   * готового плана нет, он разворачивается из тематического.
   */
  frpVariants?: string[];
}

const TH = 'border border-line px-2 py-2 text-left text-xs font-semibold text-ink-muted';
const TD = 'border border-line px-1.5 py-1 align-top';
const CELL =
  'w-full rounded bg-transparent px-1.5 py-1 text-sm text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand)] ' +
  'transition-colors duration-150 hover:bg-sunken focus:bg-brand-soft';

/** Стабильные обработчики строки — без них мемоизация строк не имела бы смысла. */
interface RowHandlers {
  patch: (id: string, patch: Partial<LessonRow>) => void;
  move: (id: string, delta: -1 | 1) => void;
  copy: (id: string) => void;
  remove: (id: string) => void;
}

export function LessonPlanEditor({
  rows,
  sections,
  onChange,
  onRegenerate,
  frpVariants = [],
}: Props) {
  const fromFrp = frpVariants.length > 0;
  const issues = useMemo(() => validateLessonPlan(rows, sections), [rows, sections]);
  const totals = lessonTotals(rows);

  // Обработчики читают строки через ref и потому не пересоздаются при каждом
  // изменении. Иначе поурочный план на две сотни строк перерисовывался бы
  // целиком на каждое нажатие клавиши в любой ячейке.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const handlers = useMemo<RowHandlers>(
    () => ({
      patch: (id, patch) => onChange(updateLesson(rowsRef.current, id, patch)),
      move: (id, delta) => onChange(moveLesson(rowsRef.current, id, delta)),
      copy: (id) => onChange(duplicateLesson(rowsRef.current, id)),
      remove: (id) => onChange(removeLesson(rowsRef.current, id)),
    }),
    [onChange],
  );

  const regenerate = useCallback(
    (variant = 0) => {
      if (
        !rows.length ||
        window.confirm(
          (fromFrp
            ? 'Заполнить поурочный план из федеральной рабочей программы?'
            : 'Пересобрать поурочный план из тематического?') +
            '\nВнесённые вручную правки будут потеряны.',
        )
      ) {
        onRegenerate(variant);
      }
    },
    [onRegenerate, fromFrp, rows.length],
  );

  if (!rows.length) {
    return (
      <EmptyState
        icon={<CalendarDays size={28} />}
        title="Поурочное планирование ещё не сформировано"
        description={
          fromFrp
            ? 'В федеральной рабочей программе по этому предмету поурочное планирование расписано — темы уроков возьмутся из неё дословно.'
            : 'План развернётся из тематического: тема на N часов даёт N уроков, названия — из её программного содержания. Дальше формулировки, порядок и даты правятся вручную.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {fromFrp && frpVariants.length > 1 ? (
              // Вариантов несколько — учитель выбирает, а не получает первый
              // попавшийся: они отличаются недельной нагрузкой или учебником.
              frpVariants.map((name, i) => (
                <Button key={name || i} variant="primary" onClick={() => regenerate(i)}>
                  <RefreshCw size={15} /> {name || `Вариант ${i + 1}`}
                </Button>
              ))
            ) : (
              <Button
                variant="primary"
                disabled={!fromFrp && !sections.length}
                onClick={() => regenerate(0)}
              >
                <RefreshCw size={15} />
                {fromFrp ? 'Заполнить из ФРП' : 'Сформировать из тематического плана'}
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => regenerate(0)}>
          <RefreshCw size={15} />
          {fromFrp ? 'Перезаполнить из ФРП' : 'Пересобрать из тематического'}
        </Button>
        {fromFrp && (
          <span className="text-xs text-ink-subtle">темы уроков взяты из ФРП</span>
        )}
        <span className="tabular text-sm text-ink-muted">
          уроков: {rows.length} · часов: {totals.hours}
        </span>
      </div>

      {issues.length > 0 && (
        <div role="status" aria-live="polite" className="space-y-2">
          {issues.map((iss, i) => (
            <Notice
              key={i}
              tone={iss.level === 'error' ? 'danger' : 'warn'}
              icon={<TriangleAlert size={15} />}
            >
              {iss.message}
            </Notice>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse">
          <caption className="sr-only">Поурочное планирование</caption>
          <thead className="bg-sunken">
            <tr>
              <th className={cx(TH, 'w-16 text-center')}>№ урока</th>
              <th className={cx(TH, 'min-w-72')}>Тема урока</th>
              <th className={cx(TH, 'w-16 text-center')}>Часов</th>
              <th className={cx(TH, 'w-20 text-center')}>Контр.</th>
              <th className={cx(TH, 'w-20 text-center')}>Практ.</th>
              <th className={cx(TH, 'w-28 text-center')}>Дата</th>
              <th className={cx(TH, 'w-[7.5rem] text-center')}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <LessonRowView
                key={row.id}
                row={row}
                first={i === 0}
                last={i === rows.length - 1}
                handlers={handlers}
              />
            ))}
            <tr className="bg-sunken text-sm font-semibold">
              <td className={cx(TD, 'py-2.5')} colSpan={2}>
                ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ
              </td>
              <td className={cx(TD, 'tabular py-2.5 text-center')}>{totals.hours}</td>
              <td className={cx(TD, 'tabular py-2.5 text-center')}>{totals.control}</td>
              <td className={cx(TD, 'tabular py-2.5 text-center')}>{totals.practice}</td>
              <td className={TD} colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <Button size="sm" onClick={() => onChange(addLesson(rows))}>
        <Plus size={15} /> Добавить урок
      </Button>
    </div>
  );
}

const LessonRowView = memo(function LessonRowView({
  row,
  first,
  last,
  handlers,
}: {
  row: LessonRow;
  first: boolean;
  last: boolean;
  handlers: RowHandlers;
}) {
  // Часы на контрольные и практические не могут превышать часы урока —
  // то же ограничение подсвечивает оригинальный конструктор.
  const over = (Number(row.control) || 0) + (Number(row.practice) || 0) > (Number(row.hours) || 0);

  return (
    <tr className={over ? 'bg-danger-soft' : undefined}>
      <td className={cx(TD, 'tabular py-2 text-center text-sm text-ink-muted')}>{row.number}</td>
      <td className={TD}>
        <textarea
          rows={1}
          className={cx(CELL, 'resize-y')}
          value={row.topic}
          aria-label={`Тема урока ${row.number}`}
          onChange={(e) => handlers.patch(row.id, { topic: e.target.value })}
        />
      </td>
      {(['hours', 'control', 'practice'] as const).map((f) => (
        <td key={f} className={TD}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className={cx(CELL, 'text-center', over && f !== 'hours' && 'text-danger')}
            value={row[f]}
            aria-label={
              f === 'hours'
                ? `Часов на урок ${row.number}`
                : f === 'control'
                  ? `Часов на контрольные работы, урок ${row.number}`
                  : `Часов на практические работы, урок ${row.number}`
            }
            onChange={(e) =>
              handlers.patch(row.id, {
                [f]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
              })
            }
          />
        </td>
      ))}
      <td className={TD}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="дд.мм.гггг"
          className={cx(CELL, 'tabular text-center')}
          value={row.date}
          aria-label={`Дата изучения, урок ${row.number}`}
          onChange={(e) => handlers.patch(row.id, { date: e.target.value })}
        />
      </td>
      <td className={cx(TD, 'whitespace-nowrap text-center')}>
        <IconButton
          label="Переместить выше"
          disabled={first}
          onClick={() => handlers.move(row.id, -1)}
        >
          <ArrowUp size={14} />
        </IconButton>
        <IconButton
          label="Переместить ниже"
          disabled={last}
          onClick={() => handlers.move(row.id, 1)}
        >
          <ArrowDown size={14} />
        </IconButton>
        <IconButton label="Скопировать урок" onClick={() => handlers.copy(row.id)}>
          <Copy size={14} />
        </IconButton>
        <IconButton
          label="Удалить урок"
          className="hover:text-danger"
          onClick={() => handlers.remove(row.id)}
        >
          <Trash2 size={14} />
        </IconButton>
      </td>
    </tr>
  );
});
