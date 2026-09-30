import { describe, it, expect, vi } from "vitest";
import { createApp } from "./app.js";
import { fetchSeriesFromIngestor } from "./ingestor-client.js";

vi.mock("./ingestor-client.js", () => ({ fetchSeriesFromIngestor: vi.fn() }));

describe("GET /metrics", () => {
  it("rejects fractional days before fetching a series", async () => {
    const server = createApp().listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server port");
      const res = await fetch(`http://127.0.0.1:${address.port}/metrics?assets=BTC&days=1.5`);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
      expect(fetchSeriesFromIngestor).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
