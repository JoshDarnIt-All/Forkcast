# Forkcast: one container, backend + static frontend.
# Multi-arch build (Mac arm64 -> server amd64):
#   docker buildx build --platform linux/amd64,linux/arm64 -t forkcast:latest .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    FORKCAST_DATA=/data FORKCAST_FRONTEND=/app/frontend

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/app /app/backend/app
COPY frontend /app/frontend

RUN useradd --create-home --uid 1000 forkcast && mkdir -p /data && chown forkcast:forkcast /data
USER forkcast
WORKDIR /app/backend
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
