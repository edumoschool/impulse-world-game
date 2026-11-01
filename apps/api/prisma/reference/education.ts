// Global education taxonomy, synced by the seed (ADR-013). Codes are stable identifiers: never
// rename one, because tenant content and learner history point at these rows.
// The Uzbek and Russian text is a machine-assisted draft and needs native review.

type Text = { uz: string; en: string; ru: string };

export const GRADE_LEVELS: {
  code: string;
  rank: number;
  minAge: number;
  maxAge: number;
  title: Text;
}[] = [
  {
    code: 'PRESCHOOL',
    rank: 0,
    minAge: 5,
    maxAge: 6,
    title: { uz: 'Maktabgacha tayyorlov', en: 'Pre-school', ru: 'Подготовка к школе' },
  },
  {
    code: 'GRADE_1',
    rank: 1,
    minAge: 7,
    maxAge: 7,
    title: { uz: '1-sinf', en: 'Grade 1', ru: '1 класс' },
  },
  {
    code: 'GRADE_2',
    rank: 2,
    minAge: 8,
    maxAge: 8,
    title: { uz: '2-sinf', en: 'Grade 2', ru: '2 класс' },
  },
  {
    code: 'GRADE_3',
    rank: 3,
    minAge: 9,
    maxAge: 9,
    title: { uz: '3-sinf', en: 'Grade 3', ru: '3 класс' },
  },
  {
    code: 'GRADE_4',
    rank: 4,
    minAge: 10,
    maxAge: 10,
    title: { uz: '4-sinf', en: 'Grade 4', ru: '4 класс' },
  },
  {
    code: 'GRADE_5',
    rank: 5,
    minAge: 11,
    maxAge: 11,
    title: { uz: '5-sinf', en: 'Grade 5', ru: '5 класс' },
  },
  {
    code: 'GRADE_6',
    rank: 6,
    minAge: 12,
    maxAge: 12,
    title: { uz: '6-sinf', en: 'Grade 6', ru: '6 класс' },
  },
];

/** One core subject per world in the game (spec 12). */
export const SUBJECTS: { code: string; sortOrder: number; title: Text }[] = [
  {
    code: 'LANGUAGE',
    sortOrder: 1,
    title: { uz: 'Til va savodxonlik', en: 'Language and literacy', ru: 'Язык и грамотность' },
  },
  { code: 'MATH', sortOrder: 2, title: { uz: 'Matematika', en: 'Mathematics', ru: 'Математика' } },
  {
    code: 'SCIENCE',
    sortOrder: 3,
    title: { uz: 'Tabiiy fanlar', en: 'Science', ru: 'Естественные науки' },
  },
  {
    code: 'DISCOVERY',
    sortOrder: 4,
    title: { uz: 'Atrofimizdagi dunyo', en: 'The world around us', ru: 'Окружающий мир' },
  },
  {
    code: 'CREATIVE',
    sortOrder: 5,
    title: { uz: "San'at va musiqa", en: 'Art and music', ru: 'Искусство и музыка' },
  },
  {
    code: 'TECH',
    sortOrder: 6,
    title: {
      uz: 'Texnologiya va dasturlash',
      en: 'Technology and coding',
      ru: 'Технологии и программирование',
    },
  },
];
