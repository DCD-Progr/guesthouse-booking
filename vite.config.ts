import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const raw = env.VITE_SUPABASE_URL;
  const api = raw ? new URL(raw).origin : "";
  const development = command === "serve";
  const csp = [
    "default-src 'self'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${development ? "ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");
  return {
    plugins: [
      react(),
      {
        name: "restrict-page-resources",
        transformIndexHtml() {
          return [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: csp },
              injectTo: "head-prepend",
            },
            {
              tag: "meta",
              attrs: { name: "referrer", content: "no-referrer" },
              injectTo: "head-prepend",
            },
          ];
        },
      },
    ],
    base: "./",
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            supabase: ["@supabase/supabase-js"],
            react: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
