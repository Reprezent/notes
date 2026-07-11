import { JournalTypeId } from './JournalTypes';

export interface ImportedJournalContent {
  date: string;
  journalType: JournalTypeId;
  sourceImageUri: string;
  transcribedText: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CaptureImportResult {
  sourceImageUri: string;
}

export interface SvgTextLine {
  text: string;
  x: number;
  y: number;
}
