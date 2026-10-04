import { defineConfig, loadEnv } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { weixinSubpackageVendors } from './scripts/weixin-subpackage-vendors.mjs';
import { appVendors } from './scripts/app-vendors.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Freeze the package timestamp at build time, independent of the build host's timezone.
  const buildTime = command === 'build' && process.env.NODE_ENV === 'production'
    ? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    : '';
  return {
    define: {
      'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(buildTime),
    },
    plugins: [weixinSubpackageVendors(), appVendors(), uni()],
    // Compile object rest/spread before DevTools Babel; its helper modules are
    // otherwise missing from lazy-loaded subpackages. Keep other targets intact.
    ...(process.env.UNI_PLATFORM === 'mp-weixin' ? {
      build: { target: 'es2017' },
    } : {}),
    server: {
      proxy: {
        '/leetcode-api': {
          target: 'https://leetcode.cn', changeOrigin: true,
          rewrite: path => path.replace(/^\/leetcode-api/, ''),
          configure: proxy => proxy.on('proxyReq', (proxyReq, request) => {
            proxyReq.setHeader('Referer', 'https://leetcode.cn/');
            proxyReq.setHeader('Origin', 'https://leetcode.cn');
            if (request.headers['x-leetcode-cookie']) proxyReq.setHeader('Cookie', request.headers['x-leetcode-cookie']);
            proxyReq.removeHeader('x-leetcode-cookie');
          }),
        },
        '/api': {
          target: env.AIO_API_PROXY_TARGET || 'http://127.0.0.1:45678',
          changeOrigin: true,
        },
      },
    },
  };
});
