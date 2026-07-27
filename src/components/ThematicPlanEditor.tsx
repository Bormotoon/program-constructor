import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, TriangleAlert } from 'lucide-react';
import {
  addSection,
  addTopic,
  duplicateTopic,
  moveTopic,
  planHours,
  removeSection,
  removeTopic,
  sectionHours,
  updateSection,
  updateTopic,
  validatePlan,
  type PlanSection,
} from '../data/thematicPlan';
import { Button, IconButton, Notice, cx } from './ui';

/**
 * Колонки, которые можно скрыть.
 *
 * В оригинальном конструкторе часть колонок отключается, но обязательные
 * скрыть нельзя — их просто нет в списке. Здесь так же: наименование и часы
 * не отключаются, потому что без них таблица перестаёт быть планом.
 */
const OPTIONAL_COLUMNS = [
  { key: 'num', label: '№' },
  { key: 'content', label: 'Программное содержание' },
  { key: 'activity', label: 'Виды деятельности' },
] as const;

type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]['key'];

interface Props {
  sections: PlanSection[];
  onChange: (sections: PlanSection[]) => void;
  /** Часы по ФРП для выбранного класса; null — предмет вне каталога. */
  expectedHours: number | null;
  /** Модульный предмет: превышение нормы — не ошибка, а повод отобрать модули. */
  modular?: boolean;
  grade: string;
}

const TH = 'border border-line px-2 py-2 text-left text-xs font-semibold text-ink-muted';
const TD = 'border border-line px-1.5 py-1 align-top';
const CELL =
  'w-full rounded bg-transparent px-1.5 py-1 text-sm text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand)] ' +
  'transition-colors duration-150 hover:bg-sunken focus:bg-brand-soft';

