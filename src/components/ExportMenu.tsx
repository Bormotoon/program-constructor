import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download, File, FileCode2, FileText, FileType2, Loader2 } from 'lucide-react';
import { Button, cx } from './ui';
import { SupportDialog, shouldAskForSupport } from './SupportDialog';
import type { ProgramData } from '../data/program';
import { recoverFromStaleBuild } from '../utils/staleBuild';

/**
 * Меню выгрузки программы.
 *
 * Форматов пять, и складывать их в пять кнопок подряд нельзя: панель и так
 * плотная, а на узком экране они вытеснят всё остальное. Поэтому основное
 * действие (DOCX — формат, в котором программу сдают) осталось кнопкой, а
 * остальные спрятаны под стрелкой рядом.
 *
 * Все библиотеки выгрузки грузятся по нажатию: docx весит 360 КБ, jsPDF со
 * встроенным шрифтом — ещё больше, и в стартовом бандле им делать нечего.
 * Поэтому у пунктов есть состояние загрузки: между нажатием и появлением
 * файла проходит заметное время, и без отклика кажется, что кнопка не сработала.
 */

type Format = 'docx' | 'odt' | 'pdf' | 'txt' | 'md';

const FORMATS: { id: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { id: 'docx', label: 'DOCX', hint: 'Word — формат сдачи программы', icon: FileType2 },
  { id: 'odt', label: 'ODT', hint: 'LibreOffice, Р7-Офис, МойОфис', icon: FileType2 },
  { id: 'pdf', label: 'PDF', hint: 'для печати и отправки без правок', icon: FileText },
  { id: 'txt', label: 'TXT', hint: 'простой текст без оформления', icon: File },
  { id: 'md', label: 'Markdown', hint: 'для вики и репозиториев', icon: FileCode2 },
];

async function run(format: Format, data: ProgramData): Promise<void> {
  switch (format) {
    case 'docx': {
      const m = await import('../utils/docxExport');
      await m.exportToDocx(data);
      return;
    }
    case 'odt': {
      const m = await import('../utils/odtExport');
      m.exportToOdt(data);
      return;
    }
    case 'pdf': {
      const m = await import('../utils/pdfExport');
      m.exportToPdf(data);
      return;
    }
    case 'txt': {
      const m = await import('../utils/textExport');
      m.exportToText(data);
      return;
    }
    case 'md': {
      const m = await import('../utils/textExport');
      m.exportToMarkdown(data);
      return;
    }
  }
}

export function ExportMenu({ data, size = 'md' }: { data: ProgramData; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [support, setSupport] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Меню закрывается по клику вне и по Escape — иначе оно остаётся висеть
  // поверх формы и перекрывает поля.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const start = async (format: Format) => {
    setOpen(false);
    setFailed(null);
    setBusy(format);
    try {
      await run(format, data);
      // Просьба о поддержке — только после удачной выгрузки и с паузой:
      // вместе с полосой загрузки браузера окно выглядело бы помехой, а не
      // благодарностью. Показывается один раз за всё время (см. SupportDialog).
      if (shouldAskForSupport()) window.setTimeout(() => setSupport(true), 900);
    } catch (e) {
      // Чанк мог исчезнуть с сервера после выката, пока вкладка была открыта:
      // тогда чиним свежей загрузкой, а не пугаем учителя ошибкой.
      if (recoverFromStaleBuild(e)) return;
      console.error(`Не удалось выгрузить ${format}:`, e);
      setFailed(FORMATS.find((f) => f.id === format)?.label ?? format);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={wrap} className="relative inline-flex">
      <Button
        size={size}
        variant="primary"
        className="rounded-r-none"
        disabled={busy !== null}
        onClick={() => void start('docx')}
      >
        {busy === 'docx' ? (
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Download size={15} />
        )}
        Скачать DOCX
      </Button>
      <Button
        size={size}
        variant="primary"
        className="rounded-l-none border-l border-white/25 px-2"
        aria-label="Другие форматы выгрузки"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy !== null}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={15} className={cx('transition-transform duration-150', open && 'rotate-180')} />
      </Button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          {FORMATS.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                role="menuitem"
                type="button"
                onClick={() => void start(f.id)}
                className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left hover:bg-sunken"
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-ink-muted" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-xs text-ink-muted">{f.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Сообщение об ошибке объявляется вслух: выгрузка запускается с
          клавиатуры, и молча пропавший файл ничем не отличается от успеха. */}
      {failed && (
        <p role="alert" className="absolute right-0 top-full mt-1.5 w-72 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          Не удалось собрать {failed}. Подробности — в консоли браузера.
        </p>
      )}
      {busy && busy !== 'docx' && (
        <span role="status" className="sr-only">
          Идёт выгрузка {busy}
        </span>
      )}

      {support && <SupportDialog onClose={() => setSupport(false)} />}
    </div>
  );
}
