export type TerminalOrderFences = ReadonlyMap<string, bigint>;

type FenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const ORDER_FENCE_PREFIX = "redline.terminal-orders.v1:";
const BOOK_FENCE_PREFIX = "redline.terminal-book.v1:";

function storageKey(prefix: string, scope: string) {
  return `${prefix}${encodeURIComponent(scope)}`;
}

export function browserFenceStorage(): FenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadTerminalOrderFences(
  storage: FenceStorage | null,
  scope: string,
): Map<string, bigint> {
  if (!storage) return new Map();
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(storageKey(ORDER_FENCE_PREFIX, scope)) ?? "[]",
    );
    if (!Array.isArray(parsed)) return new Map();
    const fences = new Map<string, bigint>();
    for (const entry of parsed) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        entry[0].length === 0 ||
        typeof entry[1] !== "string" ||
        !/^\d+$/.test(entry[1])
      ) {
        return new Map();
      }
      const sequence = BigInt(entry[1]);
      const existing = fences.get(entry[0]);
      if (existing === undefined || sequence > existing) fences.set(entry[0], sequence);
    }
    return fences;
  } catch {
    return new Map();
  }
}

export function persistTerminalOrderFences(
  storage: FenceStorage | null,
  scope: string,
  fences: TerminalOrderFences,
) {
  if (!storage) return;
  const key = storageKey(ORDER_FENCE_PREFIX, scope);
  try {
    if (fences.size === 0) storage.removeItem(key);
    else {
      storage.setItem(
        key,
        JSON.stringify([...fences].map(([id, sequence]) => [id, sequence.toString()])),
      );
    }
  } catch {
    // A disabled or exhausted browser store must not turn a cancellation ACK
    // into a client-visible failure. The in-memory fence remains authoritative
    // for this mount.
  }
}

export function loadBookSequenceFence(
  storage: FenceStorage | null,
  scope: string,
): bigint | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(storageKey(BOOK_FENCE_PREFIX, scope));
    return value !== null && /^\d+$/.test(value) ? BigInt(value) : null;
  } catch {
    return null;
  }
}

export function recordBookSequenceFence(
  storage: FenceStorage | null,
  scope: string,
  marketSequence: string,
): bigint {
  const sequence = BigInt(marketSequence);
  const strongest = [loadBookSequenceFence(storage, scope), sequence]
    .filter((value): value is bigint => value !== null)
    .reduce((left, right) => left > right ? left : right);
  try {
    storage?.setItem(storageKey(BOOK_FENCE_PREFIX, scope), strongest.toString());
  } catch {
    // The caller still retains the sequence in memory.
  }
  return strongest;
}

export function retireBookSequenceFence(
  storage: FenceStorage | null,
  scope: string,
  observedSequence: string,
) {
  const required = loadBookSequenceFence(storage, scope);
  if (required === null || BigInt(observedSequence) < required) return required;
  try {
    storage?.removeItem(storageKey(BOOK_FENCE_PREFIX, scope));
  } catch {
    // A stale persisted fence only fails closed on the next mount.
  }
  return null;
}

export function recordTerminalOrder(
  current: TerminalOrderFences,
  orderId: string,
  accountSequence: string,
): Map<string, bigint> {
  const sequence = BigInt(accountSequence);
  const next = new Map(current);
  const existing = next.get(orderId);
  if (existing === undefined || sequence > existing) next.set(orderId, sequence);
  return next;
}

export function reconcileTerminalOrders<T>(
  orders: readonly T[],
  orderId: (order: T) => string,
  projectionAccountSequence: string,
  current: TerminalOrderFences,
): { orders: T[]; fences: Map<string, bigint> } {
  const projectedIds = new Set(orders.map(orderId));
  const fences = new Map(current);
  const projectionSequence = BigInt(projectionAccountSequence);
  for (const [id, requiredSequence] of fences) {
    if (projectionSequence >= requiredSequence && !projectedIds.has(id)) {
      fences.delete(id);
    }
  }
  return {
    orders: orders.filter((order) => !current.has(orderId(order))),
    fences,
  };
}
