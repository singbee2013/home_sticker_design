# ---------- Stage 1: build the Vue3 SPA ----------
FROM node:22-alpine AS web-build
WORKDIR /web
# Install deps using lockfile if present
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- Stage 2: Python runtime ----------
FROM python:3.13-slim AS runtime

# OS-level deps for Pillow / moviepy / fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libjpeg62-turbo libpng16-16 libfreetype6 \
        ffmpeg fonts-noto-cjk fonts-dejavu-core \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (better layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Backend source
COPY app ./app
COPY config ./config
COPY scripts ./scripts
COPY main.py ./

# Pre-built frontend
COPY --from=web-build /web/dist ./web/dist

# Persistent dirs
RUN mkdir -p /app/data /app/static/generated /app/static/uploads

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

EXPOSE 8080

# Liveness — lightweight route (no DB/auth); avoids false unhealthy when /api/ai/providers changes
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

# Single-process: FastAPI + Vue3 SPA
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
