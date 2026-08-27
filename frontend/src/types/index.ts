import type { WeightUnit } from '../lib/weight';
export type { WeightUnit };

export type Role = 'SUPER_ADMIN' | 'ADMIN_TENANT' | 'OPERADOR_COSECHA' | 'LECTOR';
export type Status = 'ACTIVE' | 'INACTIVE';
export type HarvestStatus = 'ACTIVE' | 'CANCELLED';

// Estrategia de identidad de la empresa.
export type IdentityStrategy = 'NAMED_USERS' | 'SHARED_OPERATIONAL_USERS' | 'HYBRID';
// Contextos operativos (posiciones físicas que ocupa un trabajador activo).
export type OperationalContext = 'HARVEST_WEIGHING' | 'POSTHARVEST_AUTHORIZATION';

/** Identidad efectiva mostrada en un documento (usuario o trabajador asignado). */
export interface ActorView {
  userId: string;
  workerId: string | null;
  displayName: string | null;
  source: 'USER' | 'ASSIGNED_WORKER';
}

export interface AuthUser {
  id: string;
  nombre?: string;
  email: string;
  role: Role;
  tenantId: string | null;
  operationalContext?: OperationalContext | null;
  // Permisos efectivos resueltos por el backend (rol o override).
  permissions?: string[];
  tenant?: {
    id: string;
    nombre: string;
    status: Status;
    weightUnit?: WeightUnit;
    identityStrategy?: IdentityStrategy;
  } | null;
}

export interface Tenant {
  id: string;
  nombre: string;
  nit?: string | null;
  status: Status;
  weightUnit: WeightUnit;
  identityStrategy: IdentityStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  tenantId: string;
  nombre: string;
  ubicacion?: string | null;
  status: Status;
}

export interface UserRow {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  role: Role;
  status: Status;
  operationalContext?: OperationalContext | null;
}

// -------------------- Identidad operativa --------------------

/** Trabajador activo (o ausente) de un contexto operativo. */
export interface ActiveAssignment {
  context: OperationalContext;
  assignmentId: string | null;
  worker: { id: string; nombre: string; codigoInterno: string } | null;
}

export interface PositionConfig {
  id: string;
  context: OperationalContext;
  enabled: boolean;
  requiresAssignedWorker: boolean;
}

/** Estado del usuario actual respecto a su contexto operativo. */
export interface MyOperationalStatus {
  operationalContext: OperationalContext | null;
  requiresWorker: boolean;
  activeWorker: { id: string; nombre: string; codigoInterno: string } | null;
}

export interface AssignmentHistoryRow {
  id: string;
  context: OperationalContext;
  workerId: string;
  active: boolean;
  validFrom: string;
  validTo: string | null;
  assignedByUserId: string | null;
}

/** Permisos efectivos + override de un usuario. */
export interface UserPermissions {
  role: Role;
  usesTemplate: boolean;
  effective: string[];
  override: string[];
}

export interface Worker {
  id: string;
  tenantId: string;
  farmId: string;
  codigoInterno: string;
  nombre: string;
  documento?: string | null;
  areaTrabajo?: string | null;
  status: Status;
}

export interface Lot {
  id: string;
  tenantId: string;
  farmId: string;
  nombreLote: string;
  variedad: string;
  numeroPlantas?: number | null;
  status: Status;
}

export interface Container {
  id: string;
  tenantId: string;
  nombre: string;
  pesoGramos: number;
  status: Status;
}

export interface Quality {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion?: string | null;
  visibleEnCosecha: boolean;
  status: Status;
}

export interface FieldConfigEntry {
  fieldName: string;
  isVisible: boolean;
  isRequired: boolean;
}

export interface HarvestContainer {
  id: string;
  containerId: string;
  unidades: number;
  pesoUnitarioGramos: number;
  pesoTotalGramos: number;
  container?: { id: string; nombre: string };
}

