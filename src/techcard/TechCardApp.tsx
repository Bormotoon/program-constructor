import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Wand2 } from 'lucide-react';
import {
  Button,
  Card,
  Field,
  IconButton,
  Notice,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../components/ui';
import {
  FRP_CATALOG,
  loadFrpPlan,
  type FrpCatalogEntry,
  type FrpLevel,
  type FrpPlan,
} from '../data/frp/catalog';
import { readTechCardHandoff } from '../utils/techCardHandoff';
import {
  LESSON_TYPES,
  defaultTechCard,
  fillFromFrp,
  techCardDocxBlob,
  techCardFileName,
  topicsForGrade,
  type FrpTopicChoice,
  type StageRow,
  type TechCardData,
} from './techCardDoc';

const LEVELS: { value: FrpLevel; label: string }[] = [
  { value: 'НОО', label: 'НОО — 1-4 классы' },
  { value: 'ООО', label: 'ООО — 5-9 классы' },
  { value: 'СОО', label: 'СОО — 10-11 классы' },
];

const CELL =
  'w-full rounded bg-transparent px-1.5 py-1 text-sm text-ink '
  + 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand)] '
  + 'transition-colors duration-150 hover:bg-sunken focus:bg-brand-soft';
const TD = 'border border-line px-1.5 py-1 align-top';

/**
 * Урок, переданный из конструктора рабочих программ. Читается ОДИН раз при
 * первом рендере: пользователь дальше меняет выбор сам, и повторное применение
 * параметров адреса затирало бы его правки.
 */
const handoff = readTechCardHandoff();
const handoffEntry = handoff.frpSlug
  ? FRP_CATALOG.find((e) => e.slug === handoff.frpSlug)
  : undefined;

