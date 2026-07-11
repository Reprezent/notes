import { Platform } from 'react-native';
import { webDatabaseService } from './WebDatabaseService';
import { dbLog } from './Logger';

export interface Drawing {
  id?: number;
  date: string;
  data: string; // JSON string of drawing paths
  created_at?: string;
  updated_at?: string;
}

class DatabaseService {
  private db: any = null;

  async initDatabase(): Promise<void> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      dbLog.info('Using web database service');
      return webDatabaseService.initDatabase();
    }

    try {
      dbLog.info('Initializing SQLite database for native platform');
      // Dynamically import SQLite only for native platforms
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
      `);

      dbLog.info('Database initialized successfully');
    } catch (error) {
      dbLog.error('Error initializing database:', error);
      throw error;
    }
  }

  async saveDrawing(date: string, drawingData: any[]): Promise<void> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      dbLog.debug('Saving drawing to web storage', { date, pathCount: drawingData.length });
      return webDatabaseService.saveDrawing(date, drawingData);
    }

    if (!this.db) {
      await this.initDatabase();
    }

    try {
      const dataString = JSON.stringify(drawingData);
      dbLog.debug('Saving drawing to SQLite', {
        date,
        pathCount: drawingData.length,
        dataSize: dataString.length,
      });

      await this.db!.runAsync(
        `INSERT OR REPLACE INTO drawings (date, data, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [date, dataString]
      );

      dbLog.info('Drawing saved successfully', { date });
    } catch (error) {
      dbLog.error('Error saving drawing:', { date, error });
      throw error;
    }
  }

  async loadDrawing(date: string): Promise<any[]> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      dbLog.debug('Loading drawing from web storage', { date });
      return webDatabaseService.loadDrawing(date);
    }

    if (!this.db) {
      await this.initDatabase();
    }

    try {
      dbLog.debug('Loading drawing from SQLite', { date });
      const result = (await this.db!.getFirstAsync(`SELECT data FROM drawings WHERE date = ?`, [
        date,
      ])) as { data: string } | null;

      if (result && result.data) {
        const parsedData = JSON.parse(result.data);
        dbLog.info('Drawing loaded successfully', { date, pathCount: parsedData.length });
        return parsedData;
      }

      dbLog.debug('No drawing found for date', { date });
      return [];
    } catch (error) {
      dbLog.error('Error loading drawing:', { date, error });
      return [];
    }
  }

  async getAllDrawingDates(): Promise<string[]> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      return webDatabaseService.getAllDrawingDates();
    }

    if (!this.db) {
      await this.initDatabase();
    }

    try {
      const results = (await this.db!.getAllAsync(
        `SELECT date FROM drawings ORDER BY date DESC`
      )) as { date: string }[];

      return results.map((row) => row.date);
    } catch (error) {
      console.error('Error getting drawing dates:', error);
      return [];
    }
  }

  async deleteDrawing(date: string): Promise<void> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      return webDatabaseService.deleteDrawing(date);
    }

    if (!this.db) {
      await this.initDatabase();
    }

    try {
      await this.db!.runAsync(`DELETE FROM drawings WHERE date = ?`, [date]);

      console.log('Drawing deleted for date:', date);
    } catch (error) {
      console.error('Error deleting drawing:', error);
      throw error;
    }
  }

  async hasDrawing(date: string): Promise<boolean> {
    // Use web service for web platform
    if (Platform.OS === 'web') {
      return webDatabaseService.hasDrawing(date);
    }

    if (!this.db) {
      await this.initDatabase();
    }

    try {
      const result = await this.db!.getFirstAsync(`SELECT 1 FROM drawings WHERE date = ?`, [date]);

      return result !== null;
    } catch (error) {
      console.error('Error checking if drawing exists:', error);
      return false;
    }
  }
}

export const databaseService = new DatabaseService();
