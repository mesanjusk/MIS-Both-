// Mirrors MISBackend/src/constants/social.js — kept minimal (frontend just
// needs the platform list + labels for selectors/badges).
export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'youtube', 'linkedin', 'tiktok'];

export const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
};

export const SOCIAL_CONTENT_TYPES = [
  { value: 'image', label: 'Image' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel / Short' },
  { value: 'text', label: 'Text only' },
];
