import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cx } from './ui';

interface Props {
  /** Идентификатор поля: по нему подпись из Field связывается с input. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  'aria-describedby'?: string;
}

/**
 * Поле образовательной организации с подсказками из OpenStreetMap.
 *
 * Подсказки — вспомогательный сервис: поле остаётся обычным текстовым, и при
 * отсутствии интернета (обычное дело в школьной сети) название вводится
 * руками. Сбой запроса намеренно не показывается как ошибка формы — он ничего
 * не ломает.
 */
export function SchoolCombobox({ id, value, onChange, ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Запрос откладывается на 500 мс: Nominatim просит обращаться не чаще раза
  // в секунду, а без задержки запрос уходил бы на каждое нажатие клавиши.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setOptions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          'https://nominatim.openstreetmap.org/search?' +
            new URLSearchParams({
              q: `школа ${q}`,
              countrycodes: 'ru',
              format: 'json',
              limit: '8',
              'accept-language': 'ru',
            }),
          { signal: controller.signal, headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return;
        const data: { display_name: string }[] = await res.json();
        const names = data.map((item) => {
          const parts = item.display_name.split(', ');
          return `${parts[0]} (${parts.slice(1, 3).join(', ')})`;
        });
        setOptions([...new Set(names)]);
        setActive(-1);
      } catch (error) {
        // Прерванный запрос — штатная ситуация при быстром вводе.
        if ((error as Error).name !== 'AbortError') {
          console.warn('Подсказки организаций недоступны:', error);
        }
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  // Список должен управляться с клавиатуры: стрелки, Enter, Escape.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !options.length) {
      if (e.key === 'ArrowDown' && options.length) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={wrapper} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          {...aria}
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="organization"
          value={value}
          placeholder="МБОУ «Средняя школа № 1»"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cx(
            'h-10 w-full rounded-lg border border-line-strong bg-surface pr-10 pl-9 text-sm text-ink',
            'transition-colors duration-150 placeholder:text-ink-subtle',
            'hover:border-ink-subtle focus:border-brand',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]',
          )}
        />
        {loading ? (
          <Loader2
            size={16}
            aria-label="Идёт поиск"
            className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-ink-subtle"
          />
        ) : (
          value && (
            <button
              type="button"
              aria-label="Очистить поле"
              onClick={() => {
                onChange('');
                setOptions([]);
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-ink-subtle transition-colors duration-150 hover:bg-sunken hover:text-ink"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>

      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Найденные организации"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {options.map((name, i) => (
            <li key={name} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(name)}
                className={cx(
                  'block w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors duration-150',
                  i === active ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-sunken',
                )}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
