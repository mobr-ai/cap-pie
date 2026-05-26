const DEFAULT_CARDANO_EXPLORER_BASE_URLS = {
  mainnet: "https://cardanoscan.io",
  preview: "https://preview.cardanoscan.io",
  preprod: "https://preprod.cardanoscan.io",
};

function normalizeNetwork(network) {
  const value = String(network || "").trim().toLowerCase();

  if (value === "mainnet" || value === "preview" || value === "preprod") {
    return value;
  }

  return "mainnet";
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function getCardanoExplorerBaseUrl(network) {
  const override = trimTrailingSlash(import.meta.env.VITE_CARDANO_EXPLORER_BASE_URL);

  if (override) {
    return override;
  }

  return DEFAULT_CARDANO_EXPLORER_BASE_URLS[normalizeNetwork(network)];
}

export function getCardanoTxExplorerUrl(txHash, network) {
  const hash = String(txHash || "").trim();

  if (!hash) {
    return "";
  }

  return `${getCardanoExplorerBaseUrl(network)}/transaction/${encodeURIComponent(hash)}`;
}
