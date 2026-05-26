from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import requests


@dataclass
class CardanoPaymentVerificationResult:
    ok: bool
    provider: str
    tx_hash: str
    expected_address: str
    expected_lovelace: int
    received_lovelace: int = 0
    error: str | None = None


class CardanoPaymentVerifier(Protocol):
    provider_name: str

    def verify_payment_tx(
        self,
        *,
        tx_hash: str,
        expected_address: str,
        expected_lovelace: int,
        network: str,
    ) -> CardanoPaymentVerificationResult:
        ...


class BlockfrostPaymentVerifier:
    provider_name = "blockfrost"

    BASE_URLS = {
        "mainnet": "https://cardano-mainnet.blockfrost.io/api/v0",
        "preprod": "https://cardano-preprod.blockfrost.io/api/v0",
        "preview": "https://cardano-preview.blockfrost.io/api/v0",
    }

    def __init__(self, project_id: str | None = None, timeout_seconds: int = 15):
        self.project_id = project_id or os.getenv("BLOCKFROST_PROJECT_ID")
        self.timeout_seconds = timeout_seconds

        if not self.project_id:
            raise RuntimeError("BLOCKFROST_PROJECT_ID is not set.")

    def verify_payment_tx(
        self,
        *,
        tx_hash: str,
        expected_address: str,
        expected_lovelace: int,
        network: str,
    ) -> CardanoPaymentVerificationResult:
        network_norm = (network or "").strip().lower()
        base_url = self.BASE_URLS.get(network_norm)

        if not base_url:
            return CardanoPaymentVerificationResult(
                ok=False,
                provider=self.provider_name,
                tx_hash=tx_hash,
                expected_address=expected_address,
                expected_lovelace=expected_lovelace,
                error="unsupportedCardanoNetwork",
            )

        tx_hash_norm = (tx_hash or "").strip()
        if not tx_hash_norm:
            return CardanoPaymentVerificationResult(
                ok=False,
                provider=self.provider_name,
                tx_hash=tx_hash_norm,
                expected_address=expected_address,
                expected_lovelace=expected_lovelace,
                error="missingTxHash",
            )

        try:
            res = requests.get(
                f"{base_url}/txs/{tx_hash_norm}/utxos",
                headers={"project_id": self.project_id},
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            return CardanoPaymentVerificationResult(
                ok=False,
                provider=self.provider_name,
                tx_hash=tx_hash_norm,
                expected_address=expected_address,
                expected_lovelace=expected_lovelace,
                error=f"blockfrostRequestFailed:{exc}",
            )

        if res.status_code == 404:
            return CardanoPaymentVerificationResult(
                ok=False,
                provider=self.provider_name,
                tx_hash=tx_hash_norm,
                expected_address=expected_address,
                expected_lovelace=expected_lovelace,
                error="txNotFound",
            )

        if not res.ok:
            return CardanoPaymentVerificationResult(
                ok=False,
                provider=self.provider_name,
                tx_hash=tx_hash_norm,
                expected_address=expected_address,
                expected_lovelace=expected_lovelace,
                error=f"blockfrostError:{res.status_code}:{res.text[:300]}",
            )

        payload = res.json()
        outputs = payload.get("outputs") or []

        received_lovelace = 0
        for output in outputs:
            if output.get("address") != expected_address:
                continue

            for amount in output.get("amount") or []:
                if amount.get("unit") == "lovelace":
                    try:
                        received_lovelace += int(amount.get("quantity") or 0)
                    except (TypeError, ValueError):
                        pass

        ok = received_lovelace >= int(expected_lovelace)

        return CardanoPaymentVerificationResult(
            ok=ok,
            provider=self.provider_name,
            tx_hash=tx_hash_norm,
            expected_address=expected_address,
            expected_lovelace=int(expected_lovelace),
            received_lovelace=received_lovelace,
            error=None if ok else "insufficientPaymentAmount",
        )


def get_cardano_payment_verifier() -> CardanoPaymentVerifier:
    provider = os.getenv("CARDANO_PAYMENT_VERIFIER", "blockfrost").strip().lower()

    if provider == "blockfrost":
        return BlockfrostPaymentVerifier()

    raise RuntimeError(f"Unsupported CARDANO_PAYMENT_VERIFIER: {provider}")
