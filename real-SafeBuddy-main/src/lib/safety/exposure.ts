import { MEDIAN_DENSITY, MUNICIPALITY_STATS } from "@/data/municipalityDensity";

/**
 * Correcting report counts for how many people are around.
 *
 * A safety report is only created when someone is there to create it, so raw
 * report counts largely measure footfall rather than danger. Measured on this
 * project's own data across 330 municipalities:
 *
 *   log(reports) ~ log(population)      slope 1.42, R² 0.70
 *   log(reports/km²) ~ log(density)     slope 1.34, R² 0.78
 *
 * In other words, population explains about three quarters of the variation in
 * how many reports a place has. Without correcting for it, Amsterdam looks
 * catastrophic and every village looks perfectly safe, purely because
 * 931.000 people live in one and 25.000 in the other.
 *
 * So each report is divided by an exposure factor derived from the local
 * population density: one report in a quiet village says far more about that
 * place than one report on Amsterdam Centraal.
 */

/**
 * How strongly to correct. 1.0 means "reports per inhabitant", the standard
 * way to compare places of different sizes.
 *
 * Fitting the exponent that removes the density correlation entirely gives
 * 1.3, but that over-corrects: it assumes every extra report in a city is
 * pure exposure, when cities genuinely do have more incidents per square
 * kilometre. Per-capita keeps that real difference visible while removing the
 * part that is only about headcount.
 */
const EXPOSURE_EXPONENT = 1.0;

/**
 * Bounds on the correction.
 *
 * Unclamped, the densest city and the emptiest village differ by a factor of
 * 50, which lets a single report in an empty municipality dominate a route.
 * Clamping keeps the correction meaningful without letting it run away.
 */
const MIN_EXPOSURE = 0.4;
const MAX_EXPOSURE = 4.0;

export interface ExposureContext {
  /** Municipality name, as spelled in the report data. */
  municipality: string | null;
  /** Inhabitants per km², or null when the municipality is unknown. */
  density: number | null;
  /** CBS urbanity class, 1 (very urban) to 5 (rural). */
  urbanity: number | null;
  /** The divisor applied to report weights. */
  exposure: number;
}

/**
 * How much footfall to expect in a municipality, relative to the national
 * median. Above 1 means busier than average, so reports there count for less.
 */
export function exposureFor(municipality: string | null | undefined): ExposureContext {
  const name = municipality?.trim();
  const stats = name ? MUNICIPALITY_STATS[name] : undefined;

  if (!stats) {
    // Unknown municipality: apply no correction rather than guessing.
    return { municipality: name ?? null, density: null, urbanity: null, exposure: 1 };
  }

  const raw = Math.pow(stats.density / MEDIAN_DENSITY, EXPOSURE_EXPONENT);

  return {
    municipality: name ?? null,
    density: stats.density,
    urbanity: stats.urbanity,
    exposure: clamp(raw, MIN_EXPOSURE, MAX_EXPOSURE),
  };
}

/**
 * Whether a place is quiet enough that being alone is itself a factor.
 *
 * Crowds cut both ways: they generate more reports, but they also mean more
 * people around to notice something. An isolated road at night is a different
 * kind of risk from a busy street, and the score treats it as one.
 */
export function isIsolated(urbanity: number | null): boolean {
  return urbanity !== null && urbanity >= 4;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
