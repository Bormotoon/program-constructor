import { useMemo, useState } from 'react';
import { CalendarDays, Download, FileText } from 'lucide-react';
import { Button, Card, Field, Notice, Select, TextArea, TextInput } from '../components/ui';
import { SCHOOL_YEARS, formatRu } from '../data/schoolYear';
import {
  defaultSchedule,
  holidaysTable,
  nonTeachingTable,
  periodsTable,
  scheduleDocxBlob,
  scheduleFileName,
  scheduleTitle,
  yearOf,
  yearTable,
  type ScheduleData,
} from './scheduleDoc';
import type { KitTable } from '../utils/docxKit';

/** Предпросмотр таблицы документа — та же структура, что уходит в DOCX. */
function PreviewTable({ title, data }: { title: string; data: KitTable }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {data.head.map((h) => (
                <th
                  key={h}
                  className="border border-line bg-sunken px-2 py-1.5 text-left font-semibold text-ink-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td
                    key={j}
                    className={
                      'border border-line px-2 py-1 '
                      + (c.align === 'center' ? 'text-center tabular ' : '')
                      + (c.bold ? 'font-semibold ' : '')
                    }
                  >
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ScheduleApp() {
  const [data, setData] = useState<ScheduleData>(defaultSchedule);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ScheduleData>(key: K, value: ScheduleData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const year = yearOf(data);
  const tables = useMemo(
    () => ({
      years: yearTable(data),
      periods: periodsTable(data),
      holidays: holidaysTable(data),
      nonTeaching: nonTeachingTable(data),
    }),
    [data],
  );

  const download = async () => {
    setBusy(true);
    try {
      const blob = await scheduleDocxBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${scheduleFileName(data)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <CalendarDays size={18} />
          </span>
          <div className="mr-auto">
            <h1 className="text-base font-semibold text-ink">Календарный учебный график</h1>
            <p className="text-xs text-ink-subtle">
              Четверти, каникулы и учебные недели считаются сами — выгрузка в DOCX
            </p>
          </div>
          <Button variant="primary" onClick={download} disabled={busy}>
            <Download size={15} /> {busy ? 'Собираем…' : 'Скачать DOCX'}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">Реквизиты и режим</h2>

          <Field label="Образовательная организация">
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={data.schoolName}
                placeholder="МБОУ «Средняя школа № 1»"
                onChange={(e) => set('schoolName', e.target.value)}
              />
            )}
          </Field>

          <Field label="Населённый пункт">
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={data.locality}
                placeholder="г. Красноярск"
                onChange={(e) => set('locality', e.target.value)}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Приказ №">
              {(id) => (
                <TextInput
                  id={id}
                  value={data.orderNumber}
                  placeholder="127"
                  onChange={(e) => set('orderNumber', e.target.value)}
                />
              )}
            </Field>
            <Field label="от">
              {(id) => (
                <TextInput
                  id={id}
                  value={data.orderDate}
                  inputMode="numeric"
                  placeholder="28.08.2026"
                  onChange={(e) => set('orderDate', e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Учебный год">
            {(id) => (
              <Select id={id} value={data.yearId} onChange={(e) => set('yearId', e.target.value)}>
                {SCHOOL_YEARS.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Учебная неделя">
              {(id) => (
                <Select
                  id={id}
                  value={String(data.weekDays)}
                  onChange={(e) => set('weekDays', Number(e.target.value) === 6 ? 6 : 5)}
                >
                  <option value="5">5 дней</option>
                  <option value="6">6 дней</option>
                </Select>
              )}
            </Field>
            <Field label="Смен">
              {(id) => (
                <Select
                  id={id}
                  value={String(data.shifts)}
                  onChange={(e) => set('shifts', Number(e.target.value) === 2 ? 2 : 1)}
                >
                  <option value="1">одна</option>
                  <option value="2">две</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Урок, минут">
              {(id) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={String(data.lessonMinutes)}
                  onChange={(e) =>
                    set('lessonMinutes', Math.max(20, Math.min(45, Number(e.target.value) || 40)))
                  }
                />
              )}
            </Field>
            <Field
              label="Последний учебный день"
              hint={`не ранее ${formatRu(year.endNotEarlierThan)}`}
            >
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  value={data.lastDay}
                  placeholder={formatRu(year.endNotEarlierThan)}
                  onChange={(e) => set('lastDay', e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Промежуточная аттестация">
            {(id) => (
              <TextArea
                id={id}
                rows={5}
                value={data.attestation}
                onChange={(e) => set('attestation', e.target.value)}
              />
            )}
          </Field>
        </Card>

        <div className="space-y-5">
          <Notice tone="brand" icon={<FileText size={15} />}>
            Сроки каникул подставлены по рекомендациям: {year.source}. Календарный учебный график
            школа утверждает своим приказом — при расхождении правьте даты в готовом документе.
            Поддержаны четверти; триместровым школам внутренние каникулы устанавливает сама школа,
            и в рекомендациях их нет.
          </Notice>

          <Card className="space-y-5 p-4">
            <h2 className="text-sm font-semibold text-ink">{scheduleTitle(data)}</h2>
            <PreviewTable title="1. Продолжительность учебного года" data={tables.years} />
            <PreviewTable title="2. Учебные периоды" data={tables.periods} />
            <PreviewTable title="3. Каникулы" data={tables.holidays} />
            <PreviewTable
              title="4. Нерабочие праздничные дни в учебном году"
              data={tables.nonTeaching}
            />
            <section className="space-y-1 text-xs text-ink-muted">
              <h3 className="text-sm font-semibold text-ink">5. Режим работы</h3>
              <p>Продолжительность учебной недели: {data.weekDays} дней.</p>
              <p>Сменность занятий: {data.shifts === 1 ? 'одна смена' : 'две смены'}.</p>
              <p>Продолжительность урока: {data.lessonMinutes} минут.</p>
            </section>
          </Card>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-subtle">
        Документ собирается в браузере: введённые данные никуда не отправляются.
      </footer>
    </div>
  );
}
