# Backend NestJS — imagen para desarrollo/local.
# Usamos Debian "slim" (no Alpine) porque Prisma necesita OpenSSL,
# que en Alpine falta y provoca el error "Could not parse schema engine response".
FROM node:20-slim

# OpenSSL requerido por el motor de Prisma.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependencias (se mantienen devDeps para migrate/seed en el arranque).
COPY package*.json ./
RUN npm install

# Genera el cliente de Prisma.
COPY prisma ./prisma
RUN npx prisma generate

# Copia el código y compila.
COPY . .
RUN npm run build \
  && echo "--- Contenido de dist/ tras el build ---" \
  && find dist -maxdepth 3 \
  && test -f dist/main.js || (echo "ERROR: no se generó dist/main.js" && exit 1)

EXPOSE 3000

# Por defecto: aplica migraciones pendientes y arranca (SIN seed, para no
# sembrar datos demo en producción). docker-compose sobreescribe este
# comando en local para además correr el seed (idempotente).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
