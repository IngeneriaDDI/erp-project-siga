import { api } from '../lib/api';
import type { Paginated } from '../types';

export interface GoalMonth {
  month: number;
  gramosPlanta: string;
  kgPlanta: string;
  gramosLote: string;
  kgLote: string;
}

export interface GoalSummary {
  lotId: string;
  year: number;
  lotNombre: string | null;
  variedad?: string | null;
  farmId?: string | null;
  farmNombre: string | null;
  plantas: number | null;
  plantasActuales?: number | null;
  totalKgPlanta: string;
  totalKgLote: string;
  monthValueKg?: string | null;
  months: GoalMonth[];
  roundedCount?: number;
}

export interface GoalsQuery {
  page?: number;
  pageSize?: number;
  year?: number;
  month?: number;
  search?: string;
}

export interface GoalMonthInput {
  month: number;
  kgPerPlant: string;
}

export const listGoals = (params: GoalsQuery) =>
  api.get<Paginated<GoalSummary>>('/production-goals', { params }).then((r) => r.data);

export const createGoals = (body: { lotId: string; year: number; months: GoalMonthInput[] }) =>
  api.post<GoalSummary>('/production-goals', body).then((r) => r.data);

export const updateGoals = (lotId: string, year: number, months: GoalMonthInput[]) =>
  api.patch<GoalSummary>(`/production-goals/${lotId}/${year}`, { months }).then((r) => r.data);

export const deleteGoals = (lotId: string, year: number) =>
  api.delete(`/production-goals/${lotId}/${year}`).then((r) => r.data);
