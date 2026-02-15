# Use official Python runtime
FROM python:3.10-slim

# Set working directory to /app
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements from root context
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code into /app/backend
COPY backend/ ./backend/

# Expose port
EXPOSE 8000

# Run uvicorn with module path
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
