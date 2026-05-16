// src/cardano/utils.js
async function toBech32(addrHex) {
    try {
        const CSL = await import("@emurgo/cardano-serialization-lib-browser");
        const hex = addrHex.startsWith("0x") ? addrHex.slice(2) : addrHex;
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        return CSL.Address.from_bytes(bytes).to_bech32();
    } catch {
        return addrHex; // fallback if CSL isn't present
    }
}

async function getAnyAddress(api) {
    try {
        const used = await api.getUsedAddresses();
        if (used && used.length > 0) return used[0];
    } catch { }
    try {
        const change = await api.getChangeAddress();
        if (change) return change;
    } catch { }
    return null;
}

export async function getWalletInfo(walletName, api) {
    const networkId = await api.getNetworkId().catch(() => undefined);
    const addrHex = await getAnyAddress(api);
    const bech32 = addrHex ? await toBech32(addrHex) : undefined;

    let version;
    try {
        version = await window.cardano?.[walletName]?.getVersion?.();
    } catch { }

    return {
        wallet: walletName,
        version,
        networkId,           // 0=testnet, 1=mainnet (CIP-30)
        address: bech32 || addrHex || null,
        // add more fields here if you need them in your backend logs
    };
}
