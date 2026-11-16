import { api } from '../lib/api';
import type {
  OrderPreview,
  Paginated,
  ProductionOrder,
  ProductionOrderStatus,
} from '../types';

export interface OrderFilters {
  fechaDesde?: string;
  fechaHasta?: string;
  farmId?: string;
  status?: ProductionOrderStatus;
  documentNumber?: string;
  page?: number;
  pageSize?: number;
}

export const previewOrder = (params: { date: string; farmId: string }) =>
  api.get<OrderPreview>('/production-orders/preview', { params }).then((r) => r.data);

// Abre la orden del día (sin totales).
export const openOrder = (body: { date: string; farmId: string }) =>
  api.post<ProductionOrder>('/production-orders', body).then((r) => r.data);

// "Cerrar y calcular": totales con todos los registros de la finca ese día.
export const closeOrder = (id: string) =>
  api.post<ProductionOrder>(`/production-orders/${id}/close`).then((r) => r.data);

export const listOrders = (params?: OrderFilters) =>
  api.get<Paginated<ProductionOrder>>('/production-orders', { params }).then((r) => r.data);

export const getOrder = (id: string) =>
  api.get<ProductionOrder>(`/production-orders/${id}`).then((r) => r.data);

export const acceptOrder = (id: string) =>
  api.post<ProductionOrder>(`/production-orders/${id}/accept`).then((r) => r.data);
