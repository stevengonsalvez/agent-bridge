import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayKey = env.VERCEL_AI_GATEWAY_KEY || env.TYPESAFE_API_KEY || process.env.VERCEL_AI_GATEWAY_KEY || process.env.TYPESAFE_API_KEY || '';
  return {
    plugins: [react()],
    server: { port: 3000 },
    define: {
      'process.env.VERCEL_AI_GATEWAY_KEY': JSON.stringify(gatewayKey),
      'process.env.TYPESAFE_API_KEY': JSON.stringify(gatewayKey),
    },
  };
});
