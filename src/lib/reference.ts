/**
 * Normalised keys for the two reference lists that build themselves from
 * imported data: rooms and staff.
 *
 * The importer uses these to decide whether a spreadsheet value is a new room
 * or person; the adapter uses the same functions when it creates the record. If
 * the two ever disagreed, the dry run would promise “2 new rooms” and the write
 * would produce three — so the rules live in one place.
 */

/** Names only: “M. Rivera”, “m rivera ” and “M.  RIVERA” are one person. */
export function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Rooms additionally absorb the word “Room”, because a sheet that says “214” in
 * one column and “Room 214” in another means the same classroom. A room that is
 * not a bare number keeps its text — “Room 214A” stays distinct from 214.
 */
export function roomKey(value: string): string {
  const stripped = value.trim().toLowerCase().replace(/^(room|rm|classroom)\b\.?\s*/, '')
  const normalised = nameKey(stripped)
  if (!normalised) return ''
  return /^\d+$/.test(normalised) ? `room${normalised}` : normalised
}
