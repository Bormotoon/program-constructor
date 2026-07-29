/**
 * Спасение от «протухшей» вкладки.
 *
 * Имена чанков содержат хеш содержимого, а index.html хостинг отдаёт с
 * длинным max-age. Поэтому после выката у части посетителей в браузере
 * остаётся старый index.html, который просит чанки, уже удалённые с сервера:
 * приложение выглядит рабочим, но любая ленивая загрузка падает с 404.
 *
 * Чинится это только свежим index.html, а его браузер не запросит, пока не
 * истечёт кэш. Поэтому при провале динамического импорта мы один раз
 * перезагружаем страницу с меткой в адресе — она обходит кэш и приносит
 * актуальную сборку. Один раз: если и после этого не работает, дело не в
 * кэше, и зацикливаться нельзя.
 */

const RELOAD_MARK = 'fresh';
const RELOAD_FLAG = 'pc-stale-reload';

/** Похоже ли на «чанка больше нет на сервере», а не на «сеть отвалилась». */
export function isStaleChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * Попробовать вылечиться перезагрузкой. Возвращает true, если перезагрузка
 * запущена, — вызывающему коду тогда нет смысла показывать ошибку.
 */
export function recoverFromStaleBuild(e: unknown): boolean {
  if (!isStaleChunkError(e)) return false;

  // Уже пробовали в этой вкладке — значит, причина не в кэше.
  let tried = false;
  try {
    tried = sessionStorage.getItem(RELOAD_FLAG) === '1';
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* приватный режим: одна попытка всё равно лучше, чем ни одной */
  }
  if (tried) return false;

  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_MARK, String(Date.now()));
  window.location.replace(url.href);
  return true;
}

/** Убрать служебную метку из адреса, чтобы она не попадала в закладки. */
export function tidyReloadMark(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RELOAD_MARK)) return;
  url.searchParams.delete(RELOAD_MARK);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* не критично */
  }
}
