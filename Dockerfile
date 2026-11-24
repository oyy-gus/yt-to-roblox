FROM node:22-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && mkdir -p tmp

ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

CMD ["npm", "start"]
