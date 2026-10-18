export interface Interval {
  start: number; // menit sejak 00:00, inklusif
  end: number; // eksklusif
}

function assertValid(i: Interval): void {
  if (!Number.isFinite(i.start) || !Number.isFinite(i.end) || i.start > i.end) {
    throw new RangeError(`Invalid interval [${i.start}, ${i.end})`);
  }
}

/** Urutkan, buang interval kosong, gabungkan yang tumpang tindih atau bersentuhan. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const valid: Interval[] = [];
  for (const i of intervals) {
    assertValid(i);
    if (i.end > i.start) valid.push({ start: i.start, end: i.end }); // salin: input tidak boleh berubah
  }
  valid.sort((a, b) => a.start - b.start || a.end - b.end);

  const result: Interval[] = [];
  for (const cur of valid) {
    const last = result[result.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      result.push(cur);
    }
  }
  return result;
}

/** Celah bebas di dalam `window` setelah dikurangi `occupied`. */
export function subtractIntervals(
  window: Interval,
  occupied: readonly Interval[],
): Interval[] {
  assertValid(window);
  const merged = mergeIntervals(occupied);
  const gaps: Interval[] = [];
  let cursor = window.start;

  for (const block of merged) {
    if (block.end <= cursor) continue;
    if (block.start >= window.end) break;
    if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}
