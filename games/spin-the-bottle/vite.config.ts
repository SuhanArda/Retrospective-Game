import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const publicValue = (name: string, developmentValue: string) => {
    const value = env[name] || (mode !== "production" ? developmentValue : "");
    if (mode === "production" && value) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`${name} must be an absolute HTTPS URL for a production build`);
      }
    }
    return JSON.stringify(value);
  };
  return {
    plugins: [
      vinext(),
      ...(command === "build"
        ? [
            cloudflare({
              viteEnvironment: {
                name: "rsc",
                childEnvironments: ["ssr"],
              },
            }),
          ]
        : []),
    ],
    define: {
      "import.meta.env.VITE_API_URL": publicValue("VITE_API_URL", "http://localhost:5281"),
      "import.meta.env.VITE_PLATFORM_URL": publicValue("VITE_PLATFORM_URL", "http://localhost:5173"),
    },
  };
});
