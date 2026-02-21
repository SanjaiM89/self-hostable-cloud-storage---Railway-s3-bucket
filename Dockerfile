# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for caching
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build with API URL pointing to same origin (served by backend)
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ==========================================
# Stage 2: Backend + Serve Frontend
# ==========================================
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install essentia (music analysis) - optional, may fail on some architectures
RUN pip install --no-cache-dir essentia || echo "Essentia not available for this platform, skipping..."

# Copy backend code
COPY backend/ ./

# Copy built frontend into a 'static' directory the backend can serve
COPY --from=frontend-builder /app/frontend/dist ./static

# Copy .env file if it exists (will be overridden by docker-compose env vars)
COPY .env* ./

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

# Run uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
