"use client";

import { ORDER_TYPES, SIDE_BUY, SIDE_SELL, type WireOrder } from "./orders";

/**
 * Client-side EIP-712 order construction + Magic signing. All arithmetic is
 * BigInt over integer micros — prices on 0.1¢ ticks, shares on 0.01 lots —
 * so the signed amounts equal the gateway's recomputation exactly.
 */

export type OrderParams = {
  chainId: number;
  exchange: `0x${string}`;
  tokenId: string;
  maker: `0x${string}`;
  signer: `0x${string}`;
  nonce: string;
  feeRateBps: number;
};

function randomSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v.toString();
}

export function buildOrder(opts: {
  params: OrderParams;
  verb: "buy" | "sell";
  priceMicros: number; // outcome-side price, 0.1¢ ticks
  sharesMicros: number; // 0.01-share lots
  expiresAt: number; // unix seconds, 0 = GTC forever
}): WireOrder {
  const price = BigInt(opts.priceMicros);
  const shares = BigInt(opts.sharesMicros);
  const cash = (price * shares) / 1_000_000n;
  if (cash * 1_000_000n !== price * shares) throw new Error("Order terms are off-tick");
  const isBuy = opts.verb === "buy";
  return {
    salt: randomSalt(),
    maker: opts.params.maker,
    signer: opts.params.signer,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: opts.params.tokenId,
    makerAmount: (isBuy ? cash : shares).toString(),
    takerAmount: (isBuy ? shares : cash).toString(),
    expiration: String(opts.expiresAt),
    nonce: opts.params.nonce,
    feeRateBps: String(opts.params.feeRateBps),
    side: isBuy ? SIDE_BUY : SIDE_SELL,
  };
}

/** Sign with the user's Magic wallet (eth_signTypedData_v4). */
export async function signOrderWithMagic(
  params: OrderParams,
  order: WireOrder,
): Promise<`0x${string}`> {
  const localKey = process.env.NEXT_PUBLIC_LOCAL_E2E_PRIVATE_KEY;
  if (params.chainId === 31337 && localKey) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(localKey as `0x${string}`);
    if (account.address.toLowerCase() !== params.signer.toLowerCase()) {
      throw new Error("Local E2E signer does not match the signed-in wallet");
    }
    return account.signTypedData({
      domain: {
        name: "TRADEWAR Exchange",
        version: "1",
        chainId: params.chainId,
        verifyingContract: params.exchange,
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message: {
        ...order,
        salt: BigInt(order.salt),
        tokenId: BigInt(order.tokenId),
        makerAmount: BigInt(order.makerAmount),
        takerAmount: BigInt(order.takerAmount),
        expiration: BigInt(order.expiration),
        nonce: BigInt(order.nonce),
        feeRateBps: BigInt(order.feeRateBps),
      },
    });
  }
  const { Magic } = await import("magic-sdk");
  const magic = new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY!);
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: ORDER_TYPES.Order.map((f) => ({ name: f.name, type: f.type })),
    },
    domain: {
      name: "TRADEWAR Exchange",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.exchange,
    },
    primaryType: "Order",
    message: order,
  };
  const signature = await magic.rpcProvider.request({
    method: "eth_signTypedData_v4",
    params: [params.signer, JSON.stringify(typedData)],
  });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Wallet did not return a signature");
  }
  return signature as `0x${string}`;
}
