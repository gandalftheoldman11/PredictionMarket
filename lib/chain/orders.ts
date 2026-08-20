/**
 * EIP-712 order model shared by the trade panel (signing) and the gateway
 * (verification). Field order mirrors TradewarExchange.Order exactly; the
 * domain binds signatures to this exchange deployment and chain, so orders
 * can never replay elsewhere.
 *
 * Denomination invariants (all integer micros):
 *   BUY:  makerAmount = worst-case cash = price × shares, takerAmount = shares
 *   SELL: makerAmount = shares, takerAmount = minimum cash = price × shares
 * Prices sit on 0.1¢ ticks and shares on 0.01 lots, so price × shares is an
 * exact integer and on-chain fills at the signed rate reproduce the ledger
 * math to the micro. Orders sign the registry fee as a user-approved ceiling,
 * which the gateway verifies against current on-chain configuration.
 */

export const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
  ],
} as const;

export function orderDomain(chainId: number, exchange: `0x${string}`) {
  return {
    name: "TRADEWAR Exchange",
    version: "1",
    chainId,
    verifyingContract: exchange,
  } as const;
}

export const SIDE_BUY = 0;
export const SIDE_SELL = 1;

/** Wire form: every uint as a decimal string so nothing loses precision. */
export type WireOrder = {
  salt: string;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
};

export type ChainOrder = {
  salt: bigint;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
};

const UINT256_MAX = (1n << 256n) - 1n;

export function parseWireOrder(w: WireOrder): ChainOrder {
  const big = (v: string, label: string): bigint => {
    if (typeof v !== "string" || !/^[0-9]{1,78}$/.test(v)) throw new Error(`${label} malformed`);
    const b = BigInt(v);
    if (b > UINT256_MAX) throw new Error(`${label} out of range`);
    return b;
  };
  const address = (v: string, label: string): `0x${string}` => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${label} malformed`);
    return v.toLowerCase() as `0x${string}`;
  };
  if (w.side !== SIDE_BUY && w.side !== SIDE_SELL) throw new Error("side malformed");
  return {
    salt: big(w.salt, "salt"),
    maker: address(w.maker, "maker"),
    signer: address(w.signer, "signer"),
    taker: address(w.taker, "taker"),
    tokenId: big(w.tokenId, "tokenId"),
    makerAmount: big(w.makerAmount, "makerAmount"),
    takerAmount: big(w.takerAmount, "takerAmount"),
    expiration: big(w.expiration, "expiration"),
    nonce: big(w.nonce, "nonce"),
    feeRateBps: big(w.feeRateBps, "feeRateBps"),
    side: w.side,
  };
}

export function toWireOrder(o: ChainOrder): WireOrder {
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    signer: o.signer,
    taker: o.taker,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    nonce: o.nonce.toString(),
    feeRateBps: o.feeRateBps.toString(),
    side: o.side,
  };
}

/** Tuple form for viem contract calls (matches the ABI struct). */
export function orderTuple(o: ChainOrder) {
  return {
    salt: o.salt,
    maker: o.maker,
    signer: o.signer,
    taker: o.taker,
    tokenId: o.tokenId,
    makerAmount: o.makerAmount,
    takerAmount: o.takerAmount,
    expiration: o.expiration,
    nonce: o.nonce,
    feeRateBps: o.feeRateBps,
    side: o.side,
  };
}
