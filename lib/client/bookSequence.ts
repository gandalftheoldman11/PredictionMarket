/**
 * REST snapshots and realtime messages share the authority market sequence.
 * A snapshot may race ahead of the realtime room cursor, so the view must
 * refuse any later-delivered message from an older sequence.
 */
export function isCurrentBookSequence(
  current: bigint | null,
  incoming: string,
): boolean {
  return current === null || BigInt(incoming) >= current;
}

/** Highest market sequence observed from either realtime or a REST snapshot. */
export function observeBookSequence(
  current: bigint | null,
  incoming: string,
): bigint {
  const parsed = BigInt(incoming);
  return current === null || parsed > current ? parsed : current;
}

/**
 * A REST snapshot is a valid replacement only if it covers every realtime
 * sequence already observed while the component had no usable book base.
 */
export function bookSnapshotCoversObservedSequence(
  observed: bigint | null,
  snapshot: string,
): boolean {
  return observed === null || BigInt(snapshot) >= observed;
}
