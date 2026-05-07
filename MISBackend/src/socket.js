const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');

let ioInstance = null;

const getAllowedOrigins = () => {
  const sources = [
    process.env.ALLOWED_ORIGINS      || '',
    process.env.FRONTEND_URL         || '',
    process.env.SOCKET_IO_CORS_ORIGIN || '',
  ];

  const origins = sources
    .flatMap((s) => s.split(','))
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    if (!origins.includes('http://localhost:5173')) {
      origins.push('http://localhost:5173');
    }
  }

  return origins;
};

const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Require a valid JWT on every socket connection. The client must pass
  // the token in socket.auth.token (or Authorization header as a fallback).
  ioInstance.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
      logger.error('[socket.io] ACCESS_TOKEN_SECRET not set — rejecting connection');
      return next(new Error('Server misconfiguration'));
    }

    try {
      const payload = jwt.verify(token, secret);
      socket.userId = payload.id;
      socket.userName = payload.userName;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  ioInstance.on("connection", (socket) => {
    logger.info(`[socket.io] Client connected: ${socket.id} (user: ${socket.userName || 'unknown'})`);

    socket.on("disconnect", (reason) => {
      logger.info(`[socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
};

const emitNewMessage = (message) => {
  if (!ioInstance) {
    logger.warn(
      "[socket.io] Cannot emit new_message because Socket.IO is not initialized yet"
    );
    return;
  }

  logger.info("[socket.io] Emitting new_message event");
  ioInstance.emit("new_message", message);
};

module.exports = {
  initSocket,
  emitNewMessage,
};
