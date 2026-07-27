import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Граница ошибок.
 *
 * Без неё любое исключение при отрисовке оставляет пустой белый экран, и
 * учитель решает, что потерял всю программу. Данные при этом целы — они лежат
 * в localStorage, — поэтому экран ошибки прежде всего сообщает об этом и даёт
 * перезагрузить страницу, не трогая сохранённое.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Сбой интерфейса:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Интерфейс не смог отрисоваться. Данные программы сохранены в браузере и не
            потеряны — перезагрузите страницу, чтобы продолжить работу.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 cursor-pointer rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-hover"
            >
              Перезагрузить страницу
            </button>
            <button
              type="button"
              onClick={() => {
                // Крайняя мера: сброс предлагается отдельно и с подтверждением,
                // чтобы случайным нажатием нельзя было стереть работу.
                if (
                  window.confirm(
                    'Очистить сохранённую программу?\nЭто удалит все введённые данные без возможности восстановления.',
                  )
                ) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="h-10 cursor-pointer rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
            >
              Очистить данные и начать заново
            </button>
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer text-xs text-ink-subtle">
              Техническая информация
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-sunken p-3 text-xs whitespace-pre-wrap text-ink-muted">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
