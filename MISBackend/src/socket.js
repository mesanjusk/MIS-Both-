const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const Users = require('./repositories/users');
const { resolveSession } = require('./middleware/auth');
const { tierFor } = require('./utils/roleHierarchy');

// Streams a socket may be subscribed to, each gated on a permission.
const ROOM_WHATSAPP = 'stream:whatsapp';
const ROOM_SOCIAL   = 'stream:social';

// How often already-connected sockets are re-checked against their account.
const SESSION_SWEEP_MS = 5 * 60 * 1000;

let sessionSweep = null;
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

  // Require a valid JWT on every socket connection, and check the session
  // behind it — a signature alone does not say the account still exists or
  // still holds the access it was granted.
  ioInstance.use(async (socket, next) => {
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
      const session = await resolveSession(payload, null);

      socket.userId   = session.id;
      socket.userName = session.userName;
      socket.userGroup = session.userGroup;
      socket.tokenSv  = Number(payload.sv || 0);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  ioInstance.on("connection", async (socket) => {
    logger.info(`[socket.io] Client connected: ${socket.id} (user: ${socket.userName || 'unknown'})`);

    await joinPermittedRooms(socket);

    socket.on("disconnect", (reason) => {
      logger.info(`[socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  startSessionSweep();

  return ioInstance;
};

/**
 * Put the socket in the rooms its permissions allow.
 *
 * Every event used to go to every connected client, so a staff member who
 * should not see WhatsApp received each inbound message simply by holding a
 * valid token — the UI hiding the page changed nothing. A socket now receives
 * only the streams its account is permitted.
 */
async function joinPermittedRooms(socket) {
  try {
    const user = await Users.findById(socket.userId).select('permissions').lean();
    const permissions = user?.permissions || {};
    const isTier4 = tierFor(socket.userGroup) >= 4;

    // Permissive default, matching requirePermission: denied only when the flag
    // is explicitly false.
    const may = (flag) => isTier4 || permissions[flag] !== false;

    if (may('canViewWhatsapp')) socket.join(ROOM_WHATSAPP);
    if (may('canViewReports'))  socket.join(ROOM_SOCIAL);
  } catch (err) {
    // Fail closed: a socket whose permissions cannot be read joins nothing.
    logger.error(`[socket.io] Could not resolve rooms for ${socket.id}: ${err.message}`);
  }
}

/**
 * Disconnect sockets whose session has since been revoked.
 *
 * A socket authenticates once and can then stay open for days, so a password
 * change, demotion or deletion would not reach an already-connected client
 * without this sweep.
 */
function startSessionSweep() {
  if (sessionSweep) clearInterval(sessionSweep);

  sessionSweep = setInterval(async () => {
    if (!ioInstance) return;
    try {
      const sockets = await ioInstance.fetchSockets();
      for (const socket of sockets) {
        const user = await Users.findById(socket.userId).select('Session_version').lean();
        const revoked = !user || Number(user.Session_version || 0) !== Number(socket.tokenSv || 0);
        if (revoked) {
          logger.info(`[socket.io] Disconnecting ${socket.id}: session revoked`);
          socket.disconnect(true);
        }
      }
    } catch (err) {
      logger.error(`[socket.io] Session sweep failed: ${err.message}`);
    }
  }, SESSION_SWEEP_MS);

  // Don't hold the process open for the sweep alone.
  if (sessionSweep.unref) sessionSweep.unref();
}

const emitNewMessage = (message) => {
  if (!ioInstance) {
    logger.warn(
      "[socket.io] Cannot emit new_message because Socket.IO is not initialized yet"
    );
    return;
  }

  logger.info("[socket.io] Emitting new_message event");
  ioInstance.to(ROOM_WHATSAPP).emit("new_message", message);
};

// Used by the Social Media module (post submitted/approved/rejected/
// scheduled/published/failed, account needs reconnect). Reaches the sockets
// permitted the social stream, not every connected client.
const emitSocialEvent = (event, payload) => {
  if (!ioInstance) return;
  ioInstance.to(ROOM_SOCIAL).emit(`social:${event}`, payload);
};

module.exports = {
  initSocket,
  emitNewMessage,
  emitSocialEvent,
};
