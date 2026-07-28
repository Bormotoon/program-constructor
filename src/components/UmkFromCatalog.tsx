/**
 * Мост между рабочей программой и каталогом федерального перечня учебников.
 *
 * Раздел «УМК и обеспечение» — единственный, для которого ФРП не даёт готового
 * текста. Здесь два направления: уйти в каталог с уже выставленными фильтрами
 * по предмету и классу — и вернуться оттуда с отобранным списком.
 *
 * Пришедший список не вставляется молча: учитель видит, из чего он состоит, и
 * решает, заменить текст раздела или дописать в конец.
 */
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Check, ExternalLink, X } from 'lucide-react';
import type { FpuHandoff } from '../utils/fpuHandoff';
import { catalogUrl, clearHandoff, describeHandoff, readHandoff } from '../utils/fpuHandoff';

export default function UmkFromCatalog({
  subject,
  grade,
  current,
  onApply,
}: {
  subject: string;
  grade: string;
  current: string;
  onApply: (value: string) => void;
}) {
  const [pending, setPending] = useState<FpuHandoff | null>(null);
  const [done, setDone] = useState('');

  const check = useCallback(() => setPending(readHandoff()), []);

  useEffect(() => {
    check();
    /* Каталог обычно открыт в соседней вкладке: storage приходит оттуда,
       focus — когда учитель вернулся на эту. */
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'fpu-umk-handoff') check();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', check);
    };
  }, [check]);

  const accept = (mode: 'replace' | 'append') => {
    if (!pending) return;
    const next =
      mode === 'replace' || !current.trim()
        ? pending.text
        : `${current.trimEnd()}\n${pending.text}`;
    onApply(next);
    clearHandoff();
    setPending(null);
    setDone(
      `Список добавлен: ${pending.books.length} ${plural(pending.books.length)}. Проверьте текст ниже.`,
    );
    window.setTimeout(() => setDone(''), 6000);
  };

  const dismiss = () => {
    clearHandoff();
    setPending(null);
  };

  const href = catalogUrl(subject, grade);

  return (
    <div className="space-y-3">
      {pending && (
        <div className="rounded-lg border border-brand bg-brand-soft p-4" role="status">
          <div className="flex items-start gap-3">
            <BookOpen size={18} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Из перечня учебников пришёл список: {pending.books.length} {plural(pending.books.length)}
              </p>
              {describeHandoff(pending) && (
                <p className="mt-0.5 text-sm text-ink-subtle">{describeHandoff(pending)}</p>
              )}
              <ul className="mt-2 space-y-0.5 text-[13px] text-ink-muted">
                {pending.books.slice(0, 4).map((b) => (
                  <li key={b.id} className="truncate">
                    {b.title} — {b.authors}
                  </li>
                ))}
                {pending.books.length > 4 && (
                  <li className="text-ink-subtle">…и ещё {pending.books.length - 4}</li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => accept(current.trim() ? 'append' : 'replace')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
                >
                  <Check size={15} />
                  {current.trim() ? 'Добавить в конец' : 'Вставить'}
                </button>
                {current.trim() && (
                  <button
                    type="button"
                    onClick={() => accept('replace')}
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-sm"
                  >
                    Заменить текст
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  className="ml-auto inline-flex items-center gap-1 text-sm text-ink-subtle hover:text-ink"
                >
                  <X size={14} /> Не нужно
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {done && (
        <p className="rounded-lg border border-ok bg-ok-soft px-3 py-2 text-sm text-ok" role="status">
          {done}
        </p>
      )}

      {!pending && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sunken px-4 py-3">
          <BookOpen size={18} className="shrink-0 text-ink-subtle" />
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Учебники берутся из федерального перечня. Каталог откроется с фильтрами
            {subject ? ` по предмету «${subject}»` : ''}
            {grade ? `, ${grade} класс` : ''} — отметьте нужные и нажмите там «Передать в УМК рабочей программы».
          </p>
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand"
          >
            Подобрать в перечне
            <ExternalLink size={14} />
          </a>
        </div>
      )}
    </div>
  );
}

const plural = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 14) return 'учебников';
  const l = n % 10;
  if (l === 1) return 'учебник';
  if (l >= 2 && l <= 4) return 'учебника';
  return 'учебников';
};
