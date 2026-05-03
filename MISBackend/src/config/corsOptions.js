/**
 * CORS configuration
 *
 * Reads allowed origins from multiple env vars (all comma-separated):
 *   ALLOWED_ORIGINS      — primary list  e.g. https://dash.sanjusk.in
 *   FRONTEND_URL         — single URL fallback (already set in your .env)
 *   SOCKET_IO_CORS_ORIGIN — socket origin (already set in your .env)
 *
 * Set at least one of these on Render.com.
 * localhost origins are always allowed in non-production.
 */
const getAllowedOrigins = () => {
  const sources = [
    process.env.ALLOWED_ORIGINS     || '',
    process.env.FRONTEND_URL        || '',
    process.env.SOCKET_IO_CORS_ORIGIN || '',
  ];

  const list = sources
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);

  // Always allow localhost in non-production
  if (process.env.NODE_ENV !== 'production') {
    ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'].forEach((o) => {
      if (!list.includes(o)) list.push(o);
    });
  }

  return list;
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();

    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    // In non-production with no origins configured, allow all (dev convenience)
    if (process.env.NODE_ENV !== 'production' && allowed.length === 0) {
      return callback(null, true);
    }

    return callback(
      new Error(
        `CORS blocked: ${origin} is not in ALLOWED_ORIGINS. ` +
        `Current allowed: [${allowed.join(', ')}]`
      )
    );
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
