import { OperationalContext, Role } from '@prisma/client';

/** Contenido del access token JWT. */
export interface JwtPayload {
  sub: string; // id del usuario
  email: string;
  role: Role;
  tenantId: string | null;
}

/** Usuario autenticado disponible en req.user. */
export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  tenantId: string | null;
  // Contexto operativo (si la cuenta es una cuenta operativa compartida).
  operationalContext: OperationalContext | null;
  // Permisos EFECTIVOS resueltos por request (plantilla de rol u override).
  permissions: string[];
}
