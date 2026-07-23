import { createApp } from "./app.js";
import { config } from "./config.js";
import { createQueryable, getPool, migrate } from "./db.js";

async function start(): Promise<void> {
  // Ensure the schema exists before we accept traffic.
  await migrate(createQueryable(getPool()));

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[ingestor] listening on http://localhost:${config.port}`);
  });
}

start().catch((e) => {
  console.error("[ingestor] failed to start:", e);
  process.exit(1);
});
