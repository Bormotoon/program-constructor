// СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать вручную.
// Источник: официальные ФРП 2025 г. (edsoo.ru), разбор — tools/frp_parser.py,
// сборка — tools/build_frp_data.py.

export type FrpLevel = 'НОО' | 'ООО' | 'СОО';

export interface FrpTopic {
  num: string;
  name: string;
  hours: number;
  content: string;
  activity: string;
}

export interface FrpSection {
  name: string;
  hours: number;
  topics: FrpTopic[];
}

export interface FrpLesson {
  number: number;
  topic: string;
  /** Часы на практические работы, если ФРП их выделяет. */
  practice: number;
}

export interface FrpLessonVariant {
  /** Название варианта планирования; пусто, если он единственный. */
  name: string;
  lessons: FrpLesson[];
}

export interface FrpClass {
  grade: number;
  /** Раздел «Содержание обучения» этого класса, как он изложен в ФРП. */
  content: string;
  /**
   * Поурочное планирование из самой ФРП, по вариантам. Пусто, если программа
   * его не содержит — тогда план разворачивается из тематического.
   */
  lessonVariants: FrpLessonVariant[];
  /** Сумма часов по всем разделам таблицы. */
  hours: number;
  /** Часы, объявленные в самой ФРП строкой «ОБЩЕЕ КОЛИЧЕСТВО». */
  declaredHours: number | null;
  /**
   * Модульная программа: ФРП перечисляет все модули на выбор, поэтому hours
   * законно больше declaredHours — школа набирает из модулей нужный объём.
   */
  modular: boolean;
  notes: string[];
  sections: FrpSection[];
}

export interface FrpPlan {
  subject: string;
  level: FrpLevel;
  variant: string;
  source: string;
  /** Пояснительная записка ФРП дословно. */
  note: string;
  /** Личностные результаты — общие для всей программы. */
  personalResults: string;
  /** Метапредметные результаты — общие для всей программы. */
  metaResults: string;
  /**
   * Предметные результаты по классам. Ключ — номер класса; пустой ключ значит,
   * что ФРП излагает их одним блоком на весь уровень образования.
   */
  subjectResults: Record<string, string>;
  classes: FrpClass[];
}

export interface FrpSourceIssue {
  /** Класс, к плану которого относится расхождение; 0 — ко всей программе. */
  grade: number;
  text: string;
}

export interface FrpCatalogEntry {
  slug: string;
  subject: string;
  level: FrpLevel;
  variant: string;
  grades: number[];
  /** Годовая норма часов по классам (для модульных предметов — норма, а не сумма модулей). */
  hoursByGrade: Record<string, number>;
  totalHours: number;
  /** Предмет модульный (музыка, физкультура, ОРКСЭ, труд): модули выбираются. */
  modular: boolean;
  /** В ФРП есть готовое поурочное планирование. */
  hasLessons: boolean;
  /** Источник — имя файла ФРП на edsoo.ru. */
  source: string;
  /** true, если сумма разобранных часов сошлась с объявленной в ФРП. */
  verified: boolean;
  /**
   * Расхождения в самой ФРП: перечень тем не сходится с объявленным в ней
   * итогом. Это дефекты исходного документа, а не разбора.
   */
  sourceIssues: FrpSourceIssue[];
  /** Число тем во всех классах — используется при отборе дубликатов. */
  topicCount: number;
}

