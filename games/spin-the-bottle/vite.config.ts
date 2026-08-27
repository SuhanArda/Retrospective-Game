import { createRequire } from "node:module";
import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);
const tailwindCssEntry = require.resolve("tailwindcss/index.css");

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const deployTarget = process.env.DEPLOY_TARGET || env.DEPLOY_TARGET || "cloudflare";
  if (deployTarget !== "cloudflare" && deployTarget !== "node") {
    throw new Error('DEPLOY_TARGET must be either "cloudflare" or "node"');
  }
  const isCloudflare = deployTarget === "cloudflare";
  const publicValue = (name: string, developmentValue: string) => {
    const value = process.env[name] || env[name] || (mode !== "production" ? developmentValue : "");
    if (mode === "production" && value) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`${name} must be an absolute HTTPS URL for a production build`);
      }
    }
    return JSON.stringify(value);
  };
  const deploymentPlugin = command !== "build"
    ? null
    : isCloudflare
      ? (await import("@cloudflare/vite-plugin")).cloudflare({
          viteEnvironment: {
            name: "rsc",
            childEnvironments: ["ssr"],
          },
        })
      : (await import("nitro/vite")).nitro();

  return {
    plugins: [
      vinext(),
      ...(deploymentPlugin ? [deploymentPlugin] : []),
    ],
    resolve: {
      alias: [{ find: /^tailwindcss$/, replacement: tailwindCssEntry }],
    },
    ...(command === "build" && isCloudflare ? { ssr: { target: "webworker" as const } } : {}),
    define: {
      "import.meta.env.VITE_API_URL": publicValue("VITE_API_URL", "http://localhost:5281"),
      "import.meta.env.VITE_PLATFORM_URL": publicValue("VITE_PLATFORM_URL", "http://localhost:5173"),
    },
  };
});
