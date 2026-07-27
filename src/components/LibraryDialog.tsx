import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Info,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button, IconButton, Notice, TextInput, cx } from './ui';
import type { LibraryEntry } from '../data/library';

/**
 * Список программ, сохранённых в этом браузере.
 *
 * Заменяет собой единственный слот хранилища: у учителя обычно несколько
 * программ — свой предмет в разных классах, иногда два предмета. Здесь их
 * видно списком, между ними можно переключаться, а перенести на другой
 * компьютер или отдать коллеге — файлом.
 *
 * Ни регистрации, ни отправки данных: всё лежит в этом браузере, и об этом
 * сказано прямо в диалоге — иначе учитель резонно не поймёт, где его работа
 * и что будет, если почистить историю.
 */

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function LibraryDialog({
  entries,
  currentId,
  used,
  onOpen,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onExportOne,
  onImportOne,
  onExportAll,
  onImportAll,
  onClose,
}: {
  entries: LibraryEntry[];
  currentId: string;
  used: number;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onExportOne: (id: string) => void;
  onImportOne: (file: File) => void;
  onExportAll: () => void;
  onImportAll: (file: File) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const oneInput = useRef<HTMLInputElement>(null);
  const allInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startRename = (entry: LibraryEntry) => {
    setEditing(entry.id);
    setDraft(entry.title);
  };

  const commitRename = () => {
    if (editing) onRename(editing, draft);
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        className="w-full max-w-3xl rounded-xl border border-line bg-surface shadow-xl focus-visible:outline-none"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <FolderOpen size={18} className="shrink-0 text-brand" />
          <h2 id="library-title" className="flex-1 text-base font-semibold">
            Мои программы
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              Пока ни одной сохранённой программы.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((entry) => {
                const active = entry.id === currentId;
                return (
                  <li
                    key={entry.id}
                    className={cx(
                      'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5',
                      active ? 'border-brand bg-brand-soft' : 'border-line',
                    )}
                  >
                    {editing === entry.id ? (
                      <TextInput
                        aria-label="Название программы"
                        className="min-w-0 flex-1"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpen(entry.id)}
                        disabled={active}
                        className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-default"
                      >
                        <span className="block truncate text-sm font-medium">{entry.title}</span>
                        <span className="block text-xs text-ink-muted">
                          {[
                            entry.level,
                            formatDate(entry.updatedAt),
                            formatSize(entry.size),
                            active ? 'открыта' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    )}

                    <span className="flex shrink-0 gap-0.5">
                      <IconButton label={`Переименовать «${entry.title}»`} onClick={() => startRename(entry)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton label={`Дублировать «${entry.title}»`} onClick={() => onDuplicate(entry.id)}>
                        <Copy size={15} />
                      </IconButton>
                      <IconButton label={`Сохранить «${entry.title}» в файл`} onClick={() => onExportOne(entry.id)}>
                        <Download size={15} />
                      </IconButton>
                      <IconButton
                        label={`Удалить «${entry.title}»`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Удалить «${entry.title}»?\n\nЭто нельзя отменить. ` +
                                'Если программа ещё нужна, сначала сохраните её в файл.',
                            )
                          ) {
                            onDelete(entry.id);
                          }
                        }}
                      >
                        <Trash2 size={15} className="text-danger" />
                      </IconButton>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onCreate}>
              <Plus size={15} /> Новая программа
            </Button>
            <Button size="sm" onClick={() => oneInput.current?.click()}>
              <FileUp size={15} /> Загрузить программу
            </Button>
            <span className="ml-auto flex gap-2">
              <Button size="sm" onClick={onExportAll} disabled={!entries.length}>
                <Download size={15} /> Резервная копия
              </Button>
              <Button size="sm" onClick={() => allInput.current?.click()}>
                <Upload size={15} /> Восстановить
              </Button>
            </span>
          </div>

          <Notice tone="brand" icon={<Info size={15} />}>
            Программы хранятся только в этом браузере: ни регистрации, ни сервера — никуда они
            не отправляются. Очистка истории браузера или режим инкогнито их сотрут, поэтому
            важное держите резервной копией: она переносит все программы на другой компьютер
            одним файлом.
            {used > 0 && <> Сейчас занято {formatSize(used)}.</>}
          </Notice>
        </div>

        <input
          ref={oneInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportOne(f);
            e.target.value = '';
          }}
        />
        <input
          ref={allInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportAll(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
