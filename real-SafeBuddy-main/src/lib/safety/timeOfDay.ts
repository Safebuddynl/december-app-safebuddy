/**
 * When a trip happens changes what the reports mean.
 *
 * The imported dataset records when each location felt unsafe: 71% of reports
 * say "vooral als het donker is" (mainly when dark), 27% "op verschillende
 * momenten", and only 1% "vooral overdag". Ignoring that field, as earlier
 * versions did, treats a spot that is only frightening at midnight the same as
 * one that is a problem at noon.
 */

export type DaySegment = "day" | "evening" | "night";

export interface TimeContext {
  segment: DaySegment;
  /** True when the sun is down, which is when lighting starts to matter. */
  isDark: boolean;
  /** Human-readable label for explanations. */
  label: string;
}

/**
 * Rough sunset and sunrise for the Netherlands, by month.
 *
 * Real solar times would need a sun-position library; the swing here is what
 * matters. Index 0 is January.
 */
const SUNRISE_HOUR = [8.7, 8.1, 7.1, 6.9, 5.9, 5.3, 5.5, 6.3, 7.1, 8.0, 8.0, 8.6];
const SUNSET_HOUR = [16.8, 17.8, 18.7, 20.6, 21.4, 22.0, 22.0, 21.1, 20.0, 18.8, 17.0, 16.5];

/** Where the current moment sits in the day. */
export function timeContext(at: Date = new Date()): TimeContext {
  const hour = at.getHours() + at.getMinutes() / 60;
  const month = at.getMonth();

  const isDark = hour < SUNRISE_HOUR[month] || hour >= SUNSET_HOUR[month];

  if (!isDark) return { segment: "day", isDark: false, label: "overdag" };

  // Late night is treated separately: fewer people about, less help nearby.
  const isLateNight = hour >= 23 || hour < 5;
  return isLateNight
    ? { segment: "night", isDark: true, label: "'s nachts" }
    : { segment: "evening", isDark: true, label: "in het donker" };
}

/**
 * Overall risk multiplier for the time of day.
 *
 * Applied to the whole route, on top of the per-report weighting below.
 */
export function timeRiskMultiplier(context: TimeContext): number {
  switch (context.segment) {
    case "night":
      return 1.6;
    case "evening":
      return 1.3;
    default:
      return 1;
  }
}

/** The raw values the imported dataset uses in its `Tijdstip` column. */
const DARK_ONLY = "vooral als het donker is";
const DAY_ONLY = "vooral overdag";

/**
 * How relevant one report is right now.
 *
 * A location that people flagged as frightening after dark barely matters at
 * two in the afternoon, and matters more than usual at midnight.
 */
export function reportTimeRelevance(
  reportedTimeOfDay: string | null,
  context: TimeContext
): number {
  const value = reportedTimeOfDay?.trim().toLowerCase();

  // No information: treat the report as applying at any time.
  if (!value) return 1;

  if (value.includes(DARK_ONLY)) {
    // Strongly tied to darkness.
    return context.isDark ? 1.25 : 0.35;
  }

  if (value.includes(DAY_ONLY)) {
    return context.isDark ? 0.4 : 1.25;
  }

  // "Op verschillende momenten van de dag" and anything unrecognised.
  return 1;
}
