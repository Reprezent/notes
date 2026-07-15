import { Platform } from 'react-native';
import { dbLog } from './Logger';
import {
  DEFAULT_JOURNAL_BACKGROUND_STYLE,
  isJournalBackgroundStyle,
  JournalBackgroundStyle,
  JournalTypeId,
} from './JournalTypes';
import { webDatabaseService } from './WebDatabaseService';

export interface JournalEntry {
  date: string;
  journalType: JournalTypeId;
}

class DatabaseService {
  private db: any = null;

  async initDatabase(): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.initDatabase();
    }

    const SQLite = await import('expo-sqlite');
    this.db = await SQLite.openDatabaseAsync('journal.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        journal_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, journal_type)
      );
      CREATE TABLE IF NOT EXISTS journal_preferences (
        journal_type TEXT PRIMARY KEY,
        background_style TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO journal_entries (date, journal_type, data, created_at, updated_at)
      SELECT date, 'daily-diary', data, created_at, updated_at FROM drawings;
    `);
    dbLog.info('Database initialized successfully');
  }

  async createJournalEntry(date: string, journalType: JournalTypeId): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.createJournalEntry(date, journalType);
    }
    if (!this.db) await this.initDatabase();
    await this.db!.runAsync(
      'INSERT OR IGNORE INTO journal_entries (date, journal_type, data) VALUES (?, ?, ?)',
      [date, journalType, JSON.stringify([])]
    );
  }

  async saveDrawing(date: string, journalType: JournalTypeId, drawingData: unknown): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.saveDrawing(date, journalType, drawingData);
    }
    if (!this.db) await this.initDatabase();
    await this.db!.runAsync(
      `INSERT INTO journal_entries (date, journal_type, data, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(date, journal_type) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
      [date, journalType, JSON.stringify(drawingData)]
    );
  }

  async loadDrawing(date: string, journalType: JournalTypeId): Promise<unknown> {
    if (Platform.OS === 'web') {
      return webDatabaseService.loadDrawing(date, journalType);
    }
    if (!this.db) await this.initDatabase();
    const result = (await this.db!.getFirstAsync(
      'SELECT data FROM journal_entries WHERE date = ? AND journal_type = ?',
      [date, journalType]
    )) as { data: string } | null;
    return result ? (JSON.parse(result.data) as unknown) : [];
  }

  async getAllJournalEntries(): Promise<JournalEntry[]> {
    if (Platform.OS === 'web') {
      return webDatabaseService.getAllJournalEntries();
    }
    if (!this.db) await this.initDatabase();
    const results = (await this.db!.getAllAsync(
      'SELECT date, journal_type FROM journal_entries ORDER BY date DESC'
    )) as { date: string; journal_type: JournalTypeId }[];
    return results.map((row) => ({ date: row.date, journalType: row.journal_type }));
  }

  async deleteDrawing(date: string, journalType: JournalTypeId): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.deleteDrawing(date, journalType);
    }
    if (!this.db) await this.initDatabase();
    await this.db!.runAsync('DELETE FROM journal_entries WHERE date = ? AND journal_type = ?', [
      date,
      journalType,
    ]);
  }

  async getJournalBackground(journalType: JournalTypeId): Promise<JournalBackgroundStyle> {
    if (Platform.OS === 'web') {
      return webDatabaseService.getJournalBackground(journalType);
    }
    if (!this.db) await this.initDatabase();
    const result = (await this.db!.getFirstAsync(
      'SELECT background_style FROM journal_preferences WHERE journal_type = ?',
      [journalType]
    )) as { background_style: string } | null;

    if (!result) {
      return DEFAULT_JOURNAL_BACKGROUND_STYLE;
    }

    return isJournalBackgroundStyle(result.background_style)
      ? result.background_style
      : DEFAULT_JOURNAL_BACKGROUND_STYLE;
  }

  async saveJournalBackground(
    journalType: JournalTypeId,
    backgroundStyle: JournalBackgroundStyle
  ): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.saveJournalBackground(journalType, backgroundStyle);
    }
    if (!this.db) await this.initDatabase();
    await this.db!.runAsync(
      `INSERT INTO journal_preferences (journal_type, background_style, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(journal_type) DO UPDATE SET
         background_style = excluded.background_style,
         updated_at = CURRENT_TIMESTAMP`,
      [journalType, backgroundStyle]
    );
  }
}

export const databaseService = new DatabaseService();
