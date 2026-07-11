import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImportedJournalContent } from './ImportTypes';
import { isJournalType, JournalTypeId } from './JournalTypes';

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

  private getImportStorageKey(date: string, journalType: JournalTypeId): string {
    return `journal-import:${journalType}:${date}`;
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

  async saveDrawing(date: string, journalType: JournalTypeId, drawingData: any[]): Promise<void> {
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

  async loadDrawing(date: string, journalType: JournalTypeId): Promise<any[]> {
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
      const importKey = this.getImportStorageKey(date, journalType);
      await AsyncStorage.removeItem(key);
      await AsyncStorage.removeItem(importKey);
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      throw error;
    }
  }

  async saveImportedJournalContent(content: ImportedJournalContent): Promise<void> {
    try {
      const key = this.getImportStorageKey(content.date, content.journalType);
      const existingValue = await AsyncStorage.getItem(key);
      const existing = existingValue ? (JSON.parse(existingValue) as ImportedJournalContent) : null;
      const timestamp = new Date().toISOString();
      const nextContent: ImportedJournalContent = {
        ...content,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      await AsyncStorage.setItem(key, JSON.stringify(nextContent));
    } catch (error) {
      console.error('Error saving imported journal content:', error);
      throw error;
    }
  }

  async loadImportedJournalContent(
    date: string,
    journalType: JournalTypeId
  ): Promise<ImportedJournalContent | null> {
    try {
      const key = this.getImportStorageKey(date, journalType);
      const value = await AsyncStorage.getItem(key);

      if (!value) {
        return null;
      }

      const parsed = JSON.parse(value) as ImportedJournalContent & { ocrText?: string };
      return {
        ...parsed,
        transcribedText: parsed.transcribedText ?? parsed.ocrText ?? '',
      };
    } catch (error) {
      console.error('Error loading imported journal content:', error);
      throw error;
    }
  }
}

export const webDatabaseService = new WebDatabaseService();
