import { isValidDate, toDateString } from "./dates";
import type { TaskAllocation } from "./types";

/**
 * Alokasi PLANNED dari hari sebelum hari ini menjadi EXPIRED. Dijalankan secara lazy
 * saat aplikasi dibuka. Item yang tidak berubah dikembalikan sebagai objek yang sama.
 */
export function rolloverAllocations(
  allocations: readonly TaskAllocation[],
  now: Date,
): TaskAllocation[] {
  const today = toDateString(now);
  return allocations.map((a): TaskAllocation => {
    if (!isValidDate(a.date)) {
      throw new RangeError(
        `Allocation "${a.id}" has an invalid date "${a.date}"`,
      );
    }
    // Perbandingan string aman: kedua tanggal sudah tervalidasi berformat YYYY-MM-DD.
    return a.status === "PLANNED" && a.date < today
      ? { ...a, status: "EXPIRED" }
      : a;
  });
}
