import { api } from '../lib/api';
import type { DocumentSequence } from '../types';

export const listSequences = () =>
  api.get<DocumentSequence[]>('/document-sequences').then((r) => r.data);

export const createSequence = (body: {
  documentType: 'REMISSION' | 'PRODUCTION_ORDER';
  prefix: string;
  paddingLength?: number;
  currentNumber?: number;
}) => api.post<DocumentSequence>('/document-sequences', body).then((r) => r.data);

export const updateSequence = (
  id: string,
  body: { prefix?: string; paddingLength?: number; currentNumber?: number; active?: boolean },
) => api.patch<DocumentSequence>(`/document-sequences/${id}`, body).then((r) => r.data);
