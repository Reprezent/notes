import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_JOURNAL_BACKGROUND_STYLE,
  isJournalBackgroundStyle,
  isJournalType,
  JournalBackgroundStyle,
  JournalTypeId,
} from './JournalTypes';

export interface Drawing {
  id?: number;
  date: string;
  journal_type: JournalTypeId;
  data: string; // JSON string of drawing paths
  created_at?: string;
  updated_at?: string;
}

class WebDatabaseService {
  private getStorageKey(date: string, journalType: JournalTypeId): string {
    return `journal:${journalType}:${date}`;
  }

  private getBackgroundStorageKey(journalType: JournalTypeId): string {
    return `journal-background:${journalType}`;
  }

  async initDatabase(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const legacyDrawingKeys = keys.filter((key) => key.startsWith('drawing_'));

    await Promise.all(
      legacyDrawingKeys.map(async (legacyKey) => {
        const date = legacyKey.replace('drawing_', '');
        const legacyDrawing = await AsyncStorage.getItem(legacyKey);

        if (!legacyDrawing) {
          return;
        }

        const journalKey = this.getStorageKey(date, 'daily-diary');
        const existingJournal = await AsyncStorage.getItem(journalKey);

        if (!existingJournal) {
          await AsyncStorage.setItem(journalKey, legacyDrawing);
        }

        await AsyncStorage.removeItem(legacyKey);
      })
    );
  }

  async createJournalEntry(date: string, journalType: JournalTypeId): Promise<void> {
    try {
      const key = this.getStorageKey(date, journalType);
      const existingJournal = await AsyncStorage.getItem(key);

      if (existingJournal) {
        return;
      }

      const timestamp = new Date().toISOString();
      const drawing: Drawing = {
        date,
        journal_type: journalType,
        data: JSON.stringify([]),
        created_at: timestamp,
        updated_at: timestamp,
      };

      await AsyncStorage.setItem(key, JSON.stringify(drawing));
    } catch (error) {
      console.error('Error creating journal entry:', error);
      throw error;
    }
  }

  async saveDrawing(date: string, journalType: JournalTypeId, drawingData: unknown): Promise<void> {
    try {
      const key = this.getStorageKey(date, journalType);
      const existingJournal = await AsyncStorage.getItem(key);
      const result = await AsyncStorage.getItem(key);
      const timestamp = new Date().toISOString();
      const existingDrawing = result ? (JSON.parse(result) as Drawing) : null;

      const drawing: Drawing = {
        date,
        journal_type: journalType,
        data: JSON.stringify(drawingData),
        created_at: existingDrawing?.created_at ?? timestamp,
        updated_at: timestamp,
      };

      if (!existingJournal) {
        await this.createJournalEntry(date, journalType);
      }

      await AsyncStorage.setItem(key, JSON.stringify(drawing));
    } catch (error) {
      console.error('Error saving journal entry:', error);
      throw error;
    }
  }

  async loadDrawing(date: string, journalType: JournalTypeId): Promise<unknown> {
    try {
      const key = this.getStorageKey(date, journalType);
      const result = await AsyncStorage.getItem(key);

      if (!result) {
        return [];
      }

      const drawing = JSON.parse(result) as Drawing;
      return JSON.parse(drawing.data);
    } catch (error) {
      console.error('Error loading journal entry:', error);
      return [];
    }
  }

  async getAllJournalEntries(): Promise<{ date: string; journalType: JournalTypeId }[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();

      return keys.reduce<{ date: string; journalType: JournalTypeId }[]>((entries, key) => {
        const [prefix, journalType, date] = key.split(':');

        if (prefix === 'journal' && date && isJournalType(journalType)) {
          entries.push({ date, journalType });
        }

        return entries;
      }, []);
    } catch (error) {
      console.error('Error getting journal entries:', error);
      throw error;
    }
  }

  async deleteDrawing(date: string, journalType: JournalTypeId): Promise<void> {
    try {
      const key = this.getStorageKey(date, journalType);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      throw error;
    }
  }

  async getJournalBackground(journalType: JournalTypeId): Promise<JournalBackgroundStyle> {
    try {
      const result = await AsyncStorage.getItem(this.getBackgroundStorageKey(journalType));

      if (!result) {
        return DEFAULT_JOURNAL_BACKGROUND_STYLE;
      }

      return isJournalBackgroundStyle(result) ? result : DEFAULT_JOURNAL_BACKGROUND_STYLE;
    } catch (error) {
      console.error('Error loading journal background:', error);
      throw error;
    }
  }

  async saveJournalBackground(
    journalType: JournalTypeId,
    backgroundStyle: JournalBackgroundStyle
  ): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getBackgroundStorageKey(journalType), backgroundStyle);
    } catch (error) {
      console.error('Error saving journal background:', error);
      throw error;
    }
  }
}

export const webDatabaseService = new WebDatabaseService();
