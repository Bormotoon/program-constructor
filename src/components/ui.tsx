import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

/**
 * Примитивы интерфейса.
 *
 * Собраны в один модуль, чтобы состояния (наведение, фокус, отключено) и
 * размеры задавались в одном месте: в плотном табличном интерфейсе
 * разъезжающиеся отступы и разной толщины рамки заметны сразу.
 *
 * Цвета берутся из семантических токенов (--color-ink, --color-brand и т. д.),
 * а не из палитры Tailwind напрямую: так тёмная тема получается настройкой
 * токенов, а не переписыванием каждого класса.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- кнопки ---------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
  'transition-colors duration-150 cursor-pointer ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink-muted hover:bg-sunken hover:text-ink',
  danger: 'border border-danger/30 text-danger hover:bg-danger-soft',
};

// Высота 36/40px удерживает цель нажатия близко к 44px вместе с отступами.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    />
  );
}

/**
 * Кнопка-иконка. Значок мелкий, поэтому область нажатия расширена до 32px
 * и обязателен `label` — без него кнопка не читается скринридером.
 */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle',
        'transition-colors duration-150 cursor-pointer hover:bg-sunken hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

// --- поля ввода -----------------------------------------------------------

const CONTROL =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink ' +
  'transition-colors duration-150 placeholder:text-ink-subtle ' +
  'hover:border-ink-subtle focus:border-brand ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string, describedBy: string | undefined, required: boolean) => ReactNode;
}

/**
 * Обёртка поля: видимая подпись, подсказка и ошибка рядом с полем.
 * Подпись именно видимая, а не placeholder — placeholder исчезает при вводе,
 * и пользователь перестаёт понимать, что заполняет.
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      {/* Звёздочка вынесена ЗА пределы <label>: внутри она попадала в
          доступное имя поля («Предмет*»), и поле переставало находиться
          по своей подписи. Обязательность передаётся через aria-required. */}
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {required && (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {children(id, describedBy, required)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, 'h-10', className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(CONTROL, 'h-10 cursor-pointer', className)}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, 'py-2.5 leading-relaxed', className)} />;
}

// --- поверхности ----------------------------------------------------------

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx('rounded-xl border border-line bg-surface', className)}
    >
      {children}
    </div>
  );
}

type ToneName = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

const TONES: Record<ToneName, string> = {
  neutral: 'bg-sunken text-ink-muted',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  brand: 'bg-brand-soft text-brand',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: ToneName;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Замечания по данным. Значок дублирует смысл цвета — по одному лишь цвету
 * состояние определять нельзя.
 */
export function Notice({
  tone,
  icon,
  children,
}: {
  /** brand — пояснение, а не замечание: без тревожного цвета. */
  tone: Exclude<ToneName, 'neutral'>;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const border =
    tone === 'danger'
      ? 'border-danger/30'
      : tone === 'warn'
        ? 'border-warn/30'
        : tone === 'brand'
          ? 'border-line'
          : 'border-ok/30';
  const text =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'brand'
          ? 'text-ink-muted'
          : 'text-ok';
  const bg =
    tone === 'danger'
      ? 'bg-danger-soft'
      : tone === 'warn'
        ? 'bg-warn-soft'
        : tone === 'brand'
          ? 'bg-sunken'
          : 'bg-ok-soft';

  return (
    <div className={cx('flex items-start gap-2 rounded-lg border p-3 text-sm', border, bg, text)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 flex justify-center text-ink-subtle">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
