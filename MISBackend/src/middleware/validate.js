const { z } = require('zod');
const AppError = require('../utils/AppError');

/**
 * Express middleware factory for Zod schema validation.
 * Usage:
 *   router.post('/items', validate({ body: itemSchema }), handler)
 *   router.get('/items/:id', validate({ params: z.object({ id: z.string() }) }), handler)
 */
const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) req.query = schemas.query.parse(req.query);
    return next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return next(new AppError(`Validation error: ${messages}`, 400));
    }
    return next(err);
  }
};

// ─── Common reusable schemas ───────────────────────────────────────────────────

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB ID');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

const phoneSchema = z.string().regex(/^\d{10,15}$/, 'Phone must be 10–15 digits');

// ─── Domain schemas ────────────────────────────────────────────────────────────

const orderStatusSchema = z.object({
  Task: z.string().min(1, 'Task is required'),
  Assigned: z.string().min(1, 'Assigned is required'),
  Delivery_Date: z.coerce.date(),
  CreatedAt: z.coerce.date().default(() => new Date()),
});

const whatsappSendSchema = z.object({
  accountId: z.string().min(1),
  to: phoneSchema,
  message: z.string().min(1).max(4096).optional(),
  templateName: z.string().optional(),
});

module.exports = {
  validate,
  mongoId,
  paginationSchema,
  phoneSchema,
  orderStatusSchema,
  whatsappSendSchema,
};
