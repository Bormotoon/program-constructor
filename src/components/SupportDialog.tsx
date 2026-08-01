import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Copy, Heart, X } from 'lucide-react';
import { Button, IconButton } from './ui';

/**
 * Просьба о поддержке — один раз за всё время, после первой удачной выгрузки.
 *
 * Правила, из которых собрано окно (они же объясняют, почему оно такое тихое):
 *
 *  • приходит ПОСЛЕ файла, а не вместо него. Ничего не заперто: учитель уже
 *    получил документ, и окно можно просто закрыть;
 *  • ровно один показ, отметка живёт в `localStorage`. Об этом прямо написано
 *    в самом окне — «больше не побеспокоим» снимает половину раздражения;
 *  • ключ общий с каталогом ФПУ: инструменты раздаются с одного домена, и
 *    учителю всё равно, в котором из них он оказался первым.
 *
 * ponytail: без A/B, счётчиков нажатий и «напомнить позже» — потолок ровно
 * такой, как просили. Захочется мерить отклик — цель Метрики на нажатие
 * ссылки, а не новая машинерия здесь.
 */

const ASKED_KEY = 'pedobraz-support-asked';
const PHONE = '+79998081989';
const PHONE_HUMAN = '+7 999 808-19-89';
const LINK = 'https://dalink.to/bormotoon';

/**
 * Спрашивать ли о поддержке. Отметка ставится сразу при ответе «да», а не при
 * закрытии окна: перезагрузка страницы в момент показа не должна возвращать
 * просьбу заново.
 *
 * В приватном режиме `localStorage` недоступен — тогда молчим совсем:
 * «один раз» там не запомнить, а спрашивать при каждой выгрузке гораздо хуже,
 * чем не спросить ни разу.
 */
export function shouldAskForSupport(): boolean {
  try {
    if (localStorage.getItem(ASKED_KEY)) return false;
    localStorage.setItem(ASKED_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function SupportDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PHONE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер может быть закрыт политикой браузера. Тупика нет: номер рядом,
      // выделяется одним щелчком целиком (select-all).
    }
  };

  // Портал в <body>: кнопка выгрузки живёт в `sticky`-шапке с `backdrop-blur`,
  // а filter/backdrop-filter на предке создаёт containing block для
  // `position: fixed` — без портала окно ужималось бы в высоту шапки вместо
  // всего экрана (проверено скриншотом, не выдумано заранее).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="pb-rise w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-xl focus-visible:outline-none"
      >
        <div className="flex items-start gap-3 border-b border-line bg-brand-soft px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
            <Heart size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="support-title" className="text-base font-semibold text-ink">
              Файл готов
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">Спасибо, что пользуетесь конструктором.</p>
          </div>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            Конструктор бесплатный и таким останется: без регистрации, рекламы и подписок.
            Делает и обновляет его один человек — по вечерам и без бюджета. Если он сэкономил
            вам вечер, это можно поддержать.
          </p>

          <div className="rounded-lg border border-line bg-sunken px-3.5 py-3">
            <p className="text-xs text-ink-subtle">Перевод по СБП · Сбербанк</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="tabular min-w-0 flex-1 font-medium text-ink select-all">{PHONE_HUMAN}</span>
              <Button size="sm" onClick={() => void copy()}>
                {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                {copied ? 'Скопирован' : 'Копировать'}
              </Button>
            </div>
          </div>

          <a
            href={LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-soft px-3.5 py-3 transition-colors duration-150 hover:border-brand"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-subtle">Картой или другим способом</span>
              <span className="mt-0.5 block font-medium text-brand">dalink.to/bormotoon</span>
            </span>
            <ArrowUpRight size={16} className="shrink-0 text-brand" />
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <p className="text-xs text-ink-subtle">Показываем один раз — больше не побеспокоим.</p>
          <Button size="sm" onClick={onClose}>
            Спасибо, закрыть
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
