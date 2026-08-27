import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionGuard } from './components/PermissionGuard';
import { Layout } from './components/Layout';
import { PERMS } from './lib/permissions';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import UsersPage from './pages/UsersPage';
import FarmsPage from './pages/FarmsPage';
import WorkersPage from './pages/WorkersPage';
import LotsPage from './pages/LotsPage';
import ContainersPage from './pages/ContainersPage';
import QualitiesPage from './pages/QualitiesPage';
import FieldConfigPage from './pages/FieldConfigPage';
import HarvestListPage from './pages/HarvestListPage';
import HarvestFormPage from './pages/HarvestFormPage';
import HarvestDetailPage from './pages/HarvestDetailPage';
import RemissionsPage from './pages/RemissionsPage';
import RemissionDetailPage from './pages/RemissionDetailPage';
import ProductionOrdersPage from './pages/ProductionOrdersPage';
import ProductionOrderDetailPage from './pages/ProductionOrderDetailPage';
import DocumentSequencesPage from './pages/DocumentSequencesPage';
import OperationalAssignmentsPage from './pages/OperationalAssignmentsPage';
import IdentityConfigPage from './pages/IdentityConfigPage';

// Acceder a remisiones/órdenes: basta CUALQUIER permiso del módulo
// (ver, crear, aprobar o rechazar).
const VIEW_REMISSIONS = [
  PERMS.HARVEST_REMISSIONS_VIEW,
  PERMS.HARVEST_REMISSIONS_CREATE,
  PERMS.POSTHARVEST_REMISSIONS_VIEW,
  PERMS.POSTHARVEST_REMISSIONS_APPROVE,
  PERMS.POSTHARVEST_REMISSIONS_REJECT,
];
const VIEW_ORDERS = [
  PERMS.HARVEST_PRODUCTION_ORDERS_VIEW,
  PERMS.HARVEST_PRODUCTION_ORDERS_CREATE,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Cosecha: registros por permiso granular */}
          <Route
            path="/harvest"
            element={
              <PermissionGuard allOf={[PERMS.HARVEST_RECORDS_VIEW]}>
                <HarvestListPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/harvest/new"
            element={
              <PermissionGuard allOf={[PERMS.HARVEST_RECORDS_CREATE]}>
                <HarvestFormPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/harvest/:id"
            element={
              <PermissionGuard allOf={[PERMS.HARVEST_RECORDS_VIEW]}>
                <HarvestDetailPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/harvest/:id/edit"
            element={
              <PermissionGuard allOf={[PERMS.HARVEST_RECORDS_UPDATE]}>
                <HarvestFormPage />
              </PermissionGuard>
            }
          />

          {/* Remisiones y Órdenes: visibles a cosecha o postcosecha */}
          <Route
            path="/harvest-remissions"
            element={
              <PermissionGuard anyOf={VIEW_REMISSIONS}>
                <RemissionsPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/harvest-remissions/:id"
            element={
              <PermissionGuard anyOf={VIEW_REMISSIONS}>
                <RemissionDetailPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/production-orders"
            element={
              <PermissionGuard anyOf={VIEW_ORDERS}>
                <ProductionOrdersPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/production-orders/:id"
            element={
              <PermissionGuard anyOf={VIEW_ORDERS}>
                <ProductionOrderDetailPage />
              </PermissionGuard>
            }
          />

          {/* Administración de la finca */}
          <Route
            path="/workers"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_WORKERS_MANAGE]}>
                <WorkersPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/operational"
            element={
              <PermissionGuard allOf={[PERMS.OPERATIONAL_ASSIGNMENTS_MANAGE]}>
                <OperationalAssignmentsPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/lots"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_LOTS_MANAGE]}>
                <LotsPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/containers"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_CONTAINERS_MANAGE]}>
                <ContainersPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/qualities"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_QUALITIES_MANAGE]}>
                <QualitiesPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/farms"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_FARMS_MANAGE]}>
                <FarmsPage />
              </PermissionGuard>
            }
          />

          {/* Administración global (plataforma) */}
          <Route
            path="/tenants"
            element={
              <PermissionGuard allOf={[PERMS.PLATFORM_TENANTS_MANAGE]}>
                <TenantsPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/users"
            element={
              <PermissionGuard allOf={[PERMS.ADMIN_USERS_MANAGE]}>
                <UsersPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/identity-config"
            element={
              <PermissionGuard allOf={[PERMS.CONFIG_IDENTITY_MANAGE]}>
                <IdentityConfigPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/field-config"
            element={
              <PermissionGuard allOf={[PERMS.CONFIG_HARVEST_MANAGE]}>
                <FieldConfigPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/document-sequences"
            element={
              <PermissionGuard allOf={[PERMS.CONFIG_SEQUENCES_MANAGE]}>
                <DocumentSequencesPage />
              </PermissionGuard>
            }
          />

          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
