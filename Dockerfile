# Utiliser l'image de base Node.js
FROM node:20-bullseye AS build

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    python3-pip \
    build-essential \ 
    libglib2.0-0 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
# Définir le répertoire de travail
WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm install --force

RUN npm install @prisma/client@5.12.0 prisma@5.12.0
RUN npm install mediasoup
RUN npm rebuild mediasoup 
# Copier le reste du projet
COPY . .

# Générer le client Prisma
RUN npx prisma generate

#RUN npx prisma migrate dev



# Stage 2: Runtime
FROM node:18-slim

# Install required runtime dependencies
RUN apt-get update && apt-get install -y \
    libsrtp2-1 \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy built app from the build stage
COPY --from=build /app /app

# Expose ports (change these according to your mediasoup config)
EXPOSE 5000 40000-40100/udp

# Lancer l'application
#CMD ["node", "index.js"]
CMD ["npm", "start"]
