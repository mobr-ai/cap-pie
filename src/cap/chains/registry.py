from cap.chains.cardano.adapter import CardanoChainModule
from cap.chains.chain_interface import ChainModule
from cap.config import settings

_CHAIN_MODULES: dict[str, ChainModule] = {
    "cardano": CardanoChainModule(),
}


def get_chain() -> ChainModule:
    chain_name = settings.CHAIN_NAME.strip().lower()

    try:
        return _CHAIN_MODULES[chain_name]
    except KeyError as exc:
        supported = ", ".join(sorted(_CHAIN_MODULES))
        raise RuntimeError(
            f"Unsupported CHAIN_NAME={chain_name!r}. Supported chains: {supported}"
        ) from exc
