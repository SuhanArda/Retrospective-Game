import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const value = (name: string, fallback: string) => {
    const resolved = env[name] || (mode !== 'production' ? fallback : '');
    if (command === 'build' && mode === 'production' && !resolved)
      throw new Error(`Missing required build-time environment variable: ${name}`);
    return JSON.stringify(resolved);
  };
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_PLATFORM_URL': value('VITE_PLATFORM_URL', 'http://localhost:5173'),
      'import.meta.env.VITE_API_URL': value('VITE_API_URL', 'http://localhost:5281'),
    },
  };
});
