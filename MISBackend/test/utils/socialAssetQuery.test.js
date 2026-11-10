const { buildSocialAssetQuery } = require('../../src/utils/socialAssetQuery');

describe('social asset list filters', () => {
  it('treats search as literal text, not caller-supplied regex', () => {
    expect(buildSocialAssetQuery({ search: 'sale(.*)' }).filter.tags).toEqual({
      $regex: 'sale\\(\\.\\*\\)', $options: 'i',
    });
  });

  it('bounds pagination and rejects invalid values', () => {
    expect(buildSocialAssetQuery({ page: 'Infinity', limit: '-12' })).toMatchObject({ pageNum: 1, limitNum: 60 });
    expect(buildSocialAssetQuery({ page: '99999', limit: '99999' })).toMatchObject({ pageNum: 10000, limitNum: 200 });
  });

  it('keeps the business filters', () => {
    expect(buildSocialAssetQuery({ kind: 'image', tag: 'offers', campaign: 'diwali' }).filter).toMatchObject({
      kind: 'image', tags: 'offers', campaign: 'diwali',
    });
  });
});
