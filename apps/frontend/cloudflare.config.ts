import { bindings, defineConfig } from "cf/config";
export default defineConfig(({ mode }) => ({
  worker: {
    name:
      mode === "production-deploy"
        ? "yuristim-frontend"
        : "yuristim-p1-frontend-staging",
    entrypoint: "./src/worker.ts",
    compatibilityDate: "2026-11-26",
    env: {
      API: bindings.worker({
        worker:
          mode === "production-deploy"
            ? "yuristim-api"
            : "yuristim-p1-api-staging",
      }),
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*", "/health"],
    },
    observability: {
      enabled: true,
      traces: { enabled: true },
      redactQueryString: true,
    },
  },
}));
