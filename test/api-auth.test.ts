import assert from "node:assert/strict";
import test from "node:test";
import { createApiServer, InMemoryCatalog } from "../src/index.js";

test("login endpoint applies a per-IP and per-email attempt limit", async () => {
  let loginCalls = 0;
  const api = createApiServer({
    catalog: new InMemoryCatalog([]),
    rateLimit: { windowMs: 60_000, maxRequests: 100 },
    auth: {
      authenticate: async () => null,
      login: async (email) => {
        loginCalls += 1;
        return {
          token: "test-session-token-that-is-long-enough-1234567890",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          user: { id: "user-1", email, roles: ["customer"] },
        };
      },
    },
  });
  const port = await api.start(0);
  try {
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch("http://127.0.0.1:" + port + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "same@example.test", password: "password" }),
      });
      assert.equal(response.status, 200);
    }
    const limited = await fetch("http://127.0.0.1:" + port + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "same@example.test", password: "password" }),
    });
    assert.equal(limited.status, 429);
    assert.equal(loginCalls, 10);
  } finally {
    await api.stop();
  }
});
