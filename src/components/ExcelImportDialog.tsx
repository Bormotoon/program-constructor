import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { newId, type PlanSection, type PlanTopic } from '../data/thematicPlan';
import { Button, IconButton, Notice, cx } from './ui';

interface ExcelImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (sections: PlanSection[]) => void;
}

/**
 * Колонки целевой модели. Названия и синонимы подобраны под то, как школы
 * реально называют столбцы в своих КТП, — точного совпадения заголовков
 * не требуется, соответствие всегда можно поправить вручную.
 */
const TARGET_COLUMNS = [
  { key: 'section', label: 'Раздел', required: false, synonyms: ['раздел', 'модуль', 'блок'] },
  { key: 'num', label: '№ п/п', required: false, synonyms: ['№', 'номер', 'п/п'] },
  { key: 'name', label: 'Тема', required: true, synonyms: ['тема', 'наименование', 'урок'] },
  { key: 'hours', label: 'Количество часов', required: true, synonyms: ['час', 'кол-во', 'количество'] },
  { key: 'content', label: 'Программное содержание', required: false, synonyms: ['содержание', 'программное'] },
  { key: 'activity', label: 'Основные виды деятельности', required: false, synonyms: ['деятельност', 'виды работ', 'характеристика'] },
] as const;

type TargetKey = (typeof TARGET_COLUMNS)[number]['key'];

export function ExcelImportDialog({ isOpen, onClose, onImport }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'upload' | 'map'>('upload');
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      // readAsArrayBuffer вместо устаревшего readAsBinaryString: последний
      // ломается на файлах с многобайтовыми символами в ячейках.
      const wb = XLSX.read(evt.target?.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      // Шапкой считаем первую строку, где заполнено хотя бы две ячейки:
      // в школьных КТП над таблицей часто стоит заголовок в одну ячейку.
      let headerRowIndex = 0;
      for (let i = 0; i < grid.length; i += 1) {
        const filled = (grid[i] || []).filter((c) => String(c ?? '').trim()).length;
        if (filled >= 2) {
          headerRowIndex = i;
          break;
        }
      }

      const parsedHeaders = (grid[headerRowIndex] || [])
        .map((h) => String(h ?? '').trim())
        .filter(Boolean);
      const parsedRows = XLSX.utils.sheet_to_json(ws, {
        range: headerRowIndex,
      }) as Record<string, unknown>[];

      setHeaders(parsedHeaders);
      setRows(parsedRows);

      const auto: Record<string, string> = {};
      for (const col of TARGET_COLUMNS) {
        const exact = parsedHeaders.find((h) => h.toLowerCase() === col.label.toLowerCase());
        if (exact) {
          auto[col.key] = exact;
          continue;
        }
        const bySynonym = parsedHeaders.find((h) =>
          col.synonyms.some((s) => h.toLowerCase().includes(s)),
        );
        if (bySynonym) auto[col.key] = bySynonym;
      }

      setMapping(auto);
      setStep('map');
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const handleImport = () => {
    const missing = TARGET_COLUMNS.filter((c) => c.required && !mapping[c.key]);
    if (missing.length) {
      window.alert(
        `Укажите соответствие для обязательных полей: ${missing.map((c) => c.label).join(', ')}`,
      );
      return;
    }

    const get = (row: Record<string, unknown>, key: TargetKey): string => {
      const header = mapping[key];
      return header ? String(row[header] ?? '').trim() : '';
    };

    // Строки группируются в разделы по колонке «Раздел». Если её не указали,
    // весь импорт попадает в один безымянный раздел — так же ведёт себя
    // таблица, набранная вручную.
    const sections: PlanSection[] = [];
    let current: PlanSection | null = null;

    for (const row of rows) {
      const name = get(row, 'name');
      if (!name) continue;

      const sectionName = get(row, 'section');
      if (!current || (sectionName && sectionName !== current.name)) {
        current = { id: newId('s'), name: sectionName, topics: [] };
        sections.push(current);
      }

      const hours = Number.parseInt(get(row, 'hours'), 10);
      const topic: PlanTopic = {
        id: newId('t'),
        num: get(row, 'num'),
        name,
        hours: Number.isFinite(hours) && hours >= 0 ? hours : 0,
        content: get(row, 'content'),
        activity: get(row, 'activity'),
      };
      current.topics.push(topic);
    }

    if (!sections.length) {
      window.alert('В файле не найдено ни одной строки с заполненной темой.');
      return;
    }

    onImport(sections);
    reset();
  };

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setStep('upload');
    onClose();
  };

  // Диалог закрывается по Escape и возвращает фокус — иначе с клавиатуры
  // из него не выбраться.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reset();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-dialog-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="excel-dialog-title" className="text-base font-semibold">
            Импорт планирования из Excel
          </h2>
          <IconButton label="Закрыть" onClick={reset}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 'upload' ? (
            <label className="relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong px-6 py-14 text-center transition-colors duration-150 hover:border-brand hover:bg-brand-soft/40">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Upload size={22} />
              </span>
              <span className="text-sm font-medium text-ink">
                Выберите файл или перетащите его сюда
              </span>
              <span className="text-xs text-ink-subtle">
                Форматы .xlsx, .xls, .csv. Читается первый лист книги.
              </span>
            </label>
          ) : (
            <div className="space-y-5">
              <Notice tone="ok" icon={<AlertCircle size={15} />}>
                Колонки файла <strong>{file?.name}</strong> сопоставлены автоматически по
                заголовкам. Проверьте соответствие и поправьте, если нужно.
              </Notice>

              <div className="space-y-3">
                {TARGET_COLUMNS.map((col) => (
                  <div
                    key={col.key}
                    className="grid items-center gap-3 rounded-lg border border-line bg-sunken/50 p-3 sm:grid-cols-[1fr_auto_1fr]"
                  >
                    <span className="text-sm font-medium text-ink">
                      {col.label}
                      {col.required && (
                        <span className="ml-1 text-danger" aria-hidden="true">
                          *
                        </span>
                      )}
                    </span>
                    <ArrowRight size={16} className="hidden text-ink-subtle sm:block" />
                    <select
                      aria-label={`Колонка файла для поля «${col.label}»`}
                      value={mapping[col.key] || ''}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [col.key]: e.target.value }))
                      }
                      className={cx(
                        'h-9 w-full cursor-pointer rounded-lg border bg-surface px-2 text-sm text-ink',
                        'transition-colors duration-150 focus:border-brand',
                        col.required && !mapping[col.key]
                          ? 'border-danger'
                          : 'border-line-strong hover:border-ink-subtle',
                      )}
                    >
                      <option value="">— не выбрано —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-xs text-ink-subtle">Найдено строк в файле: {rows.length}</p>
            </div>
          )}
        </div>

        {step === 'map' && (
          <footer className="flex justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-4">
            <Button onClick={() => setStep('upload')}>Назад</Button>
            <Button variant="primary" onClick={handleImport}>
              <Check size={15} /> Импортировать
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}
