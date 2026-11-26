import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  passwordHash,
  verifyPassword,
  verifyTelegramInitData,
} from "../apps/api/src/crypto";

describe("credential protection", () => {
  it("derives a salted password hash and rejects a wrong password", async () => {
    const hashed = await passwordHash("a-long-test-password-123");
    expect(hashed.iterations).toBeGreaterThanOrEqual(600000);
    expect(hashed.hash).not.toContain("a-long-test-password-123");
    expect(
      await verifyPassword(
        "a-long-test-password-123",
        hashed.salt,
        hashed.iterations,
        hashed.hash,
      ),
    ).toBe(true);
    expect(
      await verifyPassword(
        "wrong-password",
        hashed.salt,
        hashed.iterations,
        hashed.hash,
      ),
    ).toBe(false);
  });
  it("verifies Telegram initData with the official two-stage HMAC and freshness", async () => {
    const botToken = "TEST:token";
    const user = JSON.stringify({ id: 1234567, first_name: "Test" });
    const date = String(Math.floor(Date.now() / 1000));
    const check = `auth_date=${date}\nuser=${user}`;
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const hash = createHmac("sha256", secret).update(check).digest("hex");
    const data = new URLSearchParams({
      auth_date: date,
      user,
      hash,
    }).toString();
    expect(await verifyTelegramInitData(data, botToken)).toBe(1234567);
    expect(
      await verifyTelegramInitData(data.replace("Test", "Tampered"), botToken),
    ).toBeNull();
    const old = String(Math.floor(Date.now() / 1000) - 7200);
    const oldCheck = `auth_date=${old}\nuser=${user}`;
    const oldHash = createHmac("sha256", secret).update(oldCheck).digest("hex");
    expect(
      await verifyTelegramInitData(
        new URLSearchParams({ auth_date: old, user, hash: oldHash }).toString(),
        botToken,
      ),
    ).toBeNull();
  });
});
