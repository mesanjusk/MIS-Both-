// Indian-numbering amount to words, used on printed vouchers ("Rupees Two Thousand Only").
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

// 12,34,567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"
export function numberToIndianWords(value) {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'Zero';

  const groups = [
    { value: Math.floor(n / 10000000), label: 'Crore' },
    { value: Math.floor((n % 10000000) / 100000), label: 'Lakh' },
    { value: Math.floor((n % 100000) / 1000), label: 'Thousand' },
  ];

  const parts = groups
    .filter((g) => g.value > 0)
    .map((g) => `${threeDigits(g.value)} ${g.label}`);

  const last = n % 1000;
  if (last) parts.push(threeDigits(last));

  return parts.join(' ');
}

// 1250.5 → "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only"
export function amountInWords(value) {
  const num = Number(value) || 0;
  const sign = num < 0 ? 'Minus ' : '';
  const abs = Math.abs(num);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  let text = `${sign}Rupees ${numberToIndianWords(rupees)}`;
  if (paise) text += ` and ${numberToIndianWords(paise)} Paise`;
  return `${text} Only`;
}

export default amountInWords;
