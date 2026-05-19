// src/cardano/utils.js

function normalizeHexAddress(value) {
    if (!value) return null;

    if (typeof value === "string") {
        const clean = value.startsWith("0x") ? value.slice(2) : value;
        return clean || null;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        return normalizeHexAddress(value[0]);
    }

    if (value instanceof Uint8Array) {
        return Array.from(value)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    return null;
}

async function toBech32(addrHex) {
    try {
        const CSL = await import("@emurgo/cardano-serialization-lib-browser");
        const hex = normalizeHexAddress(addrHex);
        if (!hex) return null;

        const bytes = new Uint8Array(
            hex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
        );

        return CSL.Address.from_bytes(bytes).to_bech32();
    } catch (err) {
        console.warn("[Cardano] Failed to convert address to bech32:", err);
        return addrHex || null;
    }
}

async function getAnyAddress(api) {
    const attempts = [
        ["getUsedAddresses", async () => api.getUsedAddresses?.()],
        ["getUnusedAddresses", async () => api.getUnusedAddresses?.()],
        ["getChangeAddress", async () => api.getChangeAddress?.()],
        ["getRewardAddresses", async () => api.getRewardAddresses?.()],
    ];

    for (const [name, fn] of attempts) {
        try {
            const value = await fn();
            

            const normalized = normalizeHexAddress(value);
            if (normalized) {
                
                return normalized;
            }
        } catch (err) {
            
        }
    }

    return null;
}

export async function getWalletInfo(walletName, api) {
    
    

    const networkId = await api.getNetworkId().catch((err) => {
        
        return undefined;
    });

    const addrHex = await getAnyAddress(api);
    const bech32 = addrHex ? await toBech32(addrHex) : null;

    let version;
    try {
        version = await window.cardano?.[walletName]?.getVersion?.();
    } catch (err) {
        
    }

    const walletInfo = {
        wallet: walletName,
        version,
        networkId,
        address: bech32 || addrHex || null,
        addressHex: addrHex || null,
    };

    

    return walletInfo;
}
