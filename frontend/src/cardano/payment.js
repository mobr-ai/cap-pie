import {
  Address,
  BigNum,
  LinearFee,
  Transaction,
  TransactionBuilder,
  TransactionBuilderConfigBuilder,
  TransactionOutput,
  TransactionUnspentOutput,
  TransactionWitnessSet,
  Value,
} from "@emurgo/cardano-serialization-lib-browser";

const MIN_FEE_BUFFER_LOVELACE = 500000n;

function makePaymentError(code, message, extra = {}) {
  const err = new Error(message || code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function ensureHex(value, label) {
  if (!value || typeof value !== "string") {
    throw makePaymentError("invalidHex", `${label} is missing`);
  }

  const clean = value.startsWith("0x") ? value.slice(2) : value;

  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw makePaymentError("invalidHex", `${label} is not valid hex`);
  }

  return clean;
}

function hexToBytes(hex) {
  const clean = ensureHex(hex, "hex");
  const bytes = new Uint8Array(clean.length / 2);

  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }

  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getProtocolParams() {
  return TransactionBuilderConfigBuilder.new()
    .fee_algo(LinearFee.new(BigNum.from_str("44"), BigNum.from_str("155381")))
    .pool_deposit(BigNum.from_str("500000000"))
    .key_deposit(BigNum.from_str("2000000"))
    .max_value_size(5000)
    .max_tx_size(16384)
    .coins_per_utxo_byte(BigNum.from_str("4310"))
    .build();
}

function addWalletInput(txBuilder, utxo) {
  const address = utxo.output().address();
  const input = utxo.input();
  const amount = utxo.output().amount();

  if (typeof txBuilder.add_regular_input === "function") {
    txBuilder.add_regular_input(address, input, amount);
    return;
  }

  if (typeof txBuilder.add_input === "function") {
    txBuilder.add_input(address, input, amount);
    return;
  }

  throw makePaymentError(
    "unsupportedTransactionBuilder",
    "This Cardano serialization library does not expose a supported input method",
  );
}

function parseUtxos(utxoHexList) {
  if (!Array.isArray(utxoHexList) || utxoHexList.length === 0) {
    throw makePaymentError(
      "noSpendableUtxos",
      "Wallet returned no spendable UTxOs",
    );
  }

  return utxoHexList.map((utxoHex) =>
    TransactionUnspentOutput.from_bytes(hexToBytes(utxoHex)),
  );
}

function sumUtxoLovelace(utxos) {
  return utxos.reduce((total, utxo) => {
    const coin = utxo.output().amount().coin().to_str();
    return total + BigInt(coin);
  }, 0n);
}

export function lovelaceToAda(lovelace) {
  const n = BigInt(lovelace || 0);
  const whole = n / 1000000n;
  const fraction = n % 1000000n;

  if (fraction === 0n) return whole.toString();

  return `${whole}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

export async function getWalletLovelaceBalance(walletApi) {
  if (!walletApi || typeof walletApi.getUtxos !== "function") {
    throw makePaymentError(
      "walletBalanceUnavailable",
      "Wallet does not support balance lookup",
    );
  }

  const utxoHexList = await walletApi.getUtxos();

  if (!Array.isArray(utxoHexList) || utxoHexList.length === 0) {
    return {
      available: true,
      lovelace: "0",
      ada: "0",
      utxoCount: 0,
    };
  }

  const utxos = parseUtxos(utxoHexList);
  const lovelace = sumUtxoLovelace(utxos);

  return {
    available: true,
    lovelace: lovelace.toString(),
    ada: lovelaceToAda(lovelace),
    utxoCount: utxos.length,
  };
}

export async function buildSignSubmitPaymentTx({
  walletApi,
  paymentAddress,
  amountLovelace,
  changeAddressHex,
}) {
  if (!walletApi) {
    throw makePaymentError("walletRequired", "Wallet API is required");
  }

  if (!paymentAddress) {
    throw makePaymentError("paymentAddressMissing", "Payment address is required");
  }

  const amount = BigInt(amountLovelace || 0);
  if (amount <= 0n) {
    throw makePaymentError("invalidPaymentAmount", "Invalid payment amount");
  }

  if (typeof walletApi.getUtxos !== "function") {
    throw makePaymentError("walletBalanceUnavailable", "Wallet does not support getUtxos");
  }

  if (typeof walletApi.signTx !== "function") {
    throw makePaymentError("walletSignTxUnavailable", "Wallet does not support signTx");
  }

  if (typeof walletApi.submitTx !== "function") {
    throw makePaymentError("walletSubmitTxUnavailable", "Wallet does not support submitTx");
  }

  const utxoHexList = await walletApi.getUtxos();
  const utxos = parseUtxos(utxoHexList);
  const balance = sumUtxoLovelace(utxos);
  const requiredWithBuffer = amount + MIN_FEE_BUFFER_LOVELACE;

  if (balance < requiredWithBuffer) {
    throw makePaymentError(
      "insufficientWalletBalance",
      "Insufficient wallet balance",
      {
        balanceLovelace: balance.toString(),
        requiredLovelace: requiredWithBuffer.toString(),
      },
    );
  }

  const changeAddress = Address.from_bytes(hexToBytes(changeAddressHex));
  const outputAddress = Address.from_bech32(paymentAddress);

  const txBuilder = TransactionBuilder.new(getProtocolParams());

  for (const [index, utxo] of utxos.entries()) {
    try {
      addWalletInput(txBuilder, utxo);
    } catch (err) {
      const output = utxo.output();
      const input = utxo.input();
      const amountValue = output.amount();

      console.error("[CardanoPayment] add_input failed", {
        index,
        txHash: input.transaction_id().to_hex?.(),
        outputIndex: input.index?.(),
        address: output.address().to_bech32?.(),
        lovelace: amountValue.coin().to_str(),
        error: err,
      });

      throw makePaymentError(
        "txInputBuildFailed",
        "Could not add wallet UTxO to the payment transaction",
        {
          cause: err,
          utxoIndex: index,
          lovelace: amountValue.coin().to_str(),
        },
      );
    }
  }

  txBuilder.add_output(
    TransactionOutput.new(
      outputAddress,
      Value.new(BigNum.from_str(amount.toString())),
    ),
  );

  txBuilder.add_change_if_needed(changeAddress);

  const txBody = txBuilder.build();
  const unsignedTx = Transaction.new(txBody, TransactionWitnessSet.new(), undefined);
  const unsignedTxHex = bytesToHex(unsignedTx.to_bytes());

  const witnessSetHex = await walletApi.signTx(unsignedTxHex, true);
  const signedWitnessSet = TransactionWitnessSet.from_bytes(hexToBytes(witnessSetHex));

  const signedTx = Transaction.new(
    txBody,
    signedWitnessSet,
    unsignedTx.auxiliary_data(),
  );

  const signedTxHex = bytesToHex(signedTx.to_bytes());
  const txHash = await walletApi.submitTx(signedTxHex);

  return {
    txHash,
    signedTxHex,
  };
}
