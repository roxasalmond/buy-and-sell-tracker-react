/**
 * Date as YYYY-MM-DD in the device's LOCAL time zone.
 *
 * The old app used new Date().toISOString().split("T")[0], which is UTC, so anything
 * saved between 12:00am and 8:00am Manila time got yesterday's date.
 */
export function toLocalDateString(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
