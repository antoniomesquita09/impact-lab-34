import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em dev o front roda no :5173 e o back no :8080. O proxy evita CORS e faz o
// caminho `/api/...` ser o mesmo em dev e em produção (onde o Go serve o dist).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // sem o back de pé o proxy erra; o api.js trata isso e cai no modo demonstração
        configure: (proxy) => proxy.on('error', () => {}),
      },
    },
  },
})
