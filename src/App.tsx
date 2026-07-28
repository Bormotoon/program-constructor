import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Info,
  LayoutList,
  ListChecks,
  Moon,
  Printer,
  RotateCcw,
  Save,
  FolderOpen,
  Sun,
  Table2,
  Wand2,
} from 'lucide-react';
import UmkFromCatalog from './components/UmkFromCatalog';
import { SchoolCombobox } from './components/SchoolCombobox';
import { ExportMenu } from './components/ExportMenu';
import { LibraryDialog } from './components/LibraryDialog';

// Диалог импорта тянет за собой парсер xlsx (~400 КБ) — грузим по открытию.
const ExcelImportDialog = lazy(() =>
  import('./components/ExcelImportDialog').then((m) => ({ default: m.ExcelImportDialog })),
);

import { ThematicPlanEditor } from './components/ThematicPlanEditor';
import { LessonPlanEditor } from './components/LessonPlanEditor';
import { ProgramPreview } from './components/ProgramPreview';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Notice,
  Select,
  TextArea,
  TextInput,
  cx,
} from './components/ui';
import { useTheme } from './hooks/useTheme';
import {
  FRP_CATALOG,
  loadFrpPlan,
  subjectsForLevel,
  type FrpCatalogEntry,
  type FrpLevel,
  type FrpPlan,
} from './data/frp/catalog';
import {
  APPROVAL_LABELS,
  APPROVAL_PRESETS,
  defaultProgram,
  type ApprovalKind,
  type ProgramData,
} from './data/program';
import * as library from './data/library';
import {
  buildPlanForGrade,
  frpClassForGrade,
  frpSubjectResults,
  planHours,
  planTopicCount,
} from './data/thematicPlan';
import { frpLessonVariants, generateLessonPlan, lessonsFromFrp } from './data/lessonPlan';
import { generateNormativeBase } from './data/normativeBase';
import {
  exportLibraryFile,
  exportProgramFile,
  importLibraryFile,
  importProgramFile,
  ProgramFileError,
} from './utils/programFile';

const LEVELS: { value: FrpLevel; label: string }[] = [
  { value: 'НОО', label: 'НОО — начальное общее' },
  { value: 'ООО', label: 'ООО — основное общее' },
  { value: 'СОО', label: 'СОО — среднее общее' },
];

const TABS = [
  { id: 'title', label: 'Титульный лист', icon: FileText },
  { id: 'note', label: 'Пояснительная записка', icon: BookOpen },
  { id: 'content', label: 'Содержание обучения', icon: LayoutList },
  { id: 'results', label: 'Планируемые результаты', icon: ListChecks },
  { id: 'plan', label: 'Тематическое планирование', icon: Table2 },
  { id: 'lessons', label: 'Поурочное планирование', icon: CalendarDays },
  { id: 'support', label: 'УМК и обеспечение', icon: Info },
] as const;

type TabId = (typeof TABS)[number]['id'] | 'preview';

/**
 * Какую программу открыть при запуске.
 *
 * Идентификатор и данные разрешаются вместе, одной функцией: если разрешать
 * их порознь, они могут разойтись — программа взята одна, а данные прочитаны
 * от другой, и первое же автосохранение затрёт чужую программу.
 */
function openInitialProgram(): { id: string; data: ProgramData } {
  // При первом запуске новой версии сюда переносится работа из старого
  // хранилища на один слот.
  library.migrateSingleProgram();

  let id = library.currentId();
  if (!id || !library.read(id)) {
    const first = library.list()[0]?.id;
    if (first) {
      id = first;
      library.setCurrent(id);
    } else {
      id = library.create();
    }
  }
  return { id, data: library.read(id) ?? defaultProgram };
}

