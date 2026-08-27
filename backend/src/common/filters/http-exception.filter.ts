import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Convierte cualquier excepción en un JSON de error uniforme. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? message;
        error = (body.error as string) ?? exception.name;
      }
    } else if (isPrismaKnownError(exception)) {
      // Errores conocidos de Prisma → códigos HTTP claros.
      const mapped = mapPrismaError(exception);
      status = mapped.status;
      error = mapped.error;
      message = mapped.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${error}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function isPrismaKnownError(e: unknown): e is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string' &&
    (e as { code: string }).code.startsWith('P')
  );
}

function mapPrismaError(e: { code: string; meta?: Record<string, unknown> }): {
  status: number;
  error: string;
  message: string;
} {
  switch (e.code) {
    case 'P2002': {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'campo único';
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `Ya existe un registro con el mismo valor (${target}).`,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        error: 'NotFound',
        message: 'Registro no encontrado.',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'BadRequest',
        message: 'Referencia inválida a otra entidad.',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'DatabaseError',
        message: 'Error de base de datos.',
      };
  }
}
