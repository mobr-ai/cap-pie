const BILLING_CURRENCIES = {
  lovelace: {
    minorCode: "lovelace",
    code: "₳DA",
    symbol: "₳",
    decimals: 6,
    displayName: "₳DA",
  },
  ada: {
    minorCode: "lovelace",
    code: "₳DA",
    symbol: "₳",
    decimals: 0,
    displayName: "₳DA",
  },
};

export function normalizeBillingCurrency(currency) {
  const key = String(currency || "lovelace").trim().toLowerCase();
  return BILLING_CURRENCIES[key] ? key : "lovelace";
}

export function getBillingCurrencyMeta(currency = "lovelace") {
  return BILLING_CURRENCIES[normalizeBillingCurrency(currency)];
}

export function formatBillingCurrencyCode(currency = "lovelace") {
  return getBillingCurrencyMeta(currency).code;
}

export function formatBillingCurrencySymbol(currency = "lovelace") {
  return getBillingCurrencyMeta(currency).symbol;
}

export function billingMinorToMajorString(value, currency = "lovelace") {
  const meta = getBillingCurrencyMeta(currency);
  const decimals = Number(meta.decimals || 0);

  if (decimals <= 0) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  const scale = 10n ** BigInt(decimals);
  const raw = BigInt(value || 0);
  const sign = raw < 0n ? "-" : "";
  const n = raw < 0n ? -raw : raw;
  const whole = n / scale;
  const fraction = n % scale;

  if (fraction === 0n) return `${sign}${whole.toString()}`;

  return `${sign}${whole.toString()}.${fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")}`;
}

export function billingMajorToMinor(value, currency = "lovelace") {
  const meta = getBillingCurrencyMeta(currency);
  const decimals = Number(meta.decimals || 0);
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * Number(10n ** BigInt(decimals)));
}

export function adaToLovelace(value) {
  return billingMajorToMinor(value, "lovelace");
}

export function formatBillingAmountFromMinor(
  value,
  {
    currency = "lovelace",
    unit = "symbol",
    fallback = "0",
  } = {},
) {
  const meta = getBillingCurrencyMeta(currency);
  const amount = billingMinorToMajorString(value, currency);
  const suffix = unit === "code" ? meta.code : meta.symbol;

  if (!amount) return `${fallback} ${suffix}`;
  return `${amount} ${suffix}`;
}

export function formatBillingAmountFromMajor(
  value,
  {
    currency = "lovelace",
    unit = "symbol",
    fallback = "0",
  } = {},
) {
  const meta = getBillingCurrencyMeta(currency);
  const n = Number(value || 0);
  const amount = Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: n > 0 && n < 1 ? 6 : 0,
        maximumFractionDigits: 6,
      })
    : fallback;
  const suffix = unit === "code" ? meta.code : meta.symbol;

  return `${amount} ${suffix}`;
}

export function formatBillingNetworkLabel(network) {
  const key = String(network || "mainnet").trim().toLowerCase();

  if (key === "mainnet") return "Mainnet";
  if (key === "preprod") return "Preprod";
  if (key === "preview") return "Preview";
  if (key === "testnet") return "Testnet";

  return network || "Mainnet";
}
