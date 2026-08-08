const AppError = require('../../../utils/AppError');
const MetaFacebookProvider = require('./MetaFacebookProvider');
const MetaInstagramProvider = require('./MetaInstagramProvider');
const YouTubeProvider = require('./YouTubeProvider');
const LinkedInProvider = require('./LinkedInProvider');
const TikTokProvider = require('./TikTokProvider');

const providers = {
  facebook: new MetaFacebookProvider(),
  instagram: new MetaInstagramProvider(),
  youtube: new YouTubeProvider(),
  linkedin: new LinkedInProvider(),
  tiktok: new TikTokProvider(),
};

function getProvider(platform) {
  const provider = providers[platform];
  if (!provider) throw new AppError(`Unsupported platform "${platform}"`, 400);
  return provider;
}

module.exports = { providers, getProvider };
