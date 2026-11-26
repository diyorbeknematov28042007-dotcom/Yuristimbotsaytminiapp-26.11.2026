import { bindings, defineConfig } from "cf/config";
export default defineConfig(({ mode }) => ({
  worker: {
    name:
      mode === "production-deploy" ? "yuristim-bot" : "yuristim-p1-bot-staging",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-26",
    env: {
      API: bindings.worker({
        worker:
          mode === "production-deploy"
            ? "yuristim-api"
            : "yuristim-p1-api-staging",
      }),
      TELEGRAM_BOT_TOKEN: bindings.secret(),
      TELEGRAM_WEBHOOK_SECRET: bindings.secret(),
      BOT_INTERNAL_SECRET: bindings.secret(),
      FRONTEND_URL: bindings.text(
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
