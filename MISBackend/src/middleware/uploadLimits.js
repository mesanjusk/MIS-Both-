/**
 * Bounded multipart uploads.
 *
 * Uploads went into multer.memoryStorage() with no size limit at all on the
 * transaction and WhatsApp routes, and Gmail accepted 20 files of 100 MB each
 * — roughly 2 GB of payload held in the process before any overhead. The
 * express.json limit does not apply to multipart, so nothing bounded them.
 *
 * Two guards, because neither is sufficient alone: multer's own per-file limit
 * stops a single large file but not many of them, while a Content-Length check
 * refuses an oversized request before its body is read — though a chunked
 * request may not declare one.
 */
const multer = require('multer');
const AppError = require('../utils/AppError');

const MB = 1024 * 1024;

/**
 * Refuse a request whose declared size exceeds `maxBytes`, before reading it.
 */
const limitRequestSize = (maxBytes) => (req, _res, next) => {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) {
    return next(
      new AppError(
        `Upload is too large. The limit is ${Math.floor(maxBytes / MB)} MB per request.`,
        413
      )
    );
  }
  return next();
};

/**
 * A memory-storage multer instance with explicit limits and, where given, an
 * allow-list of content types.
 *
 * @param {object} opts
 * @param {number} opts.maxFileBytes   largest single file
 * @param {number} [opts.maxFiles]     how many files one request may carry
 * @param {string[]} [opts.allowedMimeTypes] permitted content types
 */
const createUpload = ({ maxFileBytes, maxFiles = 1, allowedMimeTypes }) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileBytes,
      files: maxFiles,
      // Bound the non-file parts too, so a request cannot carry unbounded
      // fields alongside its attachments.
      fields: 50,
      parts: maxFiles + 50,
    },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimeTypes || allowedMimeTypes.includes(file.mimetype)) {
        return cb(null, true);
      }
      return cb(
        new AppError(
          `${file.mimetype} is not an accepted file type here. Allowed: ${allowedMimeTypes.join(', ')}.`,
          415
        )
      );
    },
  });

/**
 * Translate multer's own errors into the API's shape.
 *
 * Mount after the routes; without it a file over the limit surfaces as an
 * unexplained 500.
 */
const uploadErrorHandler = (err, _req, _res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err);

  const messages = {
    LIMIT_FILE_SIZE:  'That file is larger than this endpoint accepts.',
    LIMIT_FILE_COUNT: 'Too many files in one request.',
    LIMIT_PART_COUNT: 'Too many parts in one request.',
    LIMIT_FIELD_COUNT:'Too many fields in one request.',
  };

  return next(new AppError(messages[err.code] || `Upload rejected: ${err.message}`, 413));
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

module.exports = { MB, createUpload, limitRequestSize, uploadErrorHandler, IMAGE_TYPES };
