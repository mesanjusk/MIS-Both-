const axios = require('axios');
const { Readable } = require('stream');
const cloudinary = require('../../utils/cloudinary');
const AppError = require('../../utils/AppError');
const SocialMediaAsset = require('../../repositories/SocialMediaAsset');

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

// Cloudinary always returns res.cloudinary.com / <cloud_name>.cloudinary.com
// hosted URLs — this is the trusted-host allowlist for the SSRF-safe fetch
// below. Never fetch an arbitrary caller-supplied URL server-side.
const TRUSTED_MEDIA_HOSTS = ['res.cloudinary.com'];

function assertTrustedMediaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid media URL', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw new AppError('Media URL must use https', 400);
  }
  const host = parsed.hostname.toLowerCase();
  const isTrusted = TRUSTED_MEDIA_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  if (!isTrusted) {
    throw new AppError(`Media URL host "${host}" is not an allowed trusted media host`, 400);
  }
  return parsed;
}

function uploadBufferToCloudinary({ buffer, kind, folder = 'social_media' }) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: kind === 'video' ? 'video' : 'image' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

async function uploadAsset({ file, user, source = 'upload', sourceRef = null }) {
  if (!file?.buffer) throw new AppError('No file uploaded', 400);

  const mime = file.mimetype || '';
  const isImage = ALLOWED_IMAGE_MIME.includes(mime);
  const isVideo = ALLOWED_VIDEO_MIME.includes(mime);
  if (!isImage && !isVideo) {
    throw new AppError(`Unsupported file type "${mime}". Allowed: JPEG/PNG/WEBP/GIF images or MP4/MOV/WEBM video.`, 400);
  }

  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    throw new AppError(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(maxBytes / 1024 / 1024)}MB.`, 400);
  }

  const kind = isVideo ? 'video' : 'image';
  const result = await uploadBufferToCloudinary({ buffer: file.buffer, kind });

  return SocialMediaAsset.create({
    kind,
    url: result.secure_url,
    thumbnailUrl: kind === 'video' ? result.thumbnail_url || null : result.secure_url,
    publicId: result.public_id,
    width: result.width || null,
    height: result.height || null,
    durationSeconds: result.duration || null,
    bytes: result.bytes || file.size,
    format: result.format || null,
    source,
    sourceRef,
    createdBy: user?.id || null,
    createdByName: user?.userName || null,
  });
}

async function deleteAsset(asset) {
  if (asset.publicId) {
    await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.kind === 'video' ? 'video' : 'image',
    });
  }
  await asset.deleteOne();
}

/**
 * downloadTrustedMediaBuffer — server-side fetch of a Cloudinary-hosted
 * asset for platforms whose API requires uploaded bytes rather than a
 * remote URL (e.g. YouTube resumable upload, TikTok/LinkedIn video upload).
 * SSRF-safe: only ever fetches URLs on the Cloudinary host allowlist above.
 */
async function downloadTrustedMediaBuffer(url) {
  assertTrustedMediaUrl(url);
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 0 });
  return {
    buffer: Buffer.from(response.data),
    mimeType: response.headers['content-type'] || '',
    contentLength: Number(response.headers['content-length']) || response.data.byteLength,
  };
}

/** Same as above but returns a readable stream — used for large video uploads to avoid buffering the whole file in memory. */
async function streamTrustedMedia(url) {
  assertTrustedMediaUrl(url);
  const response = await axios.get(url, { responseType: 'stream', timeout: 120000, maxRedirects: 0 });
  return {
    stream: response.data,
    mimeType: response.headers['content-type'] || '',
    contentLength: Number(response.headers['content-length']) || null,
  };
}

module.exports = {
  uploadAsset,
  deleteAsset,
  assertTrustedMediaUrl,
  downloadTrustedMediaBuffer,
  streamTrustedMedia,
};
