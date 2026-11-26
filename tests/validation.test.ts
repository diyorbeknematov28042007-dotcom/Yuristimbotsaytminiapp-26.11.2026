import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  registerSchema,
  specialStartSchema,
} from "../packages/shared/src/index";
describe("public input validation", () => {
  it("normalizes usernames and rejects invalid credentials and codes", () => {
    expect(usernameSchema.parse("  My_User  ")).toBe("my_user");
    expect(usernameSchema.safeParse("telegram @name").success).toBe(false);
    expect(
      registerSchema.safeParse({
        username: "valid_user",
        password: "short",
        displayName: "Name",
        language: "uz",
      }).success,
    ).toBe(false);
    expect(specialStartSchema.safeParse({ code: "12345a" }).success).toBe(
      false,
    );
  });
});
