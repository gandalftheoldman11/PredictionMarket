import { z } from "zod";

const errorSchema = z.object({ error: z.string() });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new ApiError(parsed.success ? parsed.data.error : `Request failed (${response.status})`, response.status);
  }
  return schema.parse(payload);
}

export const meResponseSchema = z.object({
  user: z
    .object({ email: z.string(), cash: z.number(), wallet: z.string().nullable() })
    .nullable(),
});

const unsignedIntegerStringSchema = z.string().regex(/^\d+$/);
const signedIntegerStringSchema = z.string().regex(/^-?\d+$/);
export const marketPageResponseSchema = z.object({
  markets: z.array(z.object({
    market: z.string(),
    question: z.string(),
    category: z.string(),
    endTime: z.string(),
    status: z.string(),
    resolution: z.enum(["yes", "no"]).nullable(),
    lastYesPriceMicros: unsignedIntegerStringSchema,
    change1wMicros: signedIntegerStringSchema,
    volumeMicros: unsignedIntegerStringSchema,
  })),
  nextCursor: z.string().nullable(),
});
export const candlePageResponseSchema = z.object({
  market: z.string(),
  bracket: z.string(),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  candles: z.array(z.object({
    openTime: unsignedIntegerStringSchema,
    closeTime: unsignedIntegerStringSchema,
    openYesPriceMicros: unsignedIntegerStringSchema,
    highYesPriceMicros: unsignedIntegerStringSchema,
    lowYesPriceMicros: unsignedIntegerStringSchema,
    closeYesPriceMicros: unsignedIntegerStringSchema,
    volumeSharesMicros: unsignedIntegerStringSchema,
    tradeCount: unsignedIntegerStringSchema,
  })),
  serverTimeMs: unsignedIntegerStringSchema,
});
const orderbookLevelSchema = z.object({
  outcomePriceMicros: unsignedIntegerStringSchema,
  sharesMicros: unsignedIntegerStringSchema,
});
export const orderbookResponseSchema = z.object({
  market: z.string(),
  bracket: z.string(),
  outcome: z.enum(["yes", "no"]),
  sequence: unsignedIntegerStringSchema,
  timestampMs: unsignedIntegerStringSchema,
  checksum: z.string(),
  bids: z.array(orderbookLevelSchema),
  asks: z.array(orderbookLevelSchema),
});
const orderV1Schema = z.object({
  orderId: z.string(),
  market: z.string(),
  bracket: z.string(),
  outcome: z.enum(["yes", "no"]),
  side: z.enum(["buy", "sell"]),
  outcomePriceMicros: unsignedIntegerStringSchema,
  remainingSharesMicros: unsignedIntegerStringSchema,
});
export const orderPageResponseSchema = z.object({
  orders: z.array(orderV1Schema.passthrough()),
  nextCursor: z.string().nullable(),
  accountSequence: unsignedIntegerStringSchema,
  serverTimeMs: unsignedIntegerStringSchema,
});
const exactRationalSchema = z.object({
  numerator: unsignedIntegerStringSchema,
  denominator: z.string().regex(/^[1-9]\d*$/),
});
const signedExactRationalSchema = z.object({
  numerator: signedIntegerStringSchema,
  denominator: z.string().regex(/^[1-9]\d*$/),
});
const portfolioOrderSchema = z.object({
  id: z.string(),
  marketSlug: z.string(),
  bracket: z.string(),
  question: z.string(),
  side: z.enum(["Yes", "No"]),
  verb: z.enum(["Buy", "Sell"]),
  priceDecicents: unsignedIntegerStringSchema,
  remainingQuantityContractMicros: unsignedIntegerStringSchema,
});
const positionSchema = z.object({
  marketSlug: z.string(),
  question: z.string(),
  bracket: z.string(),
  outcome: z.enum(["yes", "no", "other"]),
  quantityContractMicros: unsignedIntegerStringSchema,
  basisQuantityContractMicros: unsignedIntegerStringSchema,
  costBasisMoneyMicros: unsignedIntegerStringSchema,
  averagePrice: exactRationalSchema.nullable(),
  markPriceDecicents: unsignedIntegerStringSchema,
  unrealizedPnlMoneyMicrosRational: signedExactRationalSchema,
  valueMoneyMicrosRational: signedExactRationalSchema,
});
export const portfolioResponseSchema = z.object({
  cashMoneyMicros: signedIntegerStringSchema,
  availableCashMoneyMicros: unsignedIntegerStringSchema,
  realizedPnlMoneyMicros: signedIntegerStringSchema,
  unrealizedPnlMoneyMicrosRational: signedExactRationalSchema,
  totalPnlMoneyMicrosRational: signedExactRationalSchema,
  equityMoneyMicrosRational: signedExactRationalSchema,
  positions: z.array(positionSchema),
  orders: z.array(portfolioOrderSchema),
  provisional: z.boolean(),
  eventSequence: unsignedIntegerStringSchema,
  wallet: z.string().nullable(),
  settlements: z.array(z.object({
    settlementIntentId: z.string(),
    kind: z.string(),
    status: z.string(),
    workerState: z.string(),
    chainReference: z.string().nullable(),
    updatedAt: z.string(),
  })),
});
export const walletResponseSchema = z.object({
  wallet: z.string(), proxy: z.string(), cash: z.number(), chainId: z.number(),
  local: z.boolean(), usdc: z.string(),
});

