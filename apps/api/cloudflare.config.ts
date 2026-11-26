import { bindings, defineConfig } from "cf/config";
export default defineConfig(({ mode }) => ({
  worker: {
    name:
      mode === "production-deploy" ? "yuristim-api" : "yuristim-p1-api-staging",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-26",
    env: {
      DB: bindings.d1({
        name:
          mode === "production-deploy"
            ? "yuristim-db"
            : "yuristim-p1-db-staging",
      }),
      BOT_URL: bindings.text(
        mode === "production-deploy"
          ? "https://yuristim-bot.diyorbeknematov28042007.workers.dev"
          : "https://yuristim-p1-bot-staging.diyorbeknematov28042007.workers.dev",
      ),
      SESSION_PEPPER: bindings.secret(),
      BOT_INTERNAL_SECRET: bindings.secret(),
      TELEGRAM_BOT_TOKEN: bindings.secret(),
      ALLOWED_ORIGIN: bindings.text(
        mode === "production-deploy"
          ? "https://yuristim-frontend.diyorbeknematov28042007.workers.dev"
          : "https://yuristim-p1-frontend-staging.diyorbeknematov28042007.workers.dev",
      ),
    },
    observability: {
      enabled: true,
      traces: { enabled: true },
      redactQueryString: true,
    },
  },
}));
