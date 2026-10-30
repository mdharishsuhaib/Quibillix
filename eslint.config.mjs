import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored pdf.js worker (minified third-party code)
    "public/pdf.worker.min.mjs",
    // Cloudflare Workers build output (generated)
    ".cloudflare/**",
    ".vinext/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
