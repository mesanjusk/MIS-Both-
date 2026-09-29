// Only a Final file that is not already linked/confirmed may create a new
// MIS order. Avoid an accidental second order for one Drive file.
export const canQuickCreateMisOrder = (file) => Boolean(
  file && Number(file.stageNumber) === 5 &&
  !file.matched && !file.orderUuid && !file.isTemporaryOrder
);
