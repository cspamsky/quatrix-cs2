# --- Build Stage ---
FROM node:20 AS builder

WORKDIR /app

# 1. Paket dosyalarını kopyala
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# 2. Kaynak kodları kopyala
COPY . .

# 3. Temizlik: Windows node_modules'ları yok et
RUN rm -rf node_modules client/node_modules server/node_modules

# 4. Kurulumu setup.js üzerinden yap (Linux içinde)
# setup.js zaten npm install yapıyor, bunu kullanabiliriz.
RUN node scripts/setup.js --non-interactive || true

# 5. Paketleri standart npm install ile garantile (setup.js başarısız olursa diye)
# --build-from-source KULLANMIYORUZ, prebuilt binary kullanılacak.
RUN npm install
RUN cd client && npm install
RUN cd server && npm install

# 6. Build
RUN npm run build

# --- Runtime Stage ---
FROM node:20-slim

WORKDIR /app

# SteamCMD ve diğer sistem gereksinimlerini kur
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    lib32gcc-s1 \
    lib32stdc++6 \
    libsdl2-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Dosyaları taşı
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/client/dist ./client/dist

# Klasör yapıları
RUN mkdir -p /app/server/data /app/plugin_pool

EXPOSE 3001

CMD ["npm", "start"]