export default function TechCardApp() {
  const [data, setData] = useState<TechCardData>(() => {
    const base = defaultTechCard();
    if (!handoff.topic && !handoff.number) return base;
    return {
      ...base,
      topic: handoff.topic ?? '',
      lessonNumber: handoff.number ?? 0,
      subject: handoffEntry?.subject ?? '',
      grade: Number(handoff.grade) || 0,
    };
  });
  const [level, setLevel] = useState<FrpLevel>(handoffEntry?.level ?? 'ООО');
  const [slug, setSlug] = useState(handoffEntry?.slug ?? '');
  const [grade, setGrade] = useState(Number(handoff.grade) || 0);
  const [plan, setPlan] = useState<FrpPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [topicIndex, setTopicIndex] = useState(-1);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof TechCardData>(key: K, value: TechCardData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const subjects = useMemo<FrpCatalogEntry[]>(
    () => FRP_CATALOG.filter((e) => e.level === level),
    [level],
  );
  const entry = subjects.find((e) => e.slug === slug) ?? null;

  /* Программа тянется лениво: каждый предмет — свой чанк на несколько сотен
     килобайт, и грузить их все сразу нельзя. */
  useEffect(() => {
    if (!slug) {
      setPlan(null);
      return;
    }
    let alive = true;
    setLoading(true);
    loadFrpPlan(slug)
      .then((p) => {
        if (alive) {
          setPlan(p);
          setTopicIndex(-1);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (entry && !entry.grades.includes(grade)) setGrade(entry.grades[0] ?? 0);
  }, [entry, grade]);

  const topics = useMemo<FrpTopicChoice[]>(
    () => (plan && grade ? topicsForGrade(plan, grade) : []),
    [plan, grade],
  );

  const applyFrp = () => {
    if (!plan || !grade || topicIndex < 0 || !topics[topicIndex]) return;
    setData((prev) => fillFromFrp(prev, plan, grade, topics[topicIndex]));
  };

  const patchStage = (id: string, patch: Partial<StageRow>) =>
    setData((prev) => ({
      ...prev,
      stages: prev.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const addStage = () =>
    setData((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          id: `s${Date.now()}`,
          name: '',
          minutes: 0,
          teacher: '',
          student: '',
          uud: '',
        },
      ],
    }));

  const removeStage = (id: string) =>
    setData((prev) => ({ ...prev, stages: prev.stages.filter((s) => s.id !== id) }));

  const minutes = data.stages.reduce((a, s) => a + (Number(s.minutes) || 0), 0);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await techCardDocxBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${techCardFileName(data)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="mr-auto">
            <h1 className="text-base font-semibold text-ink">Технологическая карта урока</h1>
            <p className="text-xs text-ink-subtle">
              Темы, содержание, виды деятельности и планируемые результаты — из федеральных
              рабочих программ
            </p>
          </div>
          <Button variant="primary" onClick={download} disabled={busy}>
            <Download size={15} /> {busy ? 'Собираем…' : 'Скачать DOCX'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">Заполнить из федеральной программы</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Уровень">
              {(id) => (
                <Select
                  id={id}
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value as FrpLevel);
                    setSlug('');
                  }}
                >
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Предмет">
              {(id) => (
                <Select id={id} value={slug} onChange={(e) => setSlug(e.target.value)}>
                  <option value="">— выберите —</option>
                  {subjects.map((e) => (
                    <option key={e.slug} value={e.slug}>
                      {e.subject}
                      {e.variant ? ` (${e.variant})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Класс">
              {(id) => (
                <Select
                  id={id}
                  value={String(grade)}
                  disabled={!entry}
                  onChange={(e) => setGrade(Number(e.target.value))}
                >
                  {(entry?.grades ?? []).map((g) => (
                    <option key={g} value={g}>
                      {g} класс
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Номер урока по КТП" hint="необязательно">
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  value={data.lessonNumber ? String(data.lessonNumber) : ''}
                  onChange={(e) =>
                    set('lessonNumber', Math.max(0, Math.min(300, Number(e.target.value) || 0)))
                  }
                />
              )}
            </Field>
          </div>

          <Field label="Тема из программы">
            {(id) => (
              <Select
                id={id}
                value={String(topicIndex)}
                disabled={!topics.length}
                onChange={(e) => setTopicIndex(Number(e.target.value))}
              >
                <option value="-1">
                  {loading
                    ? 'Загружаем программу…'
                    : topics.length
                      ? '— выберите тему —'
                      : 'выберите предмет и класс'}
                </option>
                {topics.map((t, i) => (
                  <option key={`${t.num}-${i}`} value={i}>
                    {t.num} · {t.name} ({t.hours} ч)
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={topicIndex < 0} onClick={applyFrp}>
              <Wand2 size={15} /> Заполнить из ФРП
            </Button>
            {topicIndex >= 0 && topics[topicIndex] ? (
              <span className="text-xs text-ink-subtle">
                раздел: {topics[topicIndex].section}
              </span>
            ) : null}
          </div>

          {handoff.topic ? (
            <Notice tone="ok">
              Урок пришёл из конструктора рабочих программ: тема и номер уже вписаны. Выберите
              тему программы из списка и нажмите «Заполнить из ФРП», чтобы подставить содержание,
              результаты и виды деятельности.
            </Notice>
          ) : null}

          <Notice tone="brand">
            Подставляются тема, основное содержание, планируемые результаты трёх видов и виды
            деятельности обучающихся — всё это в федеральной программе расписано дословно.
            Цель урока и деятельность учителя остаются пустыми намеренно: это авторская часть,
            и подставлять её было бы обманом.
          </Notice>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">Шапка карты</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Тема урока">
              {(id) => (
                <TextInput id={id} value={data.topic} onChange={(e) => set('topic', e.target.value)} />
              )}
            </Field>
            <Field label="Тип урока">
              {(id) => (
                <Select
                  id={id}
                  value={data.lessonType}
                  onChange={(e) => set('lessonType', e.target.value)}
                >
                  {LESSON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Цель урока">
            {(id) => (
              <TextArea id={id} rows={2} value={data.goal} onChange={(e) => set('goal', e.target.value)} />
            )}
          </Field>
          <Field label="Основное содержание">
            {(id) => (
              <TextArea
                id={id}
                rows={3}
                value={data.content}
                onChange={(e) => set('content', e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Предметные результаты">
              {(id) => (
                <TextArea
                  id={id}
                  rows={5}
                  value={data.resultsSubject}
                  onChange={(e) => set('resultsSubject', e.target.value)}
                />
              )}
            </Field>
            <Field label="Метапредметные">
              {(id) => (
                <TextArea
                  id={id}
                  rows={5}
                  value={data.resultsMeta}
                  onChange={(e) => set('resultsMeta', e.target.value)}
                />
              )}
            </Field>
            <Field label="Личностные">
              {(id) => (
                <TextArea
                  id={id}
                  rows={5}
                  value={data.resultsPersonal}
                  onChange={(e) => set('resultsPersonal', e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Формы работы">
              {(id) => (
                <TextInput id={id} value={data.forms} onChange={(e) => set('forms', e.target.value)} />
              )}
            </Field>
            <Field label="Оборудование и ресурсы">
              {(id) => (
                <TextInput
                  id={id}
                  value={data.equipment}
                  onChange={(e) => set('equipment', e.target.value)}
                />
              )}
            </Field>
            <Field label="Домашнее задание">
              {(id) => (
                <TextInput
                  id={id}
                  value={data.homework}
                  onChange={(e) => set('homework', e.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-semibold text-ink">Ход урока</h2>
            <span className={cx('tabular text-sm', minutes > 45 ? 'text-warn' : 'text-ink-muted')}>
              {minutes} минут
            </span>
            <Button size="sm" onClick={addStage}>
              <Plus size={15} /> Этап
            </Button>
          </div>
          {minutes > 45 && (
            <Notice tone="warn">
              Сумма времени этапов больше 45 минут — проверьте раскладку.
            </Notice>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  {['Этап урока', 'Мин.', 'Деятельность учителя', 'Деятельность обучающихся', 'Формируемые УУД', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="border border-line bg-sunken px-2 py-2 text-left text-xs font-semibold text-ink-muted"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr key={s.id}>
                    <td className={TD}>
                      <TextArea
                        rows={2}
                        className={cx(CELL, 'min-w-[130px]')}
                        aria-label="Название этапа"
                        value={s.name}
                        onChange={(e) => patchStage(s.id, { name: e.target.value })}
                      />
                    </td>
                    <td className={TD}>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Минуты, этап «${s.name}»`}
                        className={cx(CELL, 'tabular w-14 text-center')}
                        value={s.minutes ? String(s.minutes) : ''}
                        onChange={(e) =>
                          patchStage(s.id, {
                            minutes: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </td>
                    <td className={TD}>
                      <TextArea
                        rows={3}
                        className={cx(CELL, 'min-w-[200px]')}
                        aria-label={`Деятельность учителя, этап «${s.name}»`}
                        value={s.teacher}
                        onChange={(e) => patchStage(s.id, { teacher: e.target.value })}
                      />
                    </td>
                    <td className={TD}>
                      <TextArea
                        rows={3}
                        className={cx(CELL, 'min-w-[240px]')}
                        aria-label={`Деятельность обучающихся, этап «${s.name}»`}
                        value={s.student}
                        onChange={(e) => patchStage(s.id, { student: e.target.value })}
                      />
                    </td>
                    <td className={TD}>
                      <TextArea
                        rows={3}
                        className={cx(CELL, 'min-w-[160px]')}
                        aria-label={`Формируемые УУД, этап «${s.name}»`}
                        value={s.uud}
                        onChange={(e) => patchStage(s.id, { uud: e.target.value })}
                      />
                    </td>
                    <td className={cx(TD, 'text-center')}>
                      <IconButton
                        label={`Удалить этап «${s.name}»`}
                        onClick={() => removeStage(s.id)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-ink-subtle">
        Карта собирается в браузере: введённые данные никуда не отправляются.
      </footer>
    </div>
  );
}
