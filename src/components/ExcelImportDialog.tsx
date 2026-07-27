import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Upload, X } from 'lucide-react';
import type { PlanSection } from '../data/thematicPlan';
import {
  TARGET_COLUMNS,
  autoMapColumns,
  missingRequired,
  parseTable,
  rowsToSections,
  type ColumnMapping,
} from '../utils/tableImport';
import { Button, IconButton, Notice, cx } from './ui';

interface ExcelImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (sections: PlanSection[]) => void;
}

export function ExcelImportDialog({ isOpen, onClose, onImport }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
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
      const { headers: parsedHeaders, rows: parsedRows } = parseTable(
        evt.target?.result as ArrayBuffer,
      );
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      setMapping(autoMapColumns(parsedHeaders));
      setStep('map');
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const handleImport = () => {
    const missing = missingRequired(mapping);
    if (missing.length) {
      window.alert(
        `Укажите соответствие для обязательных полей: ${missing.map((c) => c.label).join(', ')}`,
      );
      return;
    }

    const sections = rowsToSections(rows, mapping);
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
              {/* Молчаливый пустой список — худший исход: учитель видит диалог
                  без единого сопоставления и не понимает, файл не тот или
                  приложение сломалось. Поэтому случаи разведены. */}
              {missingRequired(mapping).length ? (
                <Notice tone="warn" icon={<AlertCircle size={15} />}>
                  В файле <strong>{file?.name}</strong> не удалось узнать колонки по заголовкам
                  {headers.length ? (
                    <>
                      {' '}
                      (нашлись такие: {headers.slice(0, 6).join(', ')}
                      {headers.length > 6 ? ', …' : ''})
                    </>
                  ) : (
                    ' — строка заголовков не найдена'
                  )}
                  . Укажите соответствие вручную: обязательны «Тема» и «Количество часов».
                </Notice>
              ) : (
                <Notice tone="ok" icon={<AlertCircle size={15} />}>
                  Колонки файла <strong>{file?.name}</strong> сопоставлены автоматически по
                  заголовкам. Проверьте соответствие и поправьте, если нужно.
                </Notice>
              )}

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
