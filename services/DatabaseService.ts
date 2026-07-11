import { Platform } from 'react-native';
import { ImportedJournalContent } from './ImportTypes';
import { dbLog } from './Logger';
import { JournalTypeId } from './JournalTypes';
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
      CREATE TABLE IF NOT EXISTS journal_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        journal_type TEXT NOT NULL,
        source_image_uri TEXT NOT NULL,
        ocr_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, journal_type)
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

  async saveDrawing(
    date: string,
    journalType: JournalTypeId,
    drawingData: unknown[]
  ): Promise<void> {
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

  async loadDrawing(date: string, journalType: JournalTypeId): Promise<any[]> {
    if (Platform.OS === 'web') {
      return webDatabaseService.loadDrawing(date, journalType);
    }
    if (!this.db) await this.initDatabase();
    const result = (await this.db!.getFirstAsync(
      'SELECT data FROM journal_entries WHERE date = ? AND journal_type = ?',
      [date, journalType]
    )) as { data: string } | null;
    return result ? (JSON.parse(result.data) as unknown[]) : [];
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
    await this.db!.runAsync('DELETE FROM journal_imports WHERE date = ? AND journal_type = ?', [
      date,
      journalType,
    ]);
  }

  async saveImportedJournalContent(content: ImportedJournalContent): Promise<void> {
    if (Platform.OS === 'web') {
      return webDatabaseService.saveImportedJournalContent(content);
    }
    if (!this.db) await this.initDatabase();
    await this.db!.runAsync(
      `INSERT INTO journal_imports (date, journal_type, source_image_uri, ocr_text, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(date, journal_type) DO UPDATE SET
         source_image_uri = excluded.source_image_uri,
         ocr_text = excluded.ocr_text,
         updated_at = CURRENT_TIMESTAMP`,
      [content.date, content.journalType, content.sourceImageUri, content.transcribedText]
    );
  }

  async loadImportedJournalContent(
    date: string,
    journalType: JournalTypeId
  ): Promise<ImportedJournalContent | null> {
    if (Platform.OS === 'web') {
      return webDatabaseService.loadImportedJournalContent(date, journalType);
    }
    if (!this.db) await this.initDatabase();
    const result = (await this.db!.getFirstAsync(
      `SELECT date, journal_type, source_image_uri, ocr_text, created_at, updated_at
       FROM journal_imports WHERE date = ? AND journal_type = ?`,
      [date, journalType]
    )) as {
      date: string;
      journal_type: JournalTypeId;
      source_image_uri: string;
      ocr_text: string;
      created_at: string;
      updated_at: string;
    } | null;

    if (!result) {
      return null;
    }

    return {
      date: result.date,
      journalType: result.journal_type,
      sourceImageUri: result.source_image_uri,
      transcribedText: result.ocr_text,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }
}

export const databaseService = new DatabaseService();
