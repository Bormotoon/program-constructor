/**
 * Рекламный блок РСЯ (ручная расстановка, площадка 18503127).
 *
 * Авторасстановку сняли 10.08.2026: она приняла колонку управления за сайдбар
 * статьи и задвинула «Заполнить из ФРП» за нижний край экрана. Теперь место
 * блока выбираем мы, и правило одно: реклама идёт туда, где листают, и никогда
 * туда, где нажимают. Раскладка — docs/ads_policy.md в репозитории портала.
 *
 * `yaContextCb` — очередь: вызов render() кладётся в неё сразу, а context.js
 * разбирает очередь, когда приедет (загрузчик в index.html отложен до первого
 * действия ради PageSpeed). Поэтому порядок «сначала div, потом render» здесь
 * соблюдается сам: коллбэк выполнится заведомо после монтирования.
 */
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    yaContextCb?: Array<() => void>;
    Ya?: { Context: { AdvManager: { render: (o: Record<string, unknown>) => void } } };
  }
}

export function AdUnit({ blockId, type }: { blockId: string; type?: 'feed' }) {
  const domId = `yandex_rtb_${blockId}`;
  // Один блок — один render(). Без этого StrictMode в разработке вызывает
  // эффект дважды, а РСЯ считает повторную отрисовку в тот же контейнер ошибкой.
  const rendered = useRef(false);

  useEffect(() => {
    if (rendered.current) return;
    rendered.current = true;
    window.yaContextCb = window.yaContextCb || [];
    window.yaContextCb.push(() => {
      window.Ya?.Context.AdvManager.render({
        blockId,
        renderTo: domId,
        ...(type ? { type } : {}),
      });
    });
  }, [blockId, domId, type]);

  return <div className="pb-ad" id={domId} />;
}
