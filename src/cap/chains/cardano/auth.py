from dataclasses import dataclass
from typing import Any

from pycardano.cip import cip8


@dataclass
class CardanoSignatureVerificationResult:
    ok: bool
    error: str | None = None
    decoded_message: str | None = None
    signer_address: str | None = None


def _extract_bool(result: dict[str, Any]) -> bool:
    for key in ("verified", "is_verified", "valid", "ok"):
        if key in result:
            return bool(result[key])
    return False


def _extract_message(result: dict[str, Any]) -> str | None:
    for key in ("message", "payload", "contents", "content"):
        value = result.get(key)
        if isinstance(value, bytes):
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return value.hex()
        if value is not None:
            return str(value)
    return None


def _extract_address(result: dict[str, Any]) -> str | None:
    for key in ("address", "signing_address", "signer_address"):
        value = result.get(key)
        if value is not None:
            return str(value)
    return None


def verify_cardano_data_signature(
    *,
    address: str,
    message: str,
    signature: str,
    key: str,
) -> CardanoSignatureVerificationResult:
    if not address:
        return CardanoSignatureVerificationResult(False, "missingWalletAddress")

    if not message:
        return CardanoSignatureVerificationResult(False, "missingMessage")

    if not signature or not key:
        return CardanoSignatureVerificationResult(False, "missingSignatureFields")

    try:
        result = cip8.verify(
            {
                "signature": signature,
                "key": key,
            },
            attach_cose_key=True,
        )

        if not isinstance(result, dict):
            return CardanoSignatureVerificationResult(False, "invalidVerifierResult")

        if not _extract_bool(result):
            return CardanoSignatureVerificationResult(False, "invalidSignature")

        decoded_message = _extract_message(result)
        signer_address = _extract_address(result)

        if decoded_message != message:
            return CardanoSignatureVerificationResult(
                False,
                "messageMismatch",
                decoded_message=decoded_message,
                signer_address=signer_address,
            )

        if signer_address and signer_address != address:
            return CardanoSignatureVerificationResult(
                False,
                "walletMismatch",
                decoded_message=decoded_message,
                signer_address=signer_address,
            )

        return CardanoSignatureVerificationResult(
            True,
            decoded_message=decoded_message,
            signer_address=signer_address,
        )

    except Exception as exc:
        return CardanoSignatureVerificationResult(False, str(exc))
