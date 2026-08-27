import { api } from '../lib/api';
import type {
  ActiveAssignment,
  AssignmentHistoryRow,
  MyOperationalStatus,
  OperationalContext,
  PositionConfig,
} from '../types';

/** Estado del usuario actual (quién firma / si está bloqueado). */
export const getMyOperationalStatus = () =>
  api.get<MyOperationalStatus>('/operational/my-status').then((r) => r.data);

/** Trabajadores activos por contexto (panel admin). */
export const listActiveAssignments = () =>
  api.get<ActiveAssignment[]>('/operational/assignments').then((r) => r.data);

export const assignWorker = (context: OperationalContext, workerId: string) =>
  api
    .post<ActiveAssignment>('/operational/assignments', { context, workerId })
    .then((r) => r.data);

export const clearAssignment = (context: OperationalContext) =>
  api.delete<ActiveAssignment>(`/operational/assignments/${context}`).then((r) => r.data);

export const getAssignmentHistory = (context: OperationalContext) =>
  api
    .get<AssignmentHistoryRow[]>(`/operational/assignments/${context}/history`)
    .then((r) => r.data);

// ---- Configuración de posiciones (super admin) ----
export const getPositions = () =>
  api.get<PositionConfig[]>('/operational/positions').then((r) => r.data);

export const setPosition = (body: {
  context: OperationalContext;
  enabled: boolean;
  requiresAssignedWorker: boolean;
}) => api.put<PositionConfig>('/operational/positions', body).then((r) => r.data);