export function ThematicPlanEditor({
  sections,
  onChange,
  expectedHours,
  modular,
  grade,
}: Props) {
  const [hidden, setHidden] = useState<Set<OptionalColumn>>(new Set());

  const issues = useMemo(
    () => validatePlan(sections, expectedHours, modular),
    [sections, expectedHours, modular],
  );
  const total = planHours(sections);
  const hoursOff =
    expectedHours != null && total !== expectedHours && !(modular && total > expectedHours);

  const visible = (key: OptionalColumn) => !hidden.has(key);
  const toggle = (key: OptionalColumn) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Колонки: [№?] [наименование] [часы] [содержание?] [деятельность?] [действия].
  // Строки «Итого» подписывают всё слева от часов и оставляют пустым всё справа,
  // поэтому спаны считаются от видимости колонок, а не от их общего числа.
  const leftSpan = (visible('num') ? 1 : 0) + 1;
  const rightSpan = (visible('content') ? 1 : 0) + (visible('activity') ? 1 : 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-xs font-medium text-ink-subtle">Колонки:</span>
        {OPTIONAL_COLUMNS.map((c) => (
          <label
            key={c.key}
            className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted select-none"
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-[var(--color-brand)]"
              checked={visible(c.key)}
              onChange={() => toggle(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>

      {issues.length > 0 && (
        <div role="status" aria-live="polite" className="space-y-2">
          {issues.map((iss, i) => (
            <Notice key={i} tone={iss.level === 'error' ? 'danger' : 'warn'} icon={<TriangleAlert size={15} />}>
              {iss.message}
            </Notice>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Тематическое планирование{grade ? `, ${grade} класс` : ''}
          </caption>
          <thead className="bg-sunken">
            <tr>
              {visible('num') && <th className={cx(TH, 'w-12 text-center')}>№</th>}
              <th className={cx(TH, 'min-w-52')}>Наименование разделов и тем</th>
              <th className={cx(TH, 'w-20 text-center')}>Часов</th>
              {visible('content') && <th className={cx(TH, 'min-w-64')}>Программное содержание</th>}
              {visible('activity') && (
                <th className={cx(TH, 'min-w-64')}>Основные виды деятельности обучающихся</th>
              )}
              <th className={cx(TH, 'w-[7.5rem] text-center')}>Действия</th>
            </tr>
          </thead>

          <tbody>
            {sections.map((section) => (
              <Fragment key={section.id}>
                <tr className="bg-sunken/70">
                  <td className={TD} colSpan={leftSpan + 1 + rightSpan - 1}>
                    <input
                      className={cx(CELL, 'font-semibold')}
                      value={section.name}
                      placeholder="Наименование раздела"
                      aria-label="Наименование раздела"
                      onChange={(e) =>
                        onChange(updateSection(sections, section.id, { name: e.target.value }))
                      }
                    />
                  </td>
                  <td className={cx(TD, 'text-center')}>
                    <IconButton
                      label={`Удалить раздел «${section.name || 'без названия'}»`}
                      className="hover:text-danger"
                      onClick={() => onChange(removeSection(sections, section.id))}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </td>
                </tr>

                {section.topics.map((topic, i) => (
                  <tr key={topic.id} className="group">
                    {visible('num') && (
                      <td className={TD}>
                        <input
                          className={cx(CELL, 'tabular text-center')}
                          value={topic.num}
                          aria-label={`Номер темы ${i + 1}`}
                          onChange={(e) =>
                            onChange(
                              updateTopic(sections, section.id, topic.id, { num: e.target.value }),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className={TD}>
                      <textarea
                        rows={2}
                        className={cx(CELL, 'resize-y')}
                        value={topic.name}
                        aria-label={`Наименование темы ${i + 1}`}
                        onChange={(e) =>
                          onChange(
                            updateTopic(sections, section.id, topic.id, { name: e.target.value }),
                          )
                        }
                      />
                    </td>
                    <td className={TD}>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        className={cx(CELL, 'text-center')}
                        value={topic.hours}
                        aria-label={`Часов по теме ${i + 1}`}
                        onChange={(e) =>
                          onChange(
                            updateTopic(sections, section.id, topic.id, {
                              hours: Math.max(0, Math.min(1000, Number(e.target.value) || 0)),
                            }),
                          )
                        }
                      />
                    </td>
                    {visible('content') && (
                      <td className={TD}>
                        <textarea
                          rows={3}
                          className={cx(CELL, 'resize-y text-[13px] leading-snug')}
                          value={topic.content}
                          aria-label={`Программное содержание темы ${i + 1}`}
                          onChange={(e) =>
                            onChange(
                              updateTopic(sections, section.id, topic.id, {
                                content: e.target.value,
                              }),
                            )
                          }
                        />
                      </td>
                    )}
                    {visible('activity') && (
                      <td className={TD}>
                        <textarea
                          rows={3}
                          className={cx(CELL, 'resize-y text-[13px] leading-snug')}
                          value={topic.activity}
                          aria-label={`Виды деятельности по теме ${i + 1}`}
                          onChange={(e) =>
                            onChange(
                              updateTopic(sections, section.id, topic.id, {
                                activity: e.target.value,
                              }),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className={cx(TD, 'whitespace-nowrap text-center')}>
                      <IconButton
                        label="Переместить выше"
                        disabled={i === 0}
                        onClick={() => onChange(moveTopic(sections, section.id, topic.id, -1))}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        label="Переместить ниже"
                        disabled={i === section.topics.length - 1}
                        onClick={() => onChange(moveTopic(sections, section.id, topic.id, 1))}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton
                        label="Скопировать строку"
                        onClick={() => onChange(duplicateTopic(sections, section.id, topic.id))}
                      >
                        <Copy size={14} />
                      </IconButton>
                      <IconButton
                        label="Удалить строку"
                        className="hover:text-danger"
                        onClick={() => onChange(removeTopic(sections, section.id, topic.id))}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}

                <tr className="bg-sunken/40 text-sm">
                  <td className={cx(TD, 'py-2 font-medium')} colSpan={leftSpan}>
                    Итого по разделу
                  </td>
                  <td className={cx(TD, 'tabular py-2 text-center font-semibold')}>
                    {sectionHours(section)}
                  </td>
                  <td className={cx(TD, 'py-2')} colSpan={rightSpan}>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-brand transition-colors duration-150 hover:bg-brand-soft"
                      onClick={() => onChange(addTopic(sections, section.id))}
                    >
                      <Plus size={13} /> Добавить тему
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}

            <tr className={cx('text-sm font-semibold', hoursOff ? 'bg-danger-soft' : 'bg-ok-soft')}>
              <td className={cx(TD, 'py-2.5')} colSpan={leftSpan}>
                ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ{grade ? ` · ${grade} класс` : ''}
              </td>
              <td
                className={cx(
                  TD,
                  'tabular py-2.5 text-center',
                  hoursOff ? 'text-danger' : 'text-ok',
                )}
              >
                {total}
              </td>
              <td className={cx(TD, 'py-2.5 text-xs font-normal')} colSpan={rightSpan}>
                {expectedHours != null && (
                  <span className={hoursOff ? 'text-danger' : 'text-ink-muted'}>
                    норма ФРП: {expectedHours} ч
                    {hoursOff && ` · расхождение ${total > expectedHours ? '+' : '−'}${Math.abs(total - expectedHours)}`}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Button size="sm" onClick={() => onChange(addSection(sections))}>
        <Plus size={15} /> Добавить раздел
      </Button>
    </div>
  );
}
