import { describe, it, expect, vi } from "vitest";
import { createApp } from "./app.js";
import { getSeries } from "./series-service.js";

vi.mock("./series-service.js", () => ({ getSeries: vi.fn() }));

describe("GET /series", () => {
  it("rejects fractional days before resolving a series", async () => {
    const server = createApp().listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server port");
      const res = await fetch(`http://127.0.0.1:${address.port}/series?assets=BTC&days=1.5`);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
      expect(getSeries).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
