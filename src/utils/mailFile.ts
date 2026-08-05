import type { ExportFile } from './programOutline';

/**
 * Мост к диалогу «отправить на почту».
 *
 * Сам диалог и отправка живут не здесь, а в плагине портала
 * (pedobraz-feedback/assets/pedobraz-deliver.js): письмо должен отправить
 * сервер, а конструктор — статика без сервера. Приложение только собирает
 * файл и передаёт его дальше.
 *
 * Тот же скрипт подключает и перечень учебников, поэтому формулировки письма и
 * форма адреса — одни на два приложения и правятся без их пересборки.
 */

declare global {
  interface Window {
    PBDeliver?: { open(options: { kind: string; blob: Blob; filename: string; onSent?: () => void }): void };
  }
}

/**
 * Есть ли вообще куда отправлять.
 *
 * На педобраз.рф скрипт плагина подключён тегом в index.html. При локальной
 * разработке и в браузерной проверке CI WordPress'а нет — тогда кнопки почты
 * просто не будет, вместо неработающей.
 */
export const mailAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.PBDeliver);

/** onSent зовётся только если письмо действительно ушло. */
export function mailFile(file: ExportFile, onSent?: () => void): void {
  window.PBDeliver?.open({ kind: 'program', blob: file.blob, filename: file.name, onSent });
}
