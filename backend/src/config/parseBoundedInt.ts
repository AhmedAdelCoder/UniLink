/**
 * Parse an optional integer env var with inclusive bounds.
 * Unset or blank values use `fallback`. Invalid values throw — including 0 when min > 0.
 */
export const parseBoundedInt = (
  key: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = process.env[key];

  if (raw === undefined || raw.trim() === '') {
    if (!Number.isInteger(fallback) || fallback < min || fallback > max) {
      throw new Error(
        `Invalid default for ${key}: expected integer between ${min} and ${max}, got ${fallback}`
      );
    }
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid ${key}: expected an integer between ${min} and ${max}, got ${JSON.stringify(raw)}`
    );
  }

  return parsed;
};