export interface HarvestRecord {
  id: string;
  fecha: string;
  variedad: string;
  pesoBrutoGramos: number;
  pesoTotalRecipientesGramos: number;
  gramosCosechados: number;
  status: HarvestStatus;
  primeraFila?: string | null;
  ultimaFila?: string | null;
  estadoRoja?: boolean | null;
  observaciones?: string | null;
  farm?: { id: string; nombre: string };
  worker?: { id: string; codigoInterno: string; nombre: string };
  lot?: { id: string; nombreLote: string; variedad?: string };
  quality?: { id: string; nombre: string };
  containers?: HarvestContainer[];
  creator?: { id: string; nombre: string; email: string } | null;
  updater?: { id: string; nombre: string; email: string } | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// -------------------- Documentos de cosecha --------------------

export type RemissionStatus = 'PENDIENTE_RECEPCION' | 'RECIBIDA' | 'ANULADA';
export type ProductionOrderStatus = 'PENDIENTE_ACEPTACION' | 'ACEPTADA' | 'ANULADA';

export interface QualityLine {
  qualityId: string;
  qualityNombre?: string | null;
  pesoGramos: number;
  pesoKg: number;
  canastillas: number;
}
export interface LotLine {
  lotId: string;
  lotNombre?: string | null;
  pesoGramos: number;
  pesoKg: number;
  canastillas: number;
}

export type RemissionDetailStatus = 'PENDIENTE_RECEPCION' | 'RECIBIDA' | 'RECHAZADA';

// Detalle de remisión: una fila por calidad (dentro del lote de la remisión).
export interface RemissionQualityDetail extends QualityLine {
  id: string;
  status: RemissionDetailStatus;
  receivedByNombre?: string | null;
  receivedAt?: string | null;
}

// Detalle base por Lote + Calidad (órdenes de producción).
export interface LotQualityLine {
  lotId: string;
  lotNombre?: string | null;
  qualityId: string;
  qualityNombre?: string | null;
  pesoGramos: number;
  pesoKg: number;
  canastillas: number;
}

export interface RemissionPreview {
  fecha: string;
  farm: { id: string; nombre: string };
  lot: { id: string; nombreLote: string };
  totalPesoGramos: number;
  totalPesoKg: number;
  totalCanastillas: number;
  registrosIncluidos: number;
  byQuality: QualityLine[];
  yaExiste: { id: string; documentNumber: string; status: RemissionStatus } | null;
}

export interface Remission {
  id: string;
  documentNumber: string;
  sequenceNumber: number;
  fecha: string;
  status: RemissionStatus;
  farmId: string;
  lotId: string;
  totalPesoGramos: number;
  totalPesoKg: number;
  totalCanastillas: number;
  registrosIncluidos: number;
  createdAt: string;
  createdByNombre?: string | null;
  receivedAt?: string | null;
  receivedByNombre?: string | null;
  // Identidad efectiva estructurada (usuario o trabajador que firmó).
  createdBy?: ActorView | null;
  receivedBy?: ActorView | null;
  farmNombre?: string | null;
  lotNombre?: string | null;
  details?: RemissionQualityDetail[];
}

export interface OrderPreview {
  fecha: string;
  farm: { id: string; nombre: string };
  totalPesoGramos: number;
  totalPesoKg: number;
  totalCanastillas: number;
  lotesIncluidos: number;
  registrosIncluidos: number;
  byQuality: QualityLine[];
  byLot: LotLine[];
  yaExiste: { id: string; documentNumber: string; status: ProductionOrderStatus } | null;
}

export interface ProductionOrder {
  id: string;
  documentNumber: string;
  sequenceNumber: number;
  fecha: string;
  status: ProductionOrderStatus;
  farmId: string;
  totalPesoGramos: number;
  totalPesoKg: number;
  totalCanastillas: number;
  lotesIncluidos: number;
  registrosIncluidos: number;
  createdAt: string;
  createdByNombre?: string | null;
  acceptedAt?: string | null;
  acceptedByNombre?: string | null;
  createdBy?: ActorView | null;
  acceptedBy?: ActorView | null;
  farmNombre?: string | null;
  qualityDetails?: QualityLine[];
  lotDetails?: LotLine[];
  lotQualityDetails?: LotQualityLine[];
  remisiones?: { id: string; documentNumber: string; status: RemissionStatus }[];
}

export interface DocumentSequence {
  id: string;
  documentType: 'REMISSION' | 'PRODUCTION_ORDER';
  prefix: string;
  paddingLength: number;
  currentNumber: number;
  year?: number | null;
  farmId?: string | null;
  active: boolean;
}
