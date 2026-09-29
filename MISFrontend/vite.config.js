// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveReleaseInfo } from './src/utils/releaseMetadata.js'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
)

const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

// The squash-merge commit title contains "(#282)", and later merged PRs
// should follow the same convention. The UI shows the SHA instead of lying
// about a PR whenever commit metadata lacks a PR number.
const release = resolveReleaseInfo({
  env: process.env,
  message: git(['log', '-1', '--format=%B']),
  sha: git(['rev-parse', 'HEAD']),
  version: packageJson.version,
})

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-live-release-version',
      apply: 'build',
      closeBundle() {
        // public/version.json is copied first by Vite. Replace it with the
        // current bundle's SHA so the existing versionChecker can reload.
        writeFileSync(new URL('./dist/version.json', import.meta.url),
          JSON.stringify({ version: release.version, pr: release.pr, sha: release.sha }, null, 2))
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(release.version),
    __APP_RELEASE__: JSON.stringify(release),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setupTests.js',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui':   ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-charts': ['recharts'],
          'vendor-socket': ['socket.io-client'],
          'vendor-pdf':   ['jspdf', 'jspdf-autotable'],
          'vendor-xlsx':  ['xlsx'],
        },
      },
    },
  },
})