export default function App() {
  const initial = useRef<{ id: string; data: ProgramData } | null>(null);
  if (!initial.current) initial.current = openInitialProgram();

  const [programId, setProgramId] = useState<string>(initial.current.id);
  const [data, setData] = useState<ProgramData>(initial.current.data);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [entries, setEntries] = useState<library.LibraryEntry[]>(() => library.list());
  const [storageError, setStorageError] = useState('');
  // Каталог перечня открывает конструктор ссылкой с «#umk» — значит, учитель
  // пришёл именно за разделом УМК, и показывать ему титульный лист незачем.
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    window.location.hash === '#umk' ? 'support' : 'title',
  );
  const [plan, setPlan] = useState<FrpPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  /** Slug, для которого ждём план, чтобы подставить официальные тексты ФРП. */
  const pendingFill = useRef<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);
  const [theme, setTheme] = useTheme();

  const entry: FrpCatalogEntry | undefined = useMemo(
    () => FRP_CATALOG.find((e) => e.slug === data.frpSlug),
    [data.frpSlug],
  );

  const levelSubjects = useMemo(() => subjectsForLevel(data.educationLevel), [data.educationLevel]);

  /** Часы по ФРП для выбранного класса — контрольное значение для таблицы. */
  const expectedHours = useMemo(() => {
    if (!entry || !data.grade) return null;
    return entry.hoursByGrade[data.grade] ?? null;
  }, [entry, data.grade]);

  /**
   * Расхождения самой ФРП, относящиеся к выбранному классу (grade 0 — ко всей
   * программе). Пока класс не выбран, показываются все: учителю полезно знать
   * о дефектах документа до того, как он начнёт заполнять план.
   */
  const gradeIssues = useMemo(() => {
    if (!entry) return [];
    if (!data.grade) return entry.sourceIssues;
    return entry.sourceIssues.filter((i) => i.grade === 0 || String(i.grade) === data.grade);
  }, [entry, data.grade]);

  const totalHours = planHours(data.thematicPlan);
  const hoursOff =
    expectedHours != null &&
    totalHours !== expectedHours &&
    !(entry?.modular && totalHours > expectedHours);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        library.save(programId, data);
        library.setCurrent(programId);
        setEntries(library.list());
        setSavedAt(new Date());
        setStorageError('');
      } catch (e) {
        // Место в браузере кончилось. Молчать нельзя: учитель продолжит
        // печатать, а на диск уже ничего не ложится.
        setStorageError(
          e instanceof library.StorageFullError ? e.message : 'Не удалось сохранить программу.',
        );
        console.error('Не удалось сохранить программу:', e);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data, programId]);

  /**
   * Текстовые разделы из самой ФРП: пояснительная записка и все три группы
   * планируемых результатов идут дословно, как в оригинальном конструкторе.
   * Нормативная база остаётся нашей — в ФРП её нет, это перечень приказов.
   */
  const fillFromFrp = useCallback(
    (e: FrpCatalogEntry, p: FrpPlan, grade: string) => ({
      normativeBase: `${generateNormativeBase(e.level, e.subject)}\n\n${p.note}`,
      personalResults: p.personalResults,
      metaResults: p.metaResults,
      subjectResults: frpSubjectResults(p, Number(grade)),
    }),
    [],
  );

  // Тематическое планирование лежит отдельными файлами и грузится по требованию.
  useEffect(() => {
    let cancelled = false;
    if (!data.frpSlug) {
      setPlan(null);
      return;
    }
    setPlanLoading(true);
    loadFrpPlan(data.frpSlug)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        // Официальные тексты подставляются только вслед за ВЫБОРОМ предмета.
        // Восстановление сохранённой программы флага не ставит, иначе
        // загрузка плана затирала бы то, что учитель уже написал.
        if (p && pendingFill.current === data.frpSlug) {
          pendingFill.current = null;
          const e = FRP_CATALOG.find((x) => x.slug === data.frpSlug);
          if (e) setData((prev) => ({ ...prev, ...fillFromFrp(e, p, prev.grade) }));
        }
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.frpSlug, fillFromFrp]);

  const patch = useCallback((p: Partial<ProgramData>) => {
    setData((prev) => ({ ...prev, ...p }));
  }, []);

  // Ссылки на обработчики таблиц должны быть стабильными: иначе мемоизация
  // строк не работает и план на две сотни уроков перерисовывается целиком
  // при каждом нажатии клавиши.
  const setThematicPlan = useCallback(
    (thematicPlan: ProgramData['thematicPlan']) => patch({ thematicPlan }),
    [patch],
  );
  const setLessonPlan = useCallback(
    (lessonPlan: ProgramData['lessonPlan']) => patch({ lessonPlan }),
    [patch],
  );

  const chooseSubject = useCallback(
    (slug: string) => {
      const e = FRP_CATALOG.find((x) => x.slug === slug);
      if (!e) {
        patch({ frpSlug: '', subject: '' });
        return;
      }
      const grade = e.grades.includes(Number(data.grade)) ? data.grade : String(e.grades[0]);
      // Тексты ФРП лежат в файле плана и грузятся асинхронно; флаг говорит
      // эффекту загрузки подставить их, когда план придёт. Нормативная база
      // и перечень УМК не зависят от ФРП и заполняются сразу.
      pendingFill.current = slug;
      patch({
        frpSlug: slug,
        subject: e.subject,
        educationLevel: e.level,
        variant: e.variant,
        grade,
        normativeBase: generateNormativeBase(e.level, e.subject),
        methodologicalSupport:
          `1. Учебник по предмету «${e.subject}», включённый в федеральный перечень учебников (ФПУ).\n` +
          '2. Электронные образовательные ресурсы ФГИС «Моя школа», Библиотека цифрового образовательного контента (ЦОК).\n' +
          '3. Дидактические и контрольно-измерительные материалы.',
      });
    },
    [data.grade, patch],
  );

  /**
   * Смена класса. Таблица заполнена под конкретный класс, поэтому при переходе
   * на другой предлагаем очистить её: иначе учитель увидит темы прежнего класса
   * и норму часов нового, что выглядит как ошибка контроля часов.
   */
  const changeGrade = useCallback(
    (grade: string) => {
      if (grade === data.grade) return;

      // Содержание обучения и предметные результаты в ФРП свои у каждого
      // класса, поэтому идут вслед за ним — но только если учитель их не
      // правил. Правку узнаём сравнением с текстом ФРП прежнего класса:
      // совпало — значит текст подставлен нами и его можно заменить.
      const retext: Partial<ProgramData> = {};
      if (plan) {
        const was = frpClassForGrade(plan, Number(data.grade));
        if (was && was.content === data.subjectContent) {
          retext.subjectContent = frpClassForGrade(plan, Number(grade))?.content ?? '';
        }
        if (frpSubjectResults(plan, Number(data.grade)) === data.subjectResults) {
          retext.subjectResults = frpSubjectResults(plan, Number(grade));
        }
      }

      if (data.thematicPlan.length) {
        const drop = window.confirm(
          `Тематическое планирование заполнено для ${data.grade} класса.\n` +
            'Очистить таблицу под новый класс?\n\n' +
            'ОК — очистить, Отмена — оставить как есть.',
        );
        patch(drop ? { grade, thematicPlan: [], lessonPlan: [], ...retext } : { grade, ...retext });
        return;
      }
      patch({ grade, ...retext });
    },
    [
      data.grade,
      data.thematicPlan.length,
      data.subjectContent,
      data.subjectResults,
      plan,
      patch,
    ],
  );

  /** Предзаполнение таблицы из ФРП — основная функция конструктора. */
  const prefillPlan = useCallback(() => {
    if (!plan || !data.grade) return;
    const sections = buildPlanForGrade(plan, Number(data.grade));
    if (!sections.length) {
      window.alert(`В федеральной программе нет тематического планирования для ${data.grade} класса.`);
      return;
    }
    if (
      data.thematicPlan.length &&
      !window.confirm('Заменить текущее тематическое планирование данными из федеральной программы?')
    ) {
      return;
    }
    // Раздел «Содержание обучения» относится к тому же классу, поэтому
    // заполняется здесь же: отдельной кнопки для него в оригинале нет.
    const cls = frpClassForGrade(plan, Number(data.grade));
    patch({
      thematicPlan: sections,
      lessonPlan: [],
      ...(cls?.content && !data.subjectContent ? { subjectContent: cls.content } : {}),
      // Предметные результаты у части ФРП расписаны по классам, поэтому
      // обновляются вместе с планом — но только если учитель их не правил.
      ...(!data.subjectResults && frpSubjectResults(plan, Number(data.grade))
        ? { subjectResults: frpSubjectResults(plan, Number(data.grade)) }
        : {}),
    });
    setActiveTab('plan');
  }, [
    plan,
    data.grade,
    data.thematicPlan.length,
    data.subjectContent,
    data.subjectResults,
    patch,
  ]);

  const issues = useMemo(() => {
    const list: string[] = [];
    if (!data.schoolName) list.push('Не указана образовательная организация');
    if (!data.subject) list.push('Не выбран учебный предмет');
    if (!data.grade) list.push('Не указан класс');
    if (!data.teacherName) list.push('Не указано ФИО составителя');
    if (!data.normativeBase) list.push('Не заполнена пояснительная записка');
    if (!data.thematicPlan.length) list.push('Не заполнено тематическое планирование');
    else if (hoursOff) {
      list.push(`Часы плана (${totalHours}) не совпадают с ФРП (${expectedHours})`);
    }
    return list;
  }, [data, hoursOff, totalHours, expectedHours]);

  /** Отметка «раздел заполнен» в боковом меню — видно, что осталось сделать. */
  const done: Record<string, boolean> = {
    title: Boolean(data.schoolName && data.subject && data.grade && data.teacherName),
    note: Boolean(data.normativeBase),
    content: Boolean(data.subjectContent),
    results: Boolean(data.personalResults || data.metaResults || data.subjectResults),
    plan: data.thematicPlan.length > 0 && !hoursOff,
    lessons: data.lessonPlan.length > 0,
    support: Boolean(data.methodologicalSupport),
  };

  // ===== библиотека программ =====

  /** Переключение на другую программу; текущая уже сохранена автосохранением. */
  const openProgram = useCallback((id: string) => {
    const loaded = library.read(id);
    if (!loaded) return;
    library.setCurrent(id);
    setProgramId(id);
    setData(loaded);
    setEntries(library.list());
    setActiveTab('title');
    setLibraryOpen(false);
  }, []);

  const withLibrary = useCallback((action: () => void) => {
    try {
      action();
      setEntries(library.list());
    } catch (e) {
      window.alert(
        e instanceof library.StorageFullError ? e.message : 'Не удалось изменить список программ.',
      );
    }
  }, []);

  const createProgram = useCallback(() => {
    withLibrary(() => openProgram(library.create()));
  }, [withLibrary, openProgram]);

  /**
   * Загрузка программы из файла — способ перенести работу на другой компьютер
   * или принять её от коллеги. Файл добавляется как ещё одна программа, а не
   * замещает открытую: подменить чужим файлом уже сделанное — потеря работы.
   */
  const loadFromFile = useCallback(
    async (file: File) => {
      try {
        const loaded = await importProgramFile(file);
        withLibrary(() => openProgram(library.create(loaded)));
      } catch (e) {
        window.alert(
          e instanceof ProgramFileError ? e.message : 'Не удалось прочитать файл программы.',
        );
      }
    },
    [withLibrary, openProgram],
  );

  /** Восстановление из резервной копии: программы добавляются к имеющимся. */
  const loadBackup = useCallback(
    async (file: File) => {
      try {
        const items = await importLibraryFile(file);
        if (!items.length) {
          window.alert('В копии нет ни одной программы.');
          return;
        }
        if (
          !window.confirm(
            `Добавить программы из копии: ${items.length} шт.?\n\n` +
              'Уже сохранённые программы останутся на месте.',
          )
        ) {
          return;
        }
        withLibrary(() => {
          let last = '';
          for (const item of items) last = library.create(item.program, item.title);
          if (last) openProgram(last);
        });
      } catch (e) {
        window.alert(
          e instanceof ProgramFileError ? e.message : 'Не удалось прочитать резервную копию.',
        );
      }
    },
    [withLibrary, openProgram],
  );

  const deleteProgram = useCallback(
    (id: string) => {
      library.remove(id);
      const rest = library.list();
      setEntries(rest);
      // Удалили открытую — открываем следующую или заводим пустую.
      if (id === programId) {
        const next = rest[0]?.id;
        if (next) openProgram(next);
        else createProgram();
      }
    },
    [programId, openProgram, createProgram],
  );

  /**
   * Поурочный план: у 14 программ он есть в самой ФРП и берётся дословно,
   * у остальных разворачивается из тематического.
   */
  const lessonVariants = useMemo(
    () => frpLessonVariants(plan, Number(data.grade)),
    [plan, data.grade],
  );

  const buildLessons = useCallback(
    (variant = 0) => {
      const fromFrp =
        plan && data.grade ? lessonsFromFrp(plan, Number(data.grade), variant) : [];
      patch({ lessonPlan: fromFrp.length ? fromFrp : generateLessonPlan(data.thematicPlan) });
    },
    [plan, data.grade, data.thematicPlan, patch],
  );

  const reset = useCallback(() => {
    if (window.confirm('Очистить все данные этой программы? Действие необратимо.')) {
      setData(defaultProgram);
      setActiveTab('title');
    }
  }, []);

  if (activeTab === 'preview') {
    return <ProgramPreview data={data} onBack={() => setActiveTab('title')} />;
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-brand px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Перейти к содержимому
      </a>

      {libraryOpen && (
        <LibraryDialog
          entries={entries}
          currentId={programId}
          used={library.usedBytes()}
          onOpen={openProgram}
          onCreate={createProgram}
          onDuplicate={(id) => withLibrary(() => {
            const copy = library.duplicate(id);
            if (copy) openProgram(copy);
          })}
          onRename={(id, title) => withLibrary(() => library.rename(id, title))}
          onDelete={deleteProgram}
          onExportOne={(id) => {
            const program = id === programId ? data : library.read(id);
            if (program) exportProgramFile(program);
          }}
          onImportOne={(file) => void loadFromFile(file)}
          onExportAll={exportLibraryFile}
          onImportAll={(file) => void loadBackup(file)}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {storageError && (
        <div className="sticky top-0 z-40 border-b border-danger/30 bg-danger-soft px-4 py-2 print:hidden">
          <p role="alert" className="mx-auto flex max-w-[1680px] items-center gap-2 text-sm text-danger">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">{storageError}</span>
            <Button size="sm" onClick={() => exportProgramFile(data)}>
              <Save size={15} /> Сохранить в файл
            </Button>
          </p>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] leading-tight font-semibold">
                Конструктор рабочих программ
              </h1>
              <p className="truncate text-xs text-ink-subtle">
                ФГОС · ФОП · федеральные рабочие программы 2025
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span aria-live="polite" className="hidden text-xs text-ink-subtle sm:inline">
              {savedAt ? `сохранено в ${savedAt.toLocaleTimeString('ru-RU')}` : 'черновик'}
            </span>

            {issues.length === 0 ? (
              <Badge tone="ok" icon={<CheckCircle2 size={13} />}>
                готово к выгрузке
              </Badge>
            ) : (
              <Badge tone="warn" icon={<AlertTriangle size={13} />}>
                замечаний: {issues.length}
              </Badge>
            )}

            <IconButton
              label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>

            <IconButton label="Сохранить программу в файл" onClick={() => exportProgramFile(data)}>
              <Save size={16} />
            </IconButton>
            <Button size="sm" onClick={() => setLibraryOpen(true)}>
              <FolderOpen size={15} />
              <span className="hidden sm:inline">Мои программы</span>
              <Badge tone="neutral">{entries.length}</Badge>
            </Button>

            <Button size="sm" onClick={() => setActiveTab('preview')}>
              <Printer size={15} /> Предпросмотр
            </Button>
            <ExportMenu data={data} size="sm" />
          </div>
        </div>
      </header>

      {/* На узком экране порядок меняется: навигация сверху горизонтальной
          лентой, содержимое сразу под ней, а сводка параметров уходит вниз —
          иначе до самой формы пришлось бы прокручивать целый экран панели. */}
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:gap-6 lg:py-6">
        <Card className="overflow-hidden p-1 lg:hidden print:hidden">
          <nav aria-label="Разделы программы" className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap',
                    'transition-colors duration-150',
                    active
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-ink-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  <Icon size={16} />
                  {t.label}
                  {done[t.id] && <Check size={14} className="text-ok" aria-label="заполнено" />}
                </button>
              );
            })}
          </nav>
        </Card>

        <aside className="order-last lg:order-none lg:w-72 lg:shrink-0 print:hidden">
          <div className="space-y-4 lg:sticky lg:top-24">
            <Card className="hidden overflow-hidden p-1 lg:block">
              <nav aria-label="Разделы программы">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm',
                        'transition-colors duration-150',
                        active
                          ? 'bg-brand-soft font-medium text-brand'
                          : 'text-ink-muted hover:bg-sunken hover:text-ink',
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      {done[t.id] && (
                        <Check size={14} className="shrink-0 text-ok" aria-label="заполнено" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Параметры</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Предмет" value={data.subject || '—'} />
                <Row label="Класс" value={data.grade || '—'} />
                <Row label="Норма ФРП" value={expectedHours != null ? `${expectedHours} ч` : '—'} />
                <Row
                  label="В плане"
                  value={`${totalHours} ч`}
                  tone={hoursOff ? 'danger' : totalHours ? 'ok' : undefined}
                />
                <Row label="Тем" value={String(planTopicCount(data.thematicPlan))} />
              </dl>

              {gradeIssues.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <Notice tone="warn" icon={<AlertTriangle size={14} />}>
                    <p className="font-medium">
                      В самой федеральной программе перечень тем не сходится с объявленным итогом:
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {gradeIssues.map((issue) => (
                        <li key={issue.text}>{issue.text}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5">Часы в этих разделах стоит сверить с оригиналом.</p>
                  </Notice>
                </div>
              )}

              <Button
                variant="primary"
                className="mt-4 w-full"
                disabled={!plan || planLoading || !data.grade}
                onClick={prefillPlan}
              >
                <Wand2 size={15} />
                {planLoading ? 'Загрузка ФРП…' : 'Заполнить из ФРП'}
              </Button>
              {entry && (
                <p className="mt-2 text-[11px] leading-snug text-ink-subtle">
                  Источник: {entry.source}
                </p>
              )}
            </Card>

            <Button variant="danger" className="w-full" onClick={reset}>
              <RotateCcw size={15} /> Очистить программу
            </Button>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <Card className="p-5 sm:p-6">
            {activeTab === 'title' && (
              <TitleTab
                data={data}
                entry={entry}
                levelSubjects={levelSubjects}
                patch={patch}
                chooseSubject={chooseSubject}
                changeGrade={changeGrade}
              />
            )}

            {activeTab === 'note' && (
              <TextSection
                title="Пояснительная записка"
                hint="Заполняется из федеральной рабочей программы при выборе предмета. Текст можно править."
                value={data.normativeBase}
                onChange={(v) => patch({ normativeBase: v })}
                rows={26}
              />
            )}

            {activeTab === 'content' && (
              <TextSection
                title="Содержание обучения"
                hint="Заполняется из федеральной рабочей программы вместе с тематическим планированием."
                value={data.subjectContent}
                onChange={(v) => patch({ subjectContent: v })}
                rows={26}
              />
            )}

            {activeTab === 'results' && (
              <div className="space-y-6">
                <SectionHead
                  title="Планируемые результаты освоения программы"
                  hint="Три группы результатов по ФГОС: личностные, метапредметные и предметные."
                />
                <TextSection
                  title="Личностные результаты"
                  value={data.personalResults}
                  onChange={(v) => patch({ personalResults: v })}
                  rows={9}
                  compact
                />
                <TextSection
                  title="Метапредметные результаты"
                  value={data.metaResults}
                  onChange={(v) => patch({ metaResults: v })}
                  rows={9}
                  compact
                />
                <TextSection
                  title="Предметные результаты"
                  value={data.subjectResults}
                  onChange={(v) => patch({ subjectResults: v })}
                  rows={11}
                  compact
                />
              </div>
            )}

            {activeTab === 'plan' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SectionHead
                    title="Тематическое планирование"
                    hint="Разделы, темы, часы, программное содержание и виды деятельности из ФРП."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setExcelOpen(true)}>
                      <FileUp size={15} /> Импорт из Excel
                    </Button>
                    {!data.thematicPlan.length && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!plan || planLoading || !data.grade}
                        onClick={prefillPlan}
                      >
                        <Wand2 size={15} /> Заполнить из ФРП
                      </Button>
                    )}
                  </div>
                </div>

                {data.thematicPlan.length ? (
                  <ThematicPlanEditor
                    sections={data.thematicPlan}
                    onChange={setThematicPlan}
                    expectedHours={expectedHours}
                    modular={entry?.modular}
                    grade={data.grade}
                  />
                ) : (
                  <EmptyState
                    icon={<Table2 size={28} />}
                    title="Планирование ещё не заполнено"
                    description={
                      data.frpSlug
                        ? 'Выберите класс и нажмите «Заполнить из ФРП» — таблица заполнится разделами, темами, часами, программным содержанием и видами деятельности.'
                        : 'Сначала выберите учебный предмет на вкладке «Титульный лист».'
                    }
                    action={
                      data.frpSlug ? (
                        <Button
                          variant="primary"
                          disabled={!plan || planLoading || !data.grade}
                          onClick={prefillPlan}
                        >
                          <Wand2 size={15} /> Заполнить из ФРП
                        </Button>
                      ) : (
                        <Button variant="primary" onClick={() => setActiveTab('title')}>
                          Выбрать предмет
                        </Button>
                      )
                    }
                  />
                )}
              </div>
            )}

            {activeTab === 'lessons' && (
              <div className="space-y-5">
                <SectionHead
                  title="Поурочное планирование"
                  hint="Разворачивается из тематического: тема на N часов даёт N уроков."
                />
                <LessonPlanEditor
                  rows={data.lessonPlan}
                  sections={data.thematicPlan}
                  onChange={setLessonPlan}
                  onRegenerate={buildLessons}
                  frpVariants={lessonVariants.map((v) => v.name)}
                />
              </div>
            )}

            {activeTab === 'support' && (
              <div className="space-y-5">
                <UmkFromCatalog
                  subject={data.subject}
                  grade={data.grade}
                  current={data.methodologicalSupport}
                  onApply={(v) => patch({ methodologicalSupport: v })}
                />
                <TextSection
                  title="Учебно-методическое обеспечение образовательного процесса"
                  hint="Учебники из федерального перечня, электронные ресурсы, дидактические материалы."
                  value={data.methodologicalSupport}
                  onChange={(v) => patch({ methodologicalSupport: v })}
                  rows={16}
                />
              </div>
            )}
          </Card>
        </main>
      </div>

      {excelOpen && (
        <Suspense fallback={null}>
          <ExcelImportDialog
            isOpen={excelOpen}
            onClose={() => setExcelOpen(false)}
            onImport={(sections) => {
              patch({ thematicPlan: [...data.thematicPlan, ...sections] });
              setExcelOpen(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd
        className={cx(
          'tabular truncate text-right font-medium',
          tone === 'danger' && 'text-danger',
          tone === 'ok' && 'text-ok',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

function TextSection({
  title,
  hint,
  value,
  onChange,
  rows,
  compact,
}: {
  title: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {compact ? (
        <h3 className="text-sm font-semibold">{title}</h3>
      ) : (
        <SectionHead title={title} hint={hint} />
      )}
      <TextArea
        aria-label={title}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-serif text-[15px]"
      />
    </div>
  );
}

function TitleTab({
  data,
  entry,
  levelSubjects,
  patch,
  chooseSubject,
  changeGrade,
}: {
  data: ProgramData;
  entry: FrpCatalogEntry | undefined;
  levelSubjects: FrpCatalogEntry[];
  patch: (p: Partial<ProgramData>) => void;
  chooseSubject: (slug: string) => void;
  changeGrade: (grade: string) => void;
}) {
  return (
    <div className="space-y-7">
      <SectionHead
        title="Титульный лист"
        hint="Реквизиты организации и параметры программы. Поля повторяют титульный лист по ФОП."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Региональный орган управления образованием">
          {(id, d) => (
            <TextInput
              id={id}
              aria-describedby={d}
              value={data.regionalAuthority}
              placeholder="Министерство образования …ской области"
              onChange={(e) => patch({ regionalAuthority: e.target.value })}
            />
          )}
        </Field>
        <Field label="Учредитель">
          {(id, d) => (
            <TextInput
              id={id}
              aria-describedby={d}
              value={data.founder}
              placeholder="Управление образования администрации …"
              onChange={(e) => patch({ founder: e.target.value })}
            />
          )}
        </Field>
      </div>

      <Field label="Образовательная организация" required hint="Поиск по данным OpenStreetMap">
        {(id, d) => (
          <SchoolCombobox
            id={id}
            aria-describedby={d}
            value={data.schoolName}
            onChange={(v) => patch({ schoolName: v })}
          />
        )}
      </Field>

      <fieldset className="space-y-4 rounded-xl border border-line bg-sunken p-4">
        <legend className="px-1.5 text-sm font-medium">Учебный предмет</legend>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Уровень образования" required>
            {(id, d) => (
              <Select
                id={id}
                aria-describedby={d}
                value={data.educationLevel}
                onChange={(e) =>
                  patch({
                    educationLevel: e.target.value as FrpLevel,
                    frpSlug: '',
                    subject: '',
                    grade: '',
                  })
                }
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="md:col-span-2">
            <Field
              label="Предмет"
              required
              hint={`${levelSubjects.length} предметов по действующим федеральным рабочим программам`}
            >
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  value={data.frpSlug}
                  onChange={(e) => chooseSubject(e.target.value)}
                >
                  <option value="">— выберите предмет —</option>
                  {levelSubjects.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.subject}
                      {s.variant ? ` · ${s.variant} уровень` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Класс" required>
            {(id, d) => (
              <Select
                id={id}
                aria-describedby={d}
                value={data.grade}
                disabled={!entry}
                onChange={(e) => changeGrade(e.target.value)}
              >
                <option value="">—</option>
                {(entry?.grades ?? []).map((g) => (
                  <option key={g} value={String(g)}>
                    {g} класс — {entry?.hoursByGrade[String(g)]} ч
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="ФИО составителя" required>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                value={data.teacherName}
                placeholder="Иванова Мария Петровна"
                onChange={(e) => patch({ teacherName: e.target.value })}
              />
            )}
          </Field>
          <Field label="Учебный год">
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                value={data.academicYear}
                onChange={(e) => patch({ academicYear: e.target.value })}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Населённый пункт">
          {(id, d) => (
            <TextInput
              id={id}
              aria-describedby={d}
              value={data.locality}
              autoComplete="address-level2"
              placeholder="г. Воронеж"
              onChange={(e) => patch({ locality: e.target.value })}
            />
          )}
        </Field>
        <Field label="Год">
          {(id, d) => (
            <TextInput
              id={id}
              aria-describedby={d}
              inputMode="numeric"
              value={data.year}
              onChange={(e) => patch({ year: e.target.value })}
            />
          )}
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-xl border border-line p-4">
        <legend className="px-1.5 text-sm font-medium">Блок согласования</legend>
        <div className="flex flex-wrap gap-2">
          {APPROVAL_PRESETS.map((preset) => {
            const active = preset.join() === data.approvals.join();
            return (
              <button
                key={preset.join()}
                type="button"
                aria-pressed={active}
                onClick={() => patch({ approvals: preset })}
                className={cx(
                  'cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand-soft font-medium text-brand'
                    : 'border-line-strong text-ink-muted hover:bg-sunken hover:text-ink',
                )}
              >
                {preset.map((k) => APPROVAL_LABELS[k]).join(' · ')}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {data.approvals.map((k: ApprovalKind) => (
            <Field key={k} label={APPROVAL_LABELS[k]}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  placeholder="Протокол № 1 от 28.08.2026"
                  value={
                    k === 'reviewed'
                      ? data.reviewedBy
                      : k === 'agreed'
                        ? data.agreedBy
                        : data.approvedBy
                  }
                  onChange={(e) =>
                    patch(
                      k === 'reviewed'
                        ? { reviewedBy: e.target.value }
                        : k === 'agreed'
                          ? { agreedBy: e.target.value }
                          : { approvedBy: e.target.value },
                    )
                  }
                />
              )}
            </Field>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
