/**
 * Передача урока из конструктора в технологическую карту.
 *
 * Учитель смотрит на строку поурочного плана и хочет карту именно к этому
 * уроку — значит и переход должен быть оттуда, из строки. Передаём через
 * параметры адреса, а не через localStorage (как сделано в связке с ФПУ):
 * там передавался СПИСОК учебников, который в адрес не влезает, а здесь это
 * четыре коротких значения. Заодно ссылку можно отправить коллеге.
 *
 * Слаг программы передаётся точным ключом каталога (`frpSlug`), а не названием
 * предмета: названия в разных документах совпадают не всегда, а ключ один.
 */

export interface TechCardHandoff {
  /** Ключ записи каталога ФРП; пусто — программа заполнялась руками. */
  frpSlug: string;
  grade: string | number;
  /** Тема урока из поурочного плана. */
  topic: string;
  /** Номер урока по КТП. */
  number: number;
}

/**
 * Адрес технологической карты с подставленными данными урока.
 *
 * База разрешается относительно текущей страницы, но только если страница
 * есть: функцию гоняет и проверка в node, где `window` не существует, а
 * второй аргумент `new URL` вычисляется даже при абсолютной базе.
 */
export function techCardUrl(h: TechCardHandoff, base = '../apps/tech-card/'): string {
  const here = typeof window === 'undefined' ? 'https://example.test/' : window.location.href;
  const url = new URL(base, here);
  if (h.frpSlug) url.searchParams.set('frp', h.frpSlug);
  const grade = Number(String(h.grade).match(/\d+/)?.[0]);
  if (Number.isInteger(grade) && grade >= 1 && grade <= 11) {
    url.searchParams.set('grade', String(grade));
  }
  if (h.topic.trim()) url.searchParams.set('topic', h.topic.trim().slice(0, 300));
  if (h.number > 0) url.searchParams.set('n', String(h.number));
  return url.href;
}

/** Читает переданный урок из адреса. Пустой результат — пришли напрямую. */
export function readTechCardHandoff(
  search = typeof window === 'undefined' ? '' : window.location.search,
): Partial<TechCardHandoff> {
  const q = new URLSearchParams(search);
  const grade = Number(q.get('grade'));
  const number = Number(q.get('n'));
  return {
    frpSlug: q.get('frp') ?? '',
    grade: Number.isInteger(grade) && grade >= 1 && grade <= 11 ? grade : 0,
    topic: (q.get('topic') ?? '').slice(0, 300),
    number: Number.isInteger(number) && number > 0 && number <= 300 ? number : 0,
  };
}
