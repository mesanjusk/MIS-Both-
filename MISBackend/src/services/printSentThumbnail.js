const MAX_FILE_BYTES = 12 * 1024 * 1024;
const PREVIEW_SIZE = 160;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif']);
const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'gif']);
let pdfLibrary;

async function pdfThumbnail(bytes) {
  const canvas = require('@napi-rs/canvas');
  pdfLibrary ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = await pdfLibrary;
  const loading = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
    maxImageSize: 16_000_000,
    canvasMaxAreaInBytes: 16_000_000,
  });
  try {
    const document = await loading.promise;
    const page = await document.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(original.width, original.height));
    const viewport = page.getViewport({ scale });
    const surface = canvas.createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    await page.render({ canvasContext: surface.getContext('2d'), viewport }).promise;
    return surface.toBuffer('image/jpeg', 75);
  } finally {
    await loading.destroy();
  }
}

async function makeThumbnail(gmail, messageId, part, options) {
  const mimeType = String(part.mimeType || '').toLowerCase();
  if (mimeType !== 'application/pdf' && !IMAGE_TYPES.has(mimeType)) return '';
  if (!part.body?.size || part.body.size > MAX_FILE_BYTES) return '';
  try {
    let encoded = part.body.data;
    if (!encoded && part.body.attachmentId) {
      const result = await gmail.users.messages.attachments.get({
        userId: 'me', messageId, id: part.body.attachmentId, fields: 'data',
      }, options);
      encoded = result.data?.data;
    }
    if (!encoded || encoded.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4) return '';
    const bytes = Buffer.from(encoded, 'base64url');
    let thumbnail;
    if (mimeType === 'application/pdf') {
      thumbnail = await pdfThumbnail(bytes);
    } else {
      const sharp = require('sharp');
      const image = sharp(bytes, { limitInputPixels: 40_000_000 });
      if (!IMAGE_FORMATS.has((await image.metadata()).format)) return '';
      thumbnail = await image.rotate().resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' }).jpeg({ quality: 72 }).toBuffer();
    }
    return thumbnail.length <= 24_000 ? thumbnail.toString('base64') : '';
  } catch {
    return '';
  }
}

module.exports = { makeThumbnail };
