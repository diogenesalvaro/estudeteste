
export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  data: string; // Base64 string
  notes?: string; // Anotações específicas do arquivo
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  files: StoredFile[];
  messages: Message[];
  notes: string; // Campo para anotações da matéria (geral)
  flashcards?: Flashcard[];
  createdAt: number;
}

export interface Concurso {
  id: string;
  name: string;
  file: StoredFile;
  analysis: string; // Markdown analysis from Gemini
  messages: Message[]; // Chat history about the edict
  createdAt: number;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SUBJECTS = 'SUBJECTS',
  SUBJECT_DETAIL = 'SUBJECT_DETAIL',
  REVIEW = 'REVIEW',
  CONCURSOS = 'CONCURSOS',
  CONCURSO_DETAIL = 'CONCURSO_DETAIL',
}

export interface StudyStats {
  totalMinutes: number;
  sessionsCompleted: number; // Pomodoros completed
  lastStudyDate: number;
}

export interface UserProfile {
  email: string;
  name: string;
  avatar?: string;
}