const { Server } = require("socket.io");
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

  ioInstance.on("connection", (socket) => {
    logger.info(`[socket.io] Client connected: ${socket.id}`);

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
