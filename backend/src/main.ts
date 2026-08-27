import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(cookieParser());

  // Acepta uno o varios orígenes separados por coma (p. ej. 8080 en Docker, 5173 en dev).
  const corsOrigins = config
    .get<string>('CORS_ORIGIN', 'http://localhost:8080,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Validación global de DTOs de entrada (fuente de verdad del backend).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Formato de error uniforme.
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(config.get('PORT', 3000));
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API SIGA-DDI escuchando en el puerto ${port}`);
}

bootstrap();