export const FRP_CATALOG: FrpCatalogEntry[] = [
  {"slug": "izobrazitelnoe-iskusstvo-noo", "subject": "Изобразительное искусство", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 66, "2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 270, "source": "2025_noo_frp_izo_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 23},
  {"slug": "inostrannyj-anglijskij-yazyk-noo", "subject": "Иностранный (английский) язык", "level": "НОО", "variant": "", "grades": [2, 3, 4], "hoursByGrade": {"2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_noo_frp_anglijskij-yazyk_2-4.pdf", "verified": true, "sourceIssues": [{"grade": 4, "text": "4 кл., раздел «Мир вокруг меня»: итого 23 ≠ сумма тем 21"}, {"grade": 4, "text": "4 кл.: ОБЩЕЕ КОЛИЧЕСТВО 68 ≠ сумма 66"}], "topicCount": 68},
  {"slug": "inostrannyj-ispanskij-yazyk-noo", "subject": "Иностранный (испанский) язык", "level": "НОО", "variant": "", "grades": [2, 3, 4], "hoursByGrade": {"2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_noo_frp_ispanskij-yazyk_2-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 72},
  {"slug": "inostrannyj-kitajskij-yazyk-noo", "subject": "Иностранный (китайский) язык", "level": "НОО", "variant": "", "grades": [2, 3, 4], "hoursByGrade": {"2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_noo_frp_kitajskij-yazyk_2-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 77},
  {"slug": "inostrannyj-nemeckij-yazyk-noo", "subject": "Иностранный (немецкий) язык", "level": "НОО", "variant": "", "grades": [2, 3, 4], "hoursByGrade": {"2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_noo_frp_nemeczkij-yazyk_2-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 13},
  {"slug": "inostrannyj-francuzskij-yazyk-noo", "subject": "Иностранный (французский) язык", "level": "НОО", "variant": "", "grades": [2, 3, 4], "hoursByGrade": {"2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_noo_frp_franczuzskij-yazyk_2-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 69},
  {"slug": "literaturnoe-chtenie-noo", "subject": "Литературное чтение", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 132, "2": 136, "3": 136, "4": 136}, "modular": false, "hasLessons": true, "totalHours": 540, "source": "2025_noo_frp_literaturnoe-chtenie_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 54},
  {"slug": "matematika-noo", "subject": "Математика", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 132, "2": 136, "3": 136, "4": 136}, "modular": false, "hasLessons": false, "totalHours": 540, "source": "2025_noo_frp_matematika_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 45},
  {"slug": "muzyka-noo", "subject": "Музыка", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 33, "2": 34, "3": 34, "4": 34}, "modular": false, "hasLessons": false, "totalHours": 135, "source": "2025_noo_frp_muzyka_1-4.pdf", "verified": true, "sourceIssues": [{"grade": 4, "text": "4 кл.: ОБЩЕЕ КОЛИЧЕСТВО 34 ≠ сумма 33"}], "topicCount": 116},
  {"slug": "okruzhayuschij-mir-noo", "subject": "Окружающий мир", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 66, "2": 68, "3": 68, "4": 68}, "modular": false, "hasLessons": true, "totalHours": 270, "source": "2025_noo_frp_okruzhayushhij-mir_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 41},
  {"slug": "osnovy-religioznyh-kultur-i-svetskoj-etiki-noo", "subject": "Основы религиозных культур и светской этики", "level": "НОО", "variant": "", "grades": [4], "hoursByGrade": {"4": 34}, "modular": true, "hasLessons": false, "totalHours": 34, "source": "2025_noo_frp_orkse_4.pdf", "verified": true, "sourceIssues": [], "topicCount": 99},
  {"slug": "russkij-yazyk-noo", "subject": "Русский язык", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 165, "2": 170, "3": 170, "4": 170}, "modular": false, "hasLessons": true, "totalHours": 675, "source": "2025_noo_frp_russkij-yazyk_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 43},
  {"slug": "trud-tehnologiya-noo", "subject": "Труд (технология)", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 33, "2": 34, "3": 34, "4": 34}, "modular": false, "hasLessons": true, "totalHours": 135, "source": "2025_noo_frp_trud_1-4.pdf", "verified": true, "sourceIssues": [{"grade": 4, "text": "4 кл.: ОБЩЕЕ КОЛИЧЕСТВО 34 ≠ сумма 35"}], "topicCount": 48},
  {"slug": "fizicheskaya-kultura-noo", "subject": "Физическая культура", "level": "НОО", "variant": "", "grades": [1, 2, 3, 4], "hoursByGrade": {"1": 99, "2": 102, "3": 102, "4": 102}, "modular": false, "hasLessons": false, "totalHours": 405, "source": "2025_noo_frp_fizicheskaya-kultura_1-4.pdf", "verified": true, "sourceIssues": [], "topicCount": 42},
  {"slug": "algebra-ooo-bazovyj", "subject": "Алгебра", "level": "ООО", "variant": "базовый", "grades": [7, 8, 9], "hoursByGrade": {"7": 102, "8": 102, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 306, "source": "2025_ooo_frp_matematika-5-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 22},
  {"slug": "algebra-ooo-uglublennyj", "subject": "Алгебра", "level": "ООО", "variant": "углублённый", "grades": [7, 8, 9], "hoursByGrade": {"7": 136, "8": 136, "9": 136}, "modular": false, "hasLessons": false, "totalHours": 408, "source": "2025_ooo_frp_matematika-5-9_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 26},
  {"slug": "biologiya-ooo-bazovyj", "subject": "Биология", "level": "ООО", "variant": "базовый", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 34, "6": 34, "7": 34, "8": 68, "9": 68}, "modular": false, "hasLessons": false, "totalHours": 238, "source": "2025_ooo_frp_biologiya_5-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 49},
  {"slug": "veroyatnost-i-statistika-ooo-bazovyj", "subject": "Вероятность и статистика", "level": "ООО", "variant": "базовый", "grades": [7, 8, 9], "hoursByGrade": {"7": 34, "8": 34, "9": 34}, "modular": false, "hasLessons": false, "totalHours": 102, "source": "2025_ooo_frp_matematika-5-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 19},
  {"slug": "veroyatnost-i-statistika-ooo-uglublennyj", "subject": "Вероятность и статистика", "level": "ООО", "variant": "углублённый", "grades": [7, 8, 9], "hoursByGrade": {"7": 34, "8": 34, "9": 34}, "modular": false, "hasLessons": false, "totalHours": 102, "source": "2025_ooo_frp_matematika-5-9_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 24},
  {"slug": "vtoroj-inostrannyj-anglijskij-yazyk-ooo", "subject": "Второй иностранный (английский) язык", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 68, "6": 68, "7": 68, "8": 68, "9": 68}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_ooo_frp_angl_vi_5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 108},
  {"slug": "vtoroj-inostrannyj-nemeckij-yazyk-ooo", "subject": "Второй иностранный (немецкий) язык", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 68, "6": 68, "7": 68, "8": 68, "9": 68}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_ooo_frp_vinemeczkij_5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 56},
  {"slug": "geografiya-ooo", "subject": "География", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 34, "6": 34, "7": 68, "8": 68, "9": 68}, "modular": false, "hasLessons": true, "totalHours": 272, "source": "2025_ooo_frp_geografiya-5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 51},
  {"slug": "geometriya-ooo-bazovyj", "subject": "Геометрия", "level": "ООО", "variant": "базовый", "grades": [7, 8, 9], "hoursByGrade": {"7": 68, "8": 68, "9": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_ooo_frp_matematika-5-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 18},
  {"slug": "geometriya-ooo-uglublennyj", "subject": "Геометрия", "level": "ООО", "variant": "углублённый", "grades": [7, 8, 9], "hoursByGrade": {"7": 102, "8": 102, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 306, "source": "2025_ooo_frp_matematika-5-9_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 20},
  {"slug": "izobrazitelnoe-iskusstvo-ooo", "subject": "Изобразительное искусство", "level": "ООО", "variant": "", "grades": [5, 6, 7], "hoursByGrade": {"5": 34, "6": 34, "7": 34}, "modular": false, "hasLessons": false, "totalHours": 102, "source": "2025_ooo_frp_izo-5-7.pdf", "verified": true, "sourceIssues": [], "topicCount": 14},
  {"slug": "inostrannyj-anglijskij-yazyk-ooo", "subject": "Иностранный (английский) язык", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 102, "6": 102, "7": 102, "8": 102, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 510, "source": "2025_ooo_frp_angl_5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 114},
  {"slug": "inostrannyj-nemeckij-yazyk-ooo", "subject": "Иностранный (немецкий) язык", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 102, "6": 102, "7": 102, "8": 102, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 510, "source": "2025_ooo_frp-nemeczkij_5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 57},
  {"slug": "informatika-ooo-bazovyj", "subject": "Информатика", "level": "ООО", "variant": "базовый", "grades": [7, 8, 9], "hoursByGrade": {"7": 34, "8": 34, "9": 34}, "modular": false, "hasLessons": false, "totalHours": 102, "source": "2025_ooo_frp_informatika-7-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 23},
  {"slug": "informatika-ooo-uglublennyj", "subject": "Информатика", "level": "ООО", "variant": "углублённый", "grades": [7, 8, 9], "hoursByGrade": {"7": 68, "8": 68, "9": 68}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_ooo_frp_informatika-7-9_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 27},
  {"slug": "istoriya-ooo", "subject": "История", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 102, "6": 102, "7": 102, "8": 102, "9": 68}, "modular": false, "hasLessons": true, "totalHours": 476, "source": "2025_ooo_frp_istoriya_5-9.pdf", "verified": true, "sourceIssues": [{"grade": 5, "text": "5 кл., раздел «Древний мир»: итого 33 ≠ сумма тем 22"}], "topicCount": 61},
  {"slug": "literatura-ooo", "subject": "Литература", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 102, "6": 102, "7": 68, "8": 68, "9": 102}, "modular": false, "hasLessons": true, "totalHours": 442, "source": "2025_ooo_frp_literatura_5-9.pdf", "verified": true, "sourceIssues": [{"grade": 7, "text": "7 кл., раздел «Литература конца XIX – начала XX века»: итого 5 ≠ сумма тем 4"}, {"grade": 7, "text": "7 кл.: ОБЩЕЕ КОЛИЧЕСТВО 68 ≠ сумма 67"}], "topicCount": 126},
  {"slug": "matematika-ooo-bazovyj", "subject": "Математика", "level": "ООО", "variant": "базовый", "grades": [5, 6], "hoursByGrade": {"5": 170, "6": 170}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_ooo_frp_matematika-5-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 17},
  {"slug": "muzyka-ooo", "subject": "Музыка", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8], "hoursByGrade": {"5": 34, "6": 34, "7": 34, "8": 34}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_ooo_frp_muzyka-5-8.pdf", "verified": true, "sourceIssues": [], "topicCount": 72},
  {"slug": "obschestvoznanie-ooo", "subject": "Обществознание", "level": "ООО", "variant": "", "grades": [6, 7, 8, 9], "hoursByGrade": {"6": 34, "7": 34, "8": 34, "9": 34}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_ooo_frp_obshhestvo-6-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 47},
  {"slug": "osnovy-bezopasnosti-i-zaschity-rodiny-ooo", "subject": "Основы безопасности и защиты родины", "level": "ООО", "variant": "", "grades": [8, 9], "hoursByGrade": {"8": 34, "9": 34}, "modular": false, "hasLessons": true, "totalHours": 68, "source": "2025_ooo_frp_obzr-8-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 56},
  {"slug": "russkij-yazyk-ooo", "subject": "Русский язык", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 170, "6": 204, "7": 136, "8": 102, "9": 102}, "modular": false, "hasLessons": true, "totalHours": 714, "source": "2025_ooo_frp_russkij-yazyk_5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 93},
  {"slug": "fizika-ooo-bazovyj", "subject": "Физика", "level": "ООО", "variant": "базовый", "grades": [7, 8, 9], "hoursByGrade": {"7": 68, "8": 68, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 238, "source": "2025_ooo_frp_fizika-7-9_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 37},
  {"slug": "fizika-ooo-uglublennyj", "subject": "Физика", "level": "ООО", "variant": "углублённый", "grades": [7, 8, 9], "hoursByGrade": {"7": 102, "8": 102, "9": 136}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_ooo_frp_fizika_7-9_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 41},
  {"slug": "fizicheskaya-kultura-ooo", "subject": "Физическая культура", "level": "ООО", "variant": "", "grades": [5, 6, 7, 8, 9], "hoursByGrade": {"5": 102, "6": 102, "7": 102, "8": 102, "9": 102}, "modular": false, "hasLessons": false, "totalHours": 510, "source": "2025_ooo_frp_fizkultura-5-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 52},
  {"slug": "himiya-ooo-bazovyj", "subject": "Химия", "level": "ООО", "variant": "базовый", "grades": [8, 9], "hoursByGrade": {"8": 136, "9": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_ooo_frp_himiya_8-9_baza.pdf", "verified": true, "sourceIssues": [], "topicCount": 22},
  {"slug": "himiya-ooo-uglublennyj", "subject": "Химия", "level": "ООО", "variant": "углублённый", "grades": [8, 9], "hoursByGrade": {"8": 136, "9": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_ooo_frp_himiya_uglub_8-9.pdf", "verified": true, "sourceIssues": [], "topicCount": 21},
  {"slug": "algebra-i-nachala-matematicheskogo-analiza-soo-bazovyj", "subject": "Алгебра и начала математического анализа", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 170, "source": "2025_soo_frp_matematika_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 14},
  {"slug": "algebra-i-nachala-matematicheskogo-analiza-soo-uglublennyj", "subject": "Алгебра и начала математического анализа", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 136, "11": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_soo_frp_matematika_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 18},
  {"slug": "anglijskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj", "subject": "Английский язык. второй иностранный язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_anglyaz_10-11_vi.pdf", "verified": true, "sourceIssues": [], "topicCount": 45},
  {"slug": "biologiya-soo-bazovyj", "subject": "Биология", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 68, "source": "2025_soo_frp_biologiya_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 60},
  {"slug": "biologiya-soo-uglublennyj", "subject": "Биология", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_biologiya_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 150},
  {"slug": "veroyatnost-i-statistika-soo-bazovyj", "subject": "Вероятность и статистика", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 68, "source": "2025_soo_frp_matematika_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 14},
  {"slug": "veroyatnost-i-statistika-soo-uglublennyj", "subject": "Вероятность и статистика", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 68, "source": "2025_soo_frp_matematika_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 12},
  {"slug": "vtoroj-inostrannyj-ispanskij-yazyk-soo-bazovyj", "subject": "Второй иностранный (испанский) язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_vi_ispanskij_10-11.pdf", "verified": true, "sourceIssues": [], "topicCount": 25},
  {"slug": "vtoroj-inostrannyj-nemeckij-yazyk-soo-bazovyj", "subject": "Второй иностранный (немецкий) язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_nem-yaz_10-11_vi.pdf", "verified": true, "sourceIssues": [], "topicCount": 24},
  {"slug": "vtoroj-inostrannyj-francuzskij-yazyk-soo-bazovyj", "subject": "Второй иностранный (французский) язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_vi_franczuzskij_10-11.pdf", "verified": true, "sourceIssues": [], "topicCount": 24},
  {"slug": "geografiya-soo-bazovyj", "subject": "География", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": true, "totalHours": 68, "source": "2025_soo_frp_geografiya_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 26},
  {"slug": "geografiya-soo-uglublennyj", "subject": "География", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_geografiya_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 86},
  {"slug": "geometriya-soo-bazovyj", "subject": "Геометрия", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 102, "source": "2025_soo_frp_matematika_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 11},
  {"slug": "geometriya-soo-uglublennyj", "subject": "Геометрия", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_matematika_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 15},
  {"slug": "inostrannyj-anglijskij-yazyk-soo-bazovyj", "subject": "Иностранный (английский) язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_angl-yaz_10-11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 47},
  {"slug": "inostrannyj-anglijskij-yazyk-soo-uglublennyj", "subject": "Иностранный (английский) язык", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 170, "11": 170}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_soo_frp_anglyaz_10-11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 58},
  {"slug": "inostrannyj-nemeckij-yazyk-soo-bazovyj", "subject": "Иностранный (немецкий) язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 105, "11": 105}, "modular": false, "hasLessons": false, "totalHours": 210, "source": "2025_soo_frp_nemyaz_10-11_baz.pdf", "verified": true, "sourceIssues": [{"grade": 10, "text": "10 кл.: ОБЩЕЕ КОЛИЧЕСТВО 105 ≠ сумма 102"}, {"grade": 11, "text": "11 кл.: ОБЩЕЕ КОЛИЧЕСТВО 105 ≠ сумма 102"}], "topicCount": 25},
  {"slug": "inostrannyj-nemeckij-yazyk-soo-uglublennyj", "subject": "Иностранный (немецкий) язык", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 170, "11": 170}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_soo_frp_nemyaz_10-11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 31},
  {"slug": "informatika-soo-bazovyj", "subject": "Информатика", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 68, "source": "2025_soo_frp_informatika_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 12},
  {"slug": "informatika-soo-uglublennyj", "subject": "Информатика", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 136, "11": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_soo_frp_informatika_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 26},
  {"slug": "istoriya-soo-bazovyj", "subject": "История", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": true, "totalHours": 136, "source": "2025_soo_frp_istoriya_10_11_baza.pdf", "verified": true, "sourceIssues": [{"grade": 11, "text": "11 кл., раздел «СССР в 1945–1991 гг.»: итого 27 ≠ сумма тем 26"}], "topicCount": 61},
  {"slug": "istoriya-soo-uglublennyj", "subject": "История", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 136, "11": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_soo_frp_istoriya_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 76},
  {"slug": "kitajskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj", "subject": "Китайский язык. второй иностранный язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_vi_kit-yaz_10-11.pdf", "verified": true, "sourceIssues": [], "topicCount": 22},
  {"slug": "literatura-soo-bazovyj", "subject": "Литература", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": true, "totalHours": 204, "source": "2025_soo_frp_literatura_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 60},
  {"slug": "literatura-soo-uglublennyj", "subject": "Литература", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 170, "11": 170}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_soo_frp_literatura_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 67},
  {"slug": "obschestvoznanie-soo-uglublennyj", "subject": "Обществознание", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 136, "11": 136}, "modular": false, "hasLessons": false, "totalHours": 272, "source": "2025_soo_frp_obshhestvoznanie_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 66},
  {"slug": "osnovy-bezopasnosti-i-zaschity-rodiny-soo", "subject": "Основы безопасности и защиты родины", "level": "СОО", "variant": "", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": true, "totalHours": 68, "source": "2025_soo_frp_obzr_10_11.pdf", "verified": true, "sourceIssues": [], "topicCount": 50},
  {"slug": "russkij-yazyk-soo-bazovyj", "subject": "Русский язык", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": true, "totalHours": 136, "source": "2025_soo_frp_russkij-yazyk_10_11.pdf", "verified": true, "sourceIssues": [], "topicCount": 67},
  {"slug": "fizika-soo-bazovyj", "subject": "Физика", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 68, "11": 68}, "modular": false, "hasLessons": false, "totalHours": 136, "source": "2025_soo_frp_fizika_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 21},
  {"slug": "fizika-soo-uglublennyj", "subject": "Физика", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 170, "11": 170}, "modular": false, "hasLessons": false, "totalHours": 340, "source": "2025_soo_frp_fizika_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 27},
  {"slug": "fizicheskaya-kultura-soo", "subject": "Физическая культура", "level": "СОО", "variant": "", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_fizkultura_10_11.pdf", "verified": true, "sourceIssues": [], "topicCount": 21},
  {"slug": "himiya-soo-bazovyj", "subject": "Химия", "level": "СОО", "variant": "базовый", "grades": [10, 11], "hoursByGrade": {"10": 34, "11": 34}, "modular": false, "hasLessons": false, "totalHours": 68, "source": "2025_soo_frp_himiya_10_11_baz.pdf", "verified": true, "sourceIssues": [], "topicCount": 17},
  {"slug": "himiya-soo-uglublennyj", "subject": "Химия", "level": "СОО", "variant": "углублённый", "grades": [10, 11], "hoursByGrade": {"10": 102, "11": 102}, "modular": false, "hasLessons": false, "totalHours": 204, "source": "2025_soo_frp_himiya_10_11_ugl.pdf", "verified": true, "sourceIssues": [], "topicCount": 17}
];

// Тип импортируемого JSON вывести точно нельзя: TypeScript расширяет строковые
// литералы до string, и level не сходится с FrpLevel. Данные готовит
// tools/build_frp_data.py по той же схеме, поэтому приведение здесь безопасно.
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "izobrazitelnoe-iskusstvo-noo": () => import('./izobrazitelnoe-iskusstvo-noo.json'),
  "inostrannyj-anglijskij-yazyk-noo": () => import('./inostrannyj-anglijskij-yazyk-noo.json'),
  "inostrannyj-ispanskij-yazyk-noo": () => import('./inostrannyj-ispanskij-yazyk-noo.json'),
  "inostrannyj-kitajskij-yazyk-noo": () => import('./inostrannyj-kitajskij-yazyk-noo.json'),
  "inostrannyj-nemeckij-yazyk-noo": () => import('./inostrannyj-nemeckij-yazyk-noo.json'),
  "inostrannyj-francuzskij-yazyk-noo": () => import('./inostrannyj-francuzskij-yazyk-noo.json'),
  "literaturnoe-chtenie-noo": () => import('./literaturnoe-chtenie-noo.json'),
  "matematika-noo": () => import('./matematika-noo.json'),
  "muzyka-noo": () => import('./muzyka-noo.json'),
  "okruzhayuschij-mir-noo": () => import('./okruzhayuschij-mir-noo.json'),
  "osnovy-religioznyh-kultur-i-svetskoj-etiki-noo": () => import('./osnovy-religioznyh-kultur-i-svetskoj-etiki-noo.json'),
  "russkij-yazyk-noo": () => import('./russkij-yazyk-noo.json'),
  "trud-tehnologiya-noo": () => import('./trud-tehnologiya-noo.json'),
  "fizicheskaya-kultura-noo": () => import('./fizicheskaya-kultura-noo.json'),
  "algebra-ooo-bazovyj": () => import('./algebra-ooo-bazovyj.json'),
  "algebra-ooo-uglublennyj": () => import('./algebra-ooo-uglublennyj.json'),
  "biologiya-ooo-bazovyj": () => import('./biologiya-ooo-bazovyj.json'),
  "veroyatnost-i-statistika-ooo-bazovyj": () => import('./veroyatnost-i-statistika-ooo-bazovyj.json'),
  "veroyatnost-i-statistika-ooo-uglublennyj": () => import('./veroyatnost-i-statistika-ooo-uglublennyj.json'),
  "vtoroj-inostrannyj-anglijskij-yazyk-ooo": () => import('./vtoroj-inostrannyj-anglijskij-yazyk-ooo.json'),
  "vtoroj-inostrannyj-nemeckij-yazyk-ooo": () => import('./vtoroj-inostrannyj-nemeckij-yazyk-ooo.json'),
  "geografiya-ooo": () => import('./geografiya-ooo.json'),
  "geometriya-ooo-bazovyj": () => import('./geometriya-ooo-bazovyj.json'),
  "geometriya-ooo-uglublennyj": () => import('./geometriya-ooo-uglublennyj.json'),
  "izobrazitelnoe-iskusstvo-ooo": () => import('./izobrazitelnoe-iskusstvo-ooo.json'),
  "inostrannyj-anglijskij-yazyk-ooo": () => import('./inostrannyj-anglijskij-yazyk-ooo.json'),
  "inostrannyj-nemeckij-yazyk-ooo": () => import('./inostrannyj-nemeckij-yazyk-ooo.json'),
  "informatika-ooo-bazovyj": () => import('./informatika-ooo-bazovyj.json'),
  "informatika-ooo-uglublennyj": () => import('./informatika-ooo-uglublennyj.json'),
  "istoriya-ooo": () => import('./istoriya-ooo.json'),
  "literatura-ooo": () => import('./literatura-ooo.json'),
  "matematika-ooo-bazovyj": () => import('./matematika-ooo-bazovyj.json'),
  "muzyka-ooo": () => import('./muzyka-ooo.json'),
  "obschestvoznanie-ooo": () => import('./obschestvoznanie-ooo.json'),
  "osnovy-bezopasnosti-i-zaschity-rodiny-ooo": () => import('./osnovy-bezopasnosti-i-zaschity-rodiny-ooo.json'),
  "russkij-yazyk-ooo": () => import('./russkij-yazyk-ooo.json'),
  "fizika-ooo-bazovyj": () => import('./fizika-ooo-bazovyj.json'),
  "fizika-ooo-uglublennyj": () => import('./fizika-ooo-uglublennyj.json'),
  "fizicheskaya-kultura-ooo": () => import('./fizicheskaya-kultura-ooo.json'),
  "himiya-ooo-bazovyj": () => import('./himiya-ooo-bazovyj.json'),
  "himiya-ooo-uglublennyj": () => import('./himiya-ooo-uglublennyj.json'),
  "algebra-i-nachala-matematicheskogo-analiza-soo-bazovyj": () => import('./algebra-i-nachala-matematicheskogo-analiza-soo-bazovyj.json'),
  "algebra-i-nachala-matematicheskogo-analiza-soo-uglublennyj": () => import('./algebra-i-nachala-matematicheskogo-analiza-soo-uglublennyj.json'),
  "anglijskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj": () => import('./anglijskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj.json'),
  "biologiya-soo-bazovyj": () => import('./biologiya-soo-bazovyj.json'),
  "biologiya-soo-uglublennyj": () => import('./biologiya-soo-uglublennyj.json'),
  "veroyatnost-i-statistika-soo-bazovyj": () => import('./veroyatnost-i-statistika-soo-bazovyj.json'),
  "veroyatnost-i-statistika-soo-uglublennyj": () => import('./veroyatnost-i-statistika-soo-uglublennyj.json'),
  "vtoroj-inostrannyj-ispanskij-yazyk-soo-bazovyj": () => import('./vtoroj-inostrannyj-ispanskij-yazyk-soo-bazovyj.json'),
  "vtoroj-inostrannyj-nemeckij-yazyk-soo-bazovyj": () => import('./vtoroj-inostrannyj-nemeckij-yazyk-soo-bazovyj.json'),
  "vtoroj-inostrannyj-francuzskij-yazyk-soo-bazovyj": () => import('./vtoroj-inostrannyj-francuzskij-yazyk-soo-bazovyj.json'),
  "geografiya-soo-bazovyj": () => import('./geografiya-soo-bazovyj.json'),
  "geografiya-soo-uglublennyj": () => import('./geografiya-soo-uglublennyj.json'),
  "geometriya-soo-bazovyj": () => import('./geometriya-soo-bazovyj.json'),
  "geometriya-soo-uglublennyj": () => import('./geometriya-soo-uglublennyj.json'),
  "inostrannyj-anglijskij-yazyk-soo-bazovyj": () => import('./inostrannyj-anglijskij-yazyk-soo-bazovyj.json'),
  "inostrannyj-anglijskij-yazyk-soo-uglublennyj": () => import('./inostrannyj-anglijskij-yazyk-soo-uglublennyj.json'),
  "inostrannyj-nemeckij-yazyk-soo-bazovyj": () => import('./inostrannyj-nemeckij-yazyk-soo-bazovyj.json'),
  "inostrannyj-nemeckij-yazyk-soo-uglublennyj": () => import('./inostrannyj-nemeckij-yazyk-soo-uglublennyj.json'),
  "informatika-soo-bazovyj": () => import('./informatika-soo-bazovyj.json'),
  "informatika-soo-uglublennyj": () => import('./informatika-soo-uglublennyj.json'),
  "istoriya-soo-bazovyj": () => import('./istoriya-soo-bazovyj.json'),
  "istoriya-soo-uglublennyj": () => import('./istoriya-soo-uglublennyj.json'),
  "kitajskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj": () => import('./kitajskij-yazyk-vtoroj-inostrannyj-yazyk-soo-bazovyj.json'),
  "literatura-soo-bazovyj": () => import('./literatura-soo-bazovyj.json'),
  "literatura-soo-uglublennyj": () => import('./literatura-soo-uglublennyj.json'),
  "obschestvoznanie-soo-uglublennyj": () => import('./obschestvoznanie-soo-uglublennyj.json'),
  "osnovy-bezopasnosti-i-zaschity-rodiny-soo": () => import('./osnovy-bezopasnosti-i-zaschity-rodiny-soo.json'),
  "russkij-yazyk-soo-bazovyj": () => import('./russkij-yazyk-soo-bazovyj.json'),
  "fizika-soo-bazovyj": () => import('./fizika-soo-bazovyj.json'),
  "fizika-soo-uglublennyj": () => import('./fizika-soo-uglublennyj.json'),
  "fizicheskaya-kultura-soo": () => import('./fizicheskaya-kultura-soo.json'),
  "himiya-soo-bazovyj": () => import('./himiya-soo-bazovyj.json'),
  "himiya-soo-uglublennyj": () => import('./himiya-soo-uglublennyj.json'),
};

/** Тематическое планирование грузится по требованию — корпус слишком велик для стартового бандла. */
export async function loadFrpPlan(slug: string): Promise<FrpPlan | null> {
  const loader = LOADERS[slug];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as FrpPlan;
}

export function findCatalogEntry(
  subject: string,
  level: FrpLevel,
  variant?: string,
): FrpCatalogEntry | undefined {
  const matches = FRP_CATALOG.filter((e) => e.subject === subject && e.level === level);
  if (variant) {
    const exact = matches.find((e) => e.variant === variant);
    if (exact) return exact;
  }
  return matches[0];
}

export function subjectsForLevel(level: FrpLevel): FrpCatalogEntry[] {
  return FRP_CATALOG.filter((e) => e.level === level);
}
