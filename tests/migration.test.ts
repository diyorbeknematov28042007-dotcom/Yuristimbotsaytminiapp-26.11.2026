import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

describe("initial migration", () => {
  it("creates the required tables and enforces identity and challenge constraints", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    for (const table of [
      "users",
      "user_profiles",
      "user_credentials",
      "telegram_identities",
      "special_login_identifiers",
      "login_challenges",
      "sessions",
      "bot_states",
      "conversations",
      "messages",
      "security_events",
    ])
      expect(tables).toContain(table);
    db.prepare("INSERT INTO users(id,username) VALUES(?,?)").run(
      "u1",
      "testuser",
    );
    expect(() =>
      db
        .prepare("INSERT INTO users(id,username) VALUES(?,?)")
        .run("u2", "TESTUSER"),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO telegram_identities(telegram_user_id,user_id) VALUES(?,?)",
        )
        .run("1", "missing"),
    ).toThrow();
    db.prepare(
      "INSERT INTO login_challenges(id,user_id,browser_nonce_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
    ).run("c1", "u1", "nonce1", "pending", 9999999999, 1);
    expect(() =>
      db
        .prepare(
          "INSERT INTO login_challenges(id,user_id,browser_nonce_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run("c2", "u1", "nonce2", "pending", 9999999999, 1),
    ).toThrow();
    db.prepare("UPDATE login_challenges SET status='used' WHERE id='c1'").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO login_challenges(id,user_id,browser_nonce_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run("c2", "u1", "nonce2", "pending", 9999999999, 1),
    ).not.toThrow();
    db.close();
  });
});
