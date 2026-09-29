// A statement's invoice detail is derived from the issued invoice snapshot
// (or an older order's Items). Receipt/payment vouchers use the stored
// transaction Description, which is also their narration.
const currency = (amount) => '₹' + Number(amount || 0).toLocaleString('en-IN', {
  maximumFractionDigits: 2,
});

export function formatStatementDescription(transaction, invoiceDetails, partyName = '') {
  const narration = String(transaction?.Description || '').trim();
  const items = Array.isArray(invoiceDetails?.items) ? invoiceDetails.items : [];
  if (!items.length) return narration || '—';

  const lines = items.map((item) => {
    const name = String(item.name || '').trim();
    if (!name) return '';
    const quantity = Number(item.quantity);
    const rate = Number(item.rate);
    const amount = Number(item.amount);
    const qtyLabel = Number.isFinite(quantity) && quantity > 0 ? ` × ${quantity}` : '';
    const priceLabel = Number.isFinite(rate) && rate > 0 ? ` @ ${currency(rate)}` : '';
    const totalLabel = Number.isFinite(amount) && amount > 0 ? ` = ${currency(amount)}` : '';
    const remark = String(item.remark || '').trim();
    return name + qtyLabel + priceLabel + totalLabel + (remark ? ` (${remark})` : '');
  }).filter(Boolean);

  const charges = (invoiceDetails.extraCharges || [])
    .map((charge) => {
      const label = String(charge.label || '').trim();
      return label ? `${label} ${currency(charge.amount)}` : '';
    }).filter(Boolean);
  if (charges.length) lines.push(`Charges: ${charges.join(', ')}`);
  // An unmodified legacy invoice often used the customer name alone as the
  // transaction narration. Avoid repeating that above the actual invoice items.
  const isDefaultName = narration.toLowerCase() === String(partyName || '').trim().toLowerCase();
  if (narration && !isDefaultName) lines.push(`Note: ${narration}`);
  return lines.join('; ') || narration || '—';
}
