import { useEffect, useId, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { ChevronDown, Download, File, FileCode2, FileText, FileType2, Loader2, Mail } from 'lucide-react';
import { Button, cx } from './ui';
import { SupportDialog, shouldAskForSupport } from './SupportDialog';
import type { ProgramData } from '../data/program';
import type { ExportFile } from '../utils/programOutline';
import { recoverFromStaleBuild } from '../utils/staleBuild';
import { mailAvailable, mailFile } from '../utils/mailFile';

/**
 * Меню выгрузки программы.
 *
 * Форматов пять, и складывать их в пять кнопок подряд нельзя: панель и так
 * плотная, а на узком экране они вытеснят всё остальное. Поэтому основное
 * действие (DOCX — формат, в котором программу сдают) осталось кнопкой, а
 * остальные спрятаны под стрелкой рядом.
 *
 * Отправка на почту — отдельная видимая кнопка, а не пункт в глубине меню.
 * Спрятанный выход для посетителя не существует: ровно на этом уже обожглись
 * с передачей списка учебников в УМК, о которой пришло обращение «не могу
 * найти». Пункт «на почту» есть и у каждого формата в меню — но главный,
 * DOCX, доступен одним нажатием.
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

async function build(format: Format, data: ProgramData): Promise<ExportFile> {
  switch (format) {
    case 'docx': {
      const m = await import('../utils/docxExport');
      return m.docxFile(data);
    }
    case 'odt': {
      const m = await import('../utils/odtExport');
      return m.odtFile(data);
    }
    case 'pdf': {
      const m = await import('../utils/pdfExport');
      return m.pdfFile(data);
    }
    case 'txt': {
      const m = await import('../utils/textExport');
      return m.textFile(data);
    }
    case 'md': {
      const m = await import('../utils/textExport');
      return m.markdownFile(data);
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

  const start = async (format: Format, to: 'disk' | 'mail' = 'disk') => {
    setOpen(false);
    setFailed(null);
    setBusy(format);
    try {
      // Просьба о поддержке — только после удачной выгрузки и с паузой:
      // вместе с полосой загрузки браузера окно выглядело бы помехой, а не
      // благодарностью. Показывается один раз за всё время (см. SupportDialog).
      const thank = () => {
        if (shouldAskForSupport()) window.setTimeout(() => setSupport(true), 900);
      };

      const file = await build(format, data);
      if (to === 'mail') {
        // Для почты благодарность ждёт ответа сервера: окно с просьбой,
        // выехавшее поверх незаполненной формы адреса, — помеха, а не благодарность.
        mailFile(file, thank);
      } else {
        saveAs(file.blob, file.name);
        thank();
      }
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

      {mailAvailable() && (
        <Button
          size={size}
          variant="secondary"
          className="ml-2"
          disabled={busy !== null}
          onClick={() => void start('docx', 'mail')}
        >
          <Mail size={15} />
          На почту
        </Button>
      )}

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          {FORMATS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.id} className="flex items-stretch hover:bg-sunken">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => void start(f.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left"
                >
                  <Icon size={16} className="mt-0.5 shrink-0 text-ink-muted" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-ink-muted">{f.hint}</span>
                  </span>
                </button>
                {/* Почта у каждого формата: главную кнопку «на почту» рядом с
                    меню отправляет DOCX, а сдать иногда просят PDF. */}
                {mailAvailable() && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => void start(f.id, 'mail')}
                    aria-label={`Отправить ${f.label} на почту`}
                    title="Отправить на почту"
                    className="flex shrink-0 cursor-pointer items-center border-l border-line px-3 text-ink-muted hover:text-ink"
                  >
                    <Mail size={16} />
                  </button>
                )}
              </div>
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
