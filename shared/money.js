// Shared by the worker and the Mini App. Amounts are integers in minor units (1/100).

export const CURRENCIES = [
  { code: "RUB", symbol: "₽" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "KZT", symbol: "₸" },
  { code: "BYN", symbol: "Br" },
  { code: "UAH", symbol: "₴" },
  { code: "GEL", symbol: "₾" },
  { code: "TRY", symbol: "₺" },
  { code: "AMD", symbol: "֏" },
  { code: "USDT", symbol: "USDT" },
];

const SYMBOLS = Object.fromEntries(CURRENCIES.map((currency) => [currency.code, currency.symbol]));

export const MAX_AMOUNT = 100_000_000_000; // 1 млрд в минорных единицах

export function isCurrency(code) {
  return Object.hasOwn(SYMBOLS, code);
}

export function currencySymbol(code) {
  return SYMBOLS[code] || code;
}

const wholeFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const centsFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 125050, "RUB" -> "1 250,50 ₽"; whole amounts drop the kopecks.
export function formatMoney(minor, currency, { sign = false } = {}) {
  const abs = Math.abs(minor);
  const number = abs % 100 === 0 ? wholeFormat.format(abs / 100) : centsFormat.format(abs / 100);
  const prefix = sign && minor > 0 ? "+" : minor < 0 ? "−" : "";
  return `${prefix}${number} ${currencySymbol(currency)}`;
}

// "1 250,5" -> 125050. Returns null for anything that is not a positive amount.
export function parseAmount(input) {
  const text = String(input ?? "")
    .replace(/\s/g, "") // \s covers the no-break spaces Intl puts between thousands
    .replace(",", ".");
  const match = /^(\d{1,10})(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return minor > 0 && minor <= MAX_AMOUNT ? minor : null;
}
