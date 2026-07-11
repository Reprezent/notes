import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Drawing {
  id?: number;
  date: string;
  data: string; // JSON string of drawing paths
  created_at?: string;
  updated_at?: string;
}

class WebDatabaseService {
  private async getStorageKey(date: string): Promise<string> {
    return `drawing_${date}`;
  }

  async initDatabase(): Promise<void> {
    // No initialization needed for AsyncStorage
    console.log('Web database service initialized');
  }

  async saveDrawing(date: string, drawingData: any[]): Promise<void> {
    try {
      const key = await this.getStorageKey(date);
      const dataString = JSON.stringify(drawingData);
      const timestamp = new Date().toISOString();

      const drawing: Drawing = {
        date,
        data: dataString,
        created_at: timestamp,
        updated_at: timestamp,
      };

      await AsyncStorage.setItem(key, JSON.stringify(drawing));
      console.log('Drawing saved for date:', date);
    } catch (error) {
      console.error('Error saving drawing:', error);
      throw error;
    }
  }

  async loadDrawing(date: string): Promise<any[]> {
    try {
      const key = await this.getStorageKey(date);
      const result = await AsyncStorage.getItem(key);

      if (result) {
        const drawing: Drawing = JSON.parse(result);
        return JSON.parse(drawing.data);
      }

      return [];
    } catch (error) {
      console.error('Error loading drawing:', error);
      return [];
    }
  }

  async getAllDrawingDates(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const drawingKeys = keys.filter((key) => key.startsWith('drawing_'));
      const dates = drawingKeys.map((key) => key.replace('drawing_', ''));
      return dates.sort().reverse(); // Most recent first
    } catch (error) {
      console.error('Error getting drawing dates:', error);
      return [];
    }
  }

  async deleteDrawing(date: string): Promise<void> {
    try {
      const key = await this.getStorageKey(date);
      await AsyncStorage.removeItem(key);
      console.log('Drawing deleted for date:', date);
    } catch (error) {
      console.error('Error deleting drawing:', error);
      throw error;
    }
  }

  async hasDrawing(date: string): Promise<boolean> {
    try {
      const key = await this.getStorageKey(date);
      const result = await AsyncStorage.getItem(key);
      return result !== null;
    } catch (error) {
      console.error('Error checking if drawing exists:', error);
      return false;
    }
  }
}

export const webDatabaseService = new WebDatabaseService();
