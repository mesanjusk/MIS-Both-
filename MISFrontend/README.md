# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## PWA Support

This project includes a basic service worker and web app manifest for offline
capabilities. The service worker registers automatically and caches assets after
the initial load. Build the project and serve the `dist` directory with any
static server to test the PWA features locally.

The service worker uses a `stale-while-revalidate` strategy for same‑origin
requests. Cached resources are served instantly while an update runs in the
background to refresh the cache. All PWA icons and the manifest are preloaded so
the app remains installable even when offline.

Any non-GET requests made while the device is offline are stored in an
IndexedDB database and are retried automatically once connectivity returns. This
ensures user actions are preserved and synchronized with the server when a
connection is available. The queue is initialized in `main.jsx` via the
`initOfflineQueue` helper.
