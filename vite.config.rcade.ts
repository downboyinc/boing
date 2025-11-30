import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'rewrite-root-to-rcade',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/') {
            req.url = '/index-rcade.html'
          }
          next()
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index-rcade.html'),
      },
    },
    outDir: resolve(__dirname, 'dist-rcade'),
    emptyOutDir: true,
  },
})
