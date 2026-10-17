import {
  capacityOf,
  pomodoroBlockMinutes,
  type PomodoroTiming,
} from "./capacity";
import { subtractIntervals, type Interval } from "./intervals";
import { formatTime, parseTime } from "./time";
import type { Slot, TaskAllocation } from "./types";

export const CLIP_STEP_MIN = 5;

/** Membulatkan ke atas ke kelipatan `step` (tidak berubah bila sudah kelipatan). */
export function roundUpToStep(
  minutes: number,
  step: number = CLIP_STEP_MIN,
): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError("minutes must be a non-negative integer");
  }
  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError("step must be a positive integer");
  }
  return Math.ceil(minutes / step) * step;
}

/** Waktu lokal perangkat dalam menit sejak 00:00 (detik diabaikan). */
export function minutesOfDay(now: Date): number {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("Invalid Date");
  }
  return now.getHours() * 60 + now.getMinutes();
}

/** Menit dari awal celah sampai pomodoro ke-`index` (0-based) dimulai. */
export function pomodoroStartOffset(
  index: number,
  timing: PomodoroTiming,
): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("index must be a non-negative integer");
  }
  return pomodoroBlockMinutes(index + 1, timing) - timing.pomodoroDurationMin;
}

export interface AllocatableGap {
  start: number; // menit sejak 00:00
  capacity: number; // jumlah pomodoro berurutan yang muat
}

export interface BuildGapsParams {
  slots: readonly Slot[];
  existing: readonly TaskAllocation[];
  notBefore: number; // menit sejak 00:00; waktu sebelum ini tidak boleh dialokasikan
  timing: PomodoroTiming;
}

/**
 * Slot bebas -> celah yang benar-benar bisa diisi: dikurangi alokasi yang ada
 * (PLANNED dan COMPLETED, ditambah satu jeda pendek) dan dipotong mulai `notBefore`.
 * `Slot.capacity` sengaja tidak dipakai; kapasitas dihitung ulang dari celah yang tersisa.
 */
export function buildAllocatableGaps({
  slots,
  existing,
  notBefore,
  timing,
}: BuildGapsParams): AllocatableGap[] {
  if (!Number.isInteger(notBefore) || notBefore < 0) {
    throw new RangeError("notBefore must be a non-negative integer");
  }
  const occupied: Interval[] = [];
  if (notBefore > 0) occupied.push({ start: 0, end: notBefore });
  for (const a of existing) {
    if (a.status === "EXPIRED" || a.pomodoroCount === 0) continue;
    const start = parseTime(a.startTime);
    occupied.push({
      start,
      end:
        start +
        pomodoroBlockMinutes(a.pomodoroCount, timing) +
        timing.shortBreakMin,
    });
  }

  const gaps: AllocatableGap[] = [];
  for (const slot of slots) {
    const window: Interval = {
      start: parseTime(slot.startTime),
      end: parseTime(slot.endTime),
    };
    for (const gap of subtractIntervals(window, occupied)) {
      const capacity = capacityOf(gap.end - gap.start, timing);
      if (capacity > 0) gaps.push({ start: gap.start, capacity });
    }
  }
  return gaps.sort((a, b) => a.start - b.start);
}

export interface Placement {
  startTime: string;
  pomodoroCount: number;
}

export interface GapCursor {
  remainingCapacity(): number;
  /** Menempatkan hingga `count` pomodoro di celah paling awal. Bisa mengembalikan lebih sedikit. */
  take(count: number): Placement[];
}

export function createGapCursor(
  gaps: readonly AllocatableGap[],
  timing: PomodoroTiming,
): GapCursor {
  const state = gaps
    .map((g) => ({ start: g.start, capacity: g.capacity, used: 0 }))
    .sort((a, b) => a.start - b.start);

  return {
    remainingCapacity() {
      return state.reduce((sum, g) => sum + (g.capacity - g.used), 0);
    },
    take(count) {
      if (!Number.isInteger(count) || count < 0) {
        throw new RangeError("count must be a non-negative integer");
      }
      const placements: Placement[] = [];
      let left = count;
      for (const gap of state) {
        if (left === 0) break;
        const free = gap.capacity - gap.used;
        if (free === 0) continue;
        const taken = Math.min(left, free);
        placements.push({
          startTime: formatTime(
            gap.start + pomodoroStartOffset(gap.used, timing),
          ),
          pomodoroCount: taken,
        });
        gap.used += taken;
        left -= taken;
      }
      return placements;
    },
  };
}
