export function buildUpiPayLink({ vpa, name, amount, note, txnRef }) {
  const params = new URLSearchParams();

  params.set('pa', String(vpa || '').trim());
  params.set('pn', String(name || '').trim());
  params.set('cu', 'INR');

  const parsedAmount = Number(amount);
  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
    params.set('am', parsedAmount.toFixed(2));
  }

  if (note) params.set('tn', String(note).trim());
  if (txnRef) params.set('tr', String(txnRef).trim());

  return `upi://pay?${params.toString()}`;
}

export function generateTxnRef(prefix = 'UPI') {
  const now = new Date();
  const compactDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const compactTime = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${compactDate}-${compactTime}-${random}`;
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(navigator.userAgent || '');
}
