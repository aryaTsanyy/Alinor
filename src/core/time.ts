const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTES_PER_DAY = 1440;

export function parseTime(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(
      `Invalid time "${value}", expected HH:mm (00:00-23:59)`,
    );
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new RangeError(`Invalid minutes ${minutes}, expected integer 0-1439`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
