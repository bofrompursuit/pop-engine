// Validating what this feature reads, without a list that can drift out of step with it.
//
// F-206 took four review findings of one shape: a field was read that nothing had validated. Each
// round validated the field it was told about, and the next round found another — `generatedAt`
// (`.slice()` on undefined), `eventRevision` (a non-number makes `current > pinned` false, so an
// edited event renders as CURRENT with nothing thrown and nothing logged), `verdict` (an unknown
// token renders an empty verdict line), then a finding's `verificationStatus` (`.toLowerCase()` on
// undefined) and an event's `revision_counter` (the silent-false case again). Enumerating the fifth
// would have invited a sixth: a hand-written list of validated fields is a second copy of "what the
// page reads", and the two drift the moment someone reads a new field.
//
// So coverage is not listed. It is derived, and the derivation closes in both directions:
//
//   1. The consumed types (`PlanResponse`, `ConsumedFinding`, `ConsumedEvent`) are the only shapes
//      this feature can see, and they contain exactly the fields it reads. Reading anything else
//      does not compile.
//   2. `FieldChecks<T>` is mapped over `keyof T` with `-?`, so a field present in one of those
//      types with no runtime check does not compile either.
//
// A future field therefore cannot be consumed without being validated: adding the read fails on (1)
// until the type carries it, and carrying it fails on (2) until a check exists. `pnpm typecheck` is
// a CI step, so this is enforced on every push rather than caught in review — which is what the four
// rounds show review does not reliably do.
//
// What this deliberately does NOT do is police fields nothing reads. Those are absent from the
// consumed types on purpose: refusing a body over a field the page never touches would reject a plan
// it renders correctly, and a finding's remaining members are the engine's schema to police rather
// than the client's. Both are boundaries F-206 set; the change is that they are now enforced by the
// types instead of asserted in a comment.

/**
 * One runtime check per field of `T`. Mapped over `keyof T` with `-?`, so every field is required: a
 * field in a consumed type with no check is a compile error, and a check for a field that is not in
 * the type is a compile error too.
 */
export type FieldChecks<T> = { readonly [K in keyof T]-?: (value: unknown) => boolean };

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Applies a complete set of field checks to an untrusted body. */
export function readChecked<T>(checks: FieldChecks<T>, body: unknown): T | null {
  const record = asRecord(body);
  if (record === null) return null;
  for (const field of Object.keys(checks)) {
    const check = (checks as Record<string, (value: unknown) => boolean>)[field];
    if (check !== undefined && !check(record[field])) return null;
  }
  return record as T;
}

export const isString = (value: unknown): boolean => typeof value === "string";

/**
 * `NaN` and the infinities are not guarded against: they cannot arrive here. Every body this runs on
 * comes from `response.json()`, and JSON has no encoding for them — `JSON.stringify` writes `null`,
 * which this rejects. A `Number.isFinite` call would be a guard against a value the transport cannot
 * deliver, and there would be no way to write a test that fails without it.
 */
export const isNumber = (value: unknown): boolean => typeof value === "number";

export const nullOr =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === null || check(value);

export const arrayOf =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    Array.isArray(value) && value.every(check);

export const fieldOf =
  (field: string, check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    check(asRecord(value)?.[field]);

/**
 * A token set that cannot fall behind the engine's union. `Record<Union, true>` is exhaustive, so
 * adding a member to `Verdict` or `VerificationStatus` upstream breaks the caller until it is
 * listed — the same closed loop as the field checks, for the values rather than the shape.
 */
export const tokensOf = <Union extends string>(
  members: Readonly<Record<Union, true>>,
): ReadonlySet<string> => new Set(Object.keys(members));

export const isToken =
  (tokens: ReadonlySet<string>) =>
  (value: unknown): boolean =>
    typeof value === "string" && tokens.has(value);
