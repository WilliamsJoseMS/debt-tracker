export interface Payment {
  id: string;
  debtId: string; // Links payment to specific debt
  date: string;
  amount: number;
  note: string;
}

export interface Debt {
  id: string;
  creditorName: string;
  totalAmount: number;
  startDate: string;
}

export interface AnalysisResult {
  message: string;
  estimatedCompletion?: string;
  tone: 'positive' | 'neutral' | 'concerned';
}