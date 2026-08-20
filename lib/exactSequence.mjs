const MAX_POSTGRES_SEQUENCE = 9_223_372_036_854_775_807n;
const canonicalSequence = /^(?:0|[1-9]\d{0,19})$/;

/**
 * Validate an exact nonnegative decimal sequence without entering Number.
 * @param {string} value
 * @param {bigint} [maximum]
 * @returns {string}
 */
export function exactSequence(value, maximum = MAX_POSTGRES_SEQUENCE) {
  if (
    typeof value !== "string" ||
    !canonicalSequence.test(value) ||
    BigInt(value) > maximum
  ) {
    throw new RangeError("sequence must be a canonical nonnegative decimal integer");
  }
  return value;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
export function compareExactSequences(left, right) {
  const leftValue = BigInt(exactSequence(left));
  const rightValue = BigInt(exactSequence(right));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

/**
 * @param {string} value
 * @param {string} previous
 */
export function isNextExactSequence(value, previous) {
  return BigInt(exactSequence(value)) === BigInt(exactSequence(previous)) + 1n;
}
