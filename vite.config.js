import { defineConfig, loadEnv } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [uni()],
    server: {
      proxy: {
        '/api': {
          target: env.AIO_API_PROXY_TARGET || 'http://127.0.0.1:45678',
          changeOrigin: true,
        },
      },
    },
  };
});
