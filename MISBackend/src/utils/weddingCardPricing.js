// Wedding Card SKU pricing: the approved supplier catalogue rate gets exactly
// 10% markup (including decimal prices); job charges are additional per unit.
const DIGIT_CODE = Object.freeze({
  '1':'N', '2':'A', '3':'G', '4':'P', '5':'U',
  '6':'R', '7':'C', '8':'I', '9':'T', '0':'Y',
});
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const encodePrice = (value) => String(value).replace(/[0-9]/g, (digit) => DIGIT_CODE[digit]);
const markUpTenPercent = (originalPrice) => roundMoney(Number(originalPrice) * 1.1);
const withCalculatedPrices = (record) => {
  const originalPrice = Number(record.originalPrice) || 0;
  const printingCharge = Number(record.printingCharge) || 0;
  const packingCharge = Number(record.packingCharge) || 0;
  const designCharge = Number(record.designCharge) || 0;
  const updatedPrice = markUpTenPercent(originalPrice);
  return {
    ...record,
    codedPrice: encodePrice(originalPrice),
    updatedPrice,
    finalRate: roundMoney(updatedPrice + printingCharge + packingCharge + designCharge),
  };
};
module.exports = { roundMoney, encodePrice, markUpTenPercent, withCalculatedPrices };
