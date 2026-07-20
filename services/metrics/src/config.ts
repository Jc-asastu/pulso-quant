export const config = {
  port: Number(process.env.PORT ?? 4002),
  ingestorBaseUrl: process.env.INGESTOR_BASE_URL ?? "http://localhost:4001",
  ingestorTimeoutMs: Number(process.env.INGESTOR_TIMEOUT_MS ?? 8000),
};
