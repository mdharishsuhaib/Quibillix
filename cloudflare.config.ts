import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "quibillix",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-23",
    compatibilityFlags: ["global_fetch_strictly_public", "nodejs_compat"],
    observability: { enabled: true, logs: { enabled: true } },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // API keys are NOT declared here on purpose: add them as encrypted Secrets in the
      // Cloudflare dashboard (Worker -> Settings -> Variables and Secrets). With nodejs_compat
      // they appear on process.env automatically, and a missing optional key never blocks a deploy.
    },
  }),
});
