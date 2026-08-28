const FeatureToggle = require('../repositories/featureToggle');
const { DEFAULT_FEATURE_TOGGLES } = require('../constants/defaultFeatureToggles');

/**
 * Insert the approved default-off rows without overriding an administrator's
 * later choice. An existing row — including one manually switched on — wins.
 */
async function ensureDefaultFeatureToggles() {
  if (!DEFAULT_FEATURE_TOGGLES.length) return { upsertedCount: 0 };

  const disabledAt = new Date();
  return FeatureToggle.bulkWrite(
    DEFAULT_FEATURE_TOGGLES.map(({ key, kind, note }) => ({
      updateOne: {
        filter: { key },
        update: {
          $setOnInsert: {
            key,
            kind,
            disabled: true,
            disabledAt,
            disabledBy: 'deployment default',
            note,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

module.exports = { ensureDefaultFeatureToggles };
