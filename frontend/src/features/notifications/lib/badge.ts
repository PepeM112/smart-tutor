/** Largest number shown on the bell badge. A bigger count shows `99+`. */
const BADGE_MAX = 99;

export function badgeText(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}
