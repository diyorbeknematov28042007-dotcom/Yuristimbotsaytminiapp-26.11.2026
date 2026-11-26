import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{3,23}$/,
    "4–24 belgili lotin harf, raqam yoki _ kiriting",
  );
export const passwordSchema = z
  .string()
  .min(12, "Kamida 12 belgi kiriting")
  .max(128);
export const displayNameSchema = z.string().trim().min(2).max(64);
export const languageSchema = z.enum(["uz", "ru", "en"]);
export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  language: languageSchema,
  botToken: z.string().optional(),
});
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string(),
});
export const profileSchema = z.object({ displayName: displayNameSchema });
export const settingsSchema = z.object({ language: languageSchema });
export const specialStartSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export const telegramInitSchema = z.object({ initData: z.string().max(4096) });
export type Account = {
  id: string;
  username: string;
  displayName: string;
  language: "uz" | "ru" | "en";
  telegramLinked: boolean;
  specialCode?: string;
  tutorialDone: boolean;
};
