export type JournalTypeId = 'daily-diary' | 'gratitude' | 'artists-notes' | 'inspiration';

export interface JournalType {
  id: JournalTypeId;
  name: string;
  description: string;
  accentColor: string;
  softColor: string;
}

export const JOURNAL_TYPES: readonly JournalType[] = [
  {
    id: 'daily-diary',
    name: 'Daily Diary',
    description: 'Capture the moments that made today yours.',
    accentColor: '#F9736A',
    softColor: '#FFE2DA',
  },
  {
    id: 'gratitude',
    name: 'Gratitude Journal',
    description: 'Make space for the people and things you appreciate.',
    accentColor: '#13A6A1',
    softColor: '#D9F4F1',
  },
  {
    id: 'artists-notes',
    name: "Artist's Notes",
    description: 'Collect ideas, observations, and creative sparks.',
    accentColor: '#8B6FE8',
    softColor: '#EEE8FF',
  },
  {
    id: 'inspiration',
    name: 'Inspiration Journal',
    description: 'Save the ideas that move you forward.',
    accentColor: '#4F8DF7',
    softColor: '#E2ECFF',
  },
];

export const isJournalType = (value: string): value is JournalTypeId =>
  JOURNAL_TYPES.some((journalType) => journalType.id === value);

export const getJournalType = (id: JournalTypeId): JournalType => {
  const journalType = JOURNAL_TYPES.find((type) => type.id === id);

  if (!journalType) {
    throw new Error(`Unknown journal type: ${id}`);
  }

  return journalType;
};
