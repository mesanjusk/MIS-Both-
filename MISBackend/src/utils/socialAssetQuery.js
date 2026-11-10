const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const boundedPositiveInt = (value, fallback, max) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? Math.min(number, max) : fallback;
};

const buildSocialAssetQuery = (query = {}) => {
  const { kind, tag, campaign, createdBy, search } = query;
  const filter = {};
  if (kind) filter.kind = String(kind);
  if (tag) filter.tags = String(tag);
  if (campaign) filter.campaign = String(campaign);
  if (createdBy) filter.createdBy = String(createdBy);
  if (search) {
    const value = String(search).trim().slice(0, 100);
    if (value) filter.tags = { $regex: escapeRegex(value), $options: 'i' };
  }
  return {
    filter,
    pageNum: boundedPositiveInt(query.page, 1, 10000),
    limitNum: boundedPositiveInt(query.limit, 60, 200),
  };
};

module.exports = { buildSocialAssetQuery, escapeRegex, boundedPositiveInt };
