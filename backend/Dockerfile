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
RUN npm run build

EXPOSE 3000

# El comando real (migrate + seed + start) lo define docker-compose.
CMD ["node", "dist/main.js"]
