/**
 * Uploads went into memory with no size limit at all on the transaction and
 * WhatsApp routes, and Gmail accepted 20 files of 100 MB each — roughly 2 GB
 * of payload held in the process. The express.json limit does not apply to
 * multipart, so nothing bounded any of it.
 */
const express = require('express');
const request = require('supertest');
const {
  MB, createUpload, limitRequestSize, uploadErrorHandler, IMAGE_TYPES,
} = require('../../src/middleware/uploadLimits');

const buildApp = ({ upload, maxRequestBytes, field = 'file' }) => {
  const app = express();
  if (maxRequestBytes) app.use(limitRequestSize(maxRequestBytes));
  app.post('/upload', upload.single(field), (req, res) =>
    res.json({ ok: true, size: req.file?.size || 0 }));
  app.use(uploadErrorHandler);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ message: err.message }));
  return app;
};

const bytes = (n) => Buffer.alloc(n, 'a');

describe('per-file size limits', () => {
  const upload = createUpload({ maxFileBytes: 1 * MB, allowedMimeTypes: IMAGE_TYPES });

  test('accepts a file inside the limit', async () => {
    const res = await request(buildApp({ upload }))
      .post('/upload')
      .attach('file', bytes(512 * 1024), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(512 * 1024);
  });

  test('refuses a file over the limit with 413, not an unexplained 500', async () => {
    const res = await request(buildApp({ upload }))
      .post('/upload')
      .attach('file', bytes(2 * MB), { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/larger than this endpoint accepts/i);
  });
});

describe('content-type allow-list', () => {
  const upload = createUpload({ maxFileBytes: 1 * MB, allowedMimeTypes: IMAGE_TYPES });

  test('refuses a type that is not on the list', async () => {
    const res = await request(buildApp({ upload }))
      .post('/upload')
      .attach('file', bytes(1024), { filename: 'x.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(415);
    expect(res.body.message).toMatch(/not an accepted file type/i);
  });

  test('accepts every image type on the list', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      const res = await request(buildApp({ upload }))
        .post('/upload')
        .attach('file', bytes(256), { filename: 'a', contentType: type });
      expect(res.status).toBe(200);
    }
  });

  test('an upload with no allow-list accepts any type', async () => {
    const anyType = createUpload({ maxFileBytes: 1 * MB });
    const res = await request(buildApp({ upload: anyType }))
      .post('/upload')
      .attach('file', bytes(256), { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
  });
});

describe('file count limits', () => {
  test('refuses more files than the endpoint allows', async () => {
    const upload = createUpload({ maxFileBytes: 1 * MB, maxFiles: 2 });
    const app = express();
    app.post('/upload', upload.array('files', 2), (req, res) => res.json({ n: req.files.length }));
    app.use(uploadErrorHandler);
    app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

    const req = request(app).post('/upload');
    for (let i = 0; i < 3; i += 1) {
      req.attach('files', bytes(128), { filename: `f${i}.png`, contentType: 'image/png' });
    }

    const res = await req;
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too many files/i);
  });
});

describe('whole-request size limit', () => {
  const upload = createUpload({ maxFileBytes: 10 * MB });

  test('refuses an oversized request before reading its body', async () => {
    const res = await request(buildApp({ upload, maxRequestBytes: 1 * MB }))
      .post('/upload')
      .attach('file', bytes(2 * MB), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/limit is 1 MB per request/i);
  });

  test('lets a request inside the limit through', async () => {
    const res = await request(buildApp({ upload, maxRequestBytes: 5 * MB }))
      .post('/upload')
      .attach('file', bytes(256 * 1024), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
  });
});