export const faucetResponseSchema = z.object({
  ok: z.literal(true),
  cash: z.number(),
  transactionHash: z.string(),
  fundingStatus: z.literal("confirming"),
});
export const withdrawalParamsSchema = z.object({
  chainId: z.number(),
  forwarder: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  proxy: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  signer: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  usdc: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  nonce: z.string(),
  deadline: z.string(),
});
export const withdrawalResponseSchema = z.object({
  commandId: z.string(),
  resultId: z.string(),
  commandStatus: z.string(),
  settlementIntentId: z.string(),
  settlementStatus: z.string(),
});
export const cancelOrderResponseSchema = z.object({
  orderId: z.string(),
  commandId: z.string(),
  commandStatus: z.string(),
  orderStatus: z.string(),
  marketSequence: unsignedIntegerStringSchema,
  accountSequence: unsignedIntegerStringSchema,
  serverTimeMs: unsignedIntegerStringSchema,
});
export const loginResponseSchema = z.object({ ok: z.literal(true) }).passthrough();

export const orderParamsSchema = z.object({
  chainId: z.number(),
  exchange: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  tokenId: z.string(),
  maker: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  signer: z.custom<`0x${string}`>((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)),
  nonce: z.string(),
  feeRateBps: z.number().int().min(0).max(10_000),
});
export const placeOrderResponseSchema = z.object({
  filledSharesMicros: z.string().regex(/^\d+$/),
  averageYesPrice: z.object({
    numerator: z.string().regex(/^\d+$/),
    denominator: z.string().regex(/^[1-9]\d*$/),
  }).nullable(),
  cashMicros: z.string().regex(/^\d+$/),
  marketSequence: z.string().regex(/^\d+$/),
  restingId: z.string().nullable().optional(),
  commandId: z.string(),
  resultId: z.string(),
  commandStatus: z.string(),
  settlementStatus: z.string(),
}).passthrough();

export const adminResponseSchema = z.object({
  resolvers: z.array(z.string()),
  ttlSeconds: z.number(),
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number(),
    verifyingContract: z.custom<`0x${string}`>(
      (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
    ),
  }),
  markets: z.array(z.object({
    slug: z.string(), question: z.string(), status: z.string(), resolution: z.string().nullable(),
    resolutionIntent: z.enum(["yes", "no"]).nullable(),
    endTime: z.number(), price: z.number(),
    proposal: z.object({
      finalizableAt: z.number(), windowElapsed: z.boolean(), disputed: z.boolean(),
      outcome: z.enum(["yes", "no"]).nullable(),
    }).nullable(),
  })),
  catalog: z.object({
    mode: z.enum(["newest", "search", "exact"]),
    query: z.string().nullable(),
    limit: z.number().int().positive(),
  }),
});
export const resolutionResponseSchema = z.object({
  ok: z.literal(true), market: z.string(), outcome: z.enum(["yes", "no"]),
  finalizableAt: z.number().optional(), redeemed: z.number().optional(),
  complete: z.boolean().optional(), signer: z.string(),
});
export const marketControlResponseSchema = z.object({
  ok: z.literal(true),
  action: z.string(),
  lifecycle: z.string(),
  commandId: z.string(),
  resultId: z.string(),
});

export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
export type WalletResponse = z.infer<typeof walletResponseSchema>;
export type WithdrawalParams = z.infer<typeof withdrawalParamsSchema>;
export type AdminResponse = z.infer<typeof adminResponseSchema>;
