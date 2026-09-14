import { SpatialGrid, distanceKm } from "@/lib/geo";
import {
  BASIS_WEIGHT,
  ageInDays,
  type MappedReport,
  type ReportBasis,
  type Severity,
} from "@/lib/reports/types";
import { exposureFor, isIsolated, type ExposureContext } from "@/lib/safety/exposure";
import type { LightingResult } from "@/lib/safety/lighting";
import {
  reportTimeRelevance,
  timeContext,
  timeRiskMultiplier,
  type TimeContext,
} from "@/lib/safety/timeOfDay";

/**
 * Scoring how safe a route is.
 *
 * The score blends what the community reported with objective properties of
 * the place, because reports alone have a cold-start problem: a street with no
 * reports is not safe, it is unmeasured. Four things feed in.
 *
 * 1. **Reports near the route**, weighted by severity, age, distance, what
 *    kind of evidence they are, and whether they apply at this time of day.
 * 2. **Population density**, which corrects for the fact that busy places
 *    generate more reports regardless of danger. See `safety/exposure.ts`.
 * 3. **Street lighting** from OpenStreetMap, which matters after dark and
 *    exists whether or not anyone filed a report.
 * 4. **Time of day**, which changes how much all of the above counts.
 *
 * Every component is kept separately in the result so the interface, and the
 * plain-language explanation, can say *why* a route scored what it did.
 */

/** Reports further than this from the route are ignored. */
const INFLUENCE_RADIUS_KM = 0.2;

/** How much each report contributes, before all the weighting. */
const SEVERITY_WEIGHT: Record<Severity, number> = { high: 40, medium: 20, low: 8 };

/** Reports at least this relevant are named in the warning list. */
const MIN_RELEVANCE_TO_WARN = 0.5;

/** Cap on warnings shown, so the dialog stays readable on a long route. */
const MAX_WARNINGS = 20;

/** The risk value that scores 50. Higher means the score falls more slowly. */
const RISK_HALF_POINT = 60;

/**
 * Risk added by walking an unlit route after dark, at zero lamp coverage.
 * Scaled by how much of the route is dark and by the length of the trip.
 */
const MAX_DARKNESS_RISK = 45;

/** Extra risk for a route through sparsely populated area after dark. */
const ISOLATION_RISK = 15;

export interface RouteWarning {
  reportType: string;
  severity: Severity;
  locationAddress: string;
  basis: ReportBasis;
}

/** One named contribution to the score, for display and explanation. */
export interface RiskFactor {
  key: "reports" | "darkness" | "isolation";
  /** How much risk this added. */
  risk: number;
  /** A short phrase describing it, in Dutch. */
  detail: string;
}

export interface RouteSafety {
  /** 0 (worst) to 100 (no known problems). */
  score: number;
  /** Sum of all weighted risk, before it is mapped onto the score. */
  risk: number;
  /** What drove the score, largest contribution first. */
  factors: RiskFactor[];
  /** How many distinct reports lie within the influence radius. */
  reportsNearRoute: number;
  /** The most serious warnings, at most {@link MAX_WARNINGS} of them. */
  warnings: RouteWarning[];
  /** How many warnings there were in total, before the cap. */
  totalWarnings: number;
  /** The time the route was scored for. */
  time: TimeContext;
  /** Population context of the area the route passes through. */
  exposure: ExposureContext;
  /** Lighting coverage, or null when it could not be determined. */
  lighting: LightingResult | null;
}

export interface ScoreOptions {
  /** Defaults to now. */
  at?: Date;
  /** Lighting data, when it has been fetched. */
  lighting?: LightingResult | null;
  /** Route length in kilometres, used to scale the darkness factor. */
  distanceKm?: number;
}

/**
 * How much weight a report still carries, given its age.
 * Recent reports count fully; a report over a year old counts for a fifth.
 */
export function ageFactor(days: number): number {
  if (!Number.isFinite(days)) return 0.2;
  if (days > 365) return 0.2;
  if (days > 180) return 0.4;
  if (days > 90) return 0.6;
  if (days > 30) return 0.8;
  if (days > 7) return 0.9;
  return 1;
}

/**
 * Build the lookup structure once per set of reports.
 *
 * Creating this is the expensive part, so callers should build it once and
 * reuse it across every candidate route rather than per route.
 */
export function buildReportIndex(reports: readonly MappedReport[]): SpatialGrid<MappedReport> {
  return new SpatialGrid(reports);
}

/**
 * Score one route.
 *
 * @param coordinates route vertices as [lat, lng] pairs
 * @param index       reports indexed by {@link buildReportIndex}
 */
export function scoreRoute(
  coordinates: readonly [number, number][],
  index: SpatialGrid<MappedReport>,
  options: ScoreOptions = {}
): RouteSafety {
  const time = timeContext(options.at);
  const now = (options.at ?? new Date()).getTime();

  const nearby = collectNearbyReports(coordinates, index);
  const exposure = dominantExposure(nearby);

  let reportRisk = 0;
  const warnings: RouteWarning[] = [];

  for (const { candidate, distance } of nearby) {
    const { report } = candidate;

    const age = ageFactor(ageInDays(report.createdAt, now));
    // Closer reports weigh more: full weight on the route, half at the edge.
    const proximity = Math.max(0.5, 1 - distance / INFLUENCE_RADIUS_KM);
    const relevance = reportTimeRelevance(report.timeOfDay, time);
    const basis = BASIS_WEIGHT[report.basis];

    reportRisk += SEVERITY_WEIGHT[report.severity] * age * proximity * relevance * basis;

    if (age * relevance > MIN_RELEVANCE_TO_WARN && report.severity !== "low") {
      warnings.push({
        reportType: report.reportType,
        severity: report.severity,
        locationAddress: report.locationAddress,
        basis: report.basis,
      });
    }
  }

  // Correct for how many people are around to file reports in the first place.
  reportRisk /= exposure.exposure;

  // Everything weighs more after dark.
  reportRisk *= timeRiskMultiplier(time);

  const factors: RiskFactor[] = [];
  if (reportRisk > 0) {
    factors.push({
      key: "reports",
      risk: reportRisk,
      detail: describeReports(nearby.length, exposure, time),
    });
  }

  const darkness = darknessRisk(time, options.lighting, options.distanceKm ?? 0);
  if (darkness) factors.push(darkness);

  const isolation = isolationRisk(time, exposure);
  if (isolation) factors.push(isolation);

  const risk = factors.reduce((total, factor) => total + factor.risk, 0);
  factors.sort((a, b) => b.risk - a.risk);

  // Show the most serious warnings first.
  warnings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  return {
    score: riskToScore(risk),
    risk,
    factors,
    reportsNearRoute: nearby.length,
    warnings: warnings.slice(0, MAX_WARNINGS),
    totalWarnings: warnings.length,
    time,
    exposure,
    lighting: options.lighting ?? null,
  };
}

interface NearbyReport {
  candidate: MappedReport;
  distance: number;
}

/** Every distinct report within the influence radius of the route. */
function collectNearbyReports(
  coordinates: readonly [number, number][],
  index: SpatialGrid<MappedReport>
): NearbyReport[] {
  const found = new Map<string, NearbyReport>();

  for (const [lat, lng] of coordinates) {
    for (const candidate of index.near(lat, lng, INFLUENCE_RADIUS_KM)) {
      const distance = distanceKm(lat, lng, candidate.lat, candidate.lng);
      if (distance >= INFLUENCE_RADIUS_KM) continue;

      // Keep the closest approach, not the first one encountered.
      const existing = found.get(candidate.report.id);
      if (!existing || distance < existing.distance) {
        found.set(candidate.report.id, { candidate, distance });
      }
    }
  }

  return [...found.values()];
}

/**
 * The population context to correct by.
 *
 * Taken from the municipality most of the nearby reports sit in, which is the
 * area the route actually runs through. With no reports there is nothing to
 * correct, so the neutral context is returned.
 */
function dominantExposure(nearby: readonly NearbyReport[]): ExposureContext {
  const tally = new Map<string, number>();

  for (const { candidate } of nearby) {
    const name = candidate.report.municipality;
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of tally) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }

  return exposureFor(best);
}

/**
 * Risk from travelling an unlit route after dark.
 *
 * Scaled by trip length, because ten minutes on an unlit path is a smaller
 * exposure than an hour of it. Returns null when it is light out, or when
 * lighting data could not be fetched: unknown is not the same as unlit.
 */
function darknessRisk(
  time: TimeContext,
  lighting: LightingResult | null | undefined,
  routeKm: number
): RiskFactor | null {
  if (!time.isDark || !lighting || lighting.sampled === 0) return null;

  const unlitShare = 1 - lighting.coverage;
  if (unlitShare <= 0.1) return null;

  // A 2 km trip is treated as the reference length.
  const lengthFactor = Math.min(1.5, Math.max(0.4, routeKm / 2));
  const risk = MAX_DARKNESS_RISK * unlitShare * lengthFactor;

  return {
    key: "darkness",
    risk,
    detail:
      `${Math.round(unlitShare * 100)}% van de route heeft geen straatverlichting ` +
      `in OpenStreetMap, en je reist ${time.label}`,
  };
}

/** Extra risk for a quiet area after dark, where there are few people about. */
function isolationRisk(time: TimeContext, exposure: ExposureContext): RiskFactor | null {
  if (!time.isDark || !isIsolated(exposure.urbanity)) return null;

  return {
    key: "isolation",
    risk: ISOLATION_RISK,
    detail: `dunbevolkt gebied (${exposure.density ?? "?"} inwoners per km²), weinig mensen op straat ${time.label}`,
  };
}

function describeReports(count: number, exposure: ExposureContext, time: TimeContext): string {
  const base = `${count} ${count === 1 ? "melding" : "meldingen"} binnen 200 m van de route`;

  if (exposure.density === null) return base;

  const corrected =
    exposure.exposure > 1.2
      ? `, gecorrigeerd voor de drukte van ${exposure.municipality} (${exposure.density} inw./km²)`
      : exposure.exposure < 0.85
        ? `, zwaarder gewogen omdat ${exposure.municipality} dunbevolkt is (${exposure.density} inw./km²)`
        : "";

  return `${base}${corrected}, beoordeeld ${time.label}`;
}

/**
 * Map accumulated risk onto a 0-100 score.
 *
 * Subtracting each penalty from 100 directly does not work across a whole
 * country of reports: a route through a busy city centre passes dozens of
 * them and bottoms out at 0, which makes every urban route look identical and
 * leaves nothing to choose between. This curve keeps falling as risk rises, so
 * two busy routes can still be compared, while a genuinely quiet route still
 * scores near 100.
 *
 *   risk    0 →  100      risk   60 →  50
 *   risk   20 →   75      risk  180 →  25
 */
export function riskToScore(risk: number): number {
  return Math.round(100 / (1 + Math.max(0, risk) / RISK_HALF_POINT));
}

/** Wording that matches a score band, used for badges and headings. */
export function safetyLabel(score: number): "safe" | "caution" | "risky" {
  if (score >= 90) return "safe";
  if (score >= 70) return "caution";
  return "risky";
}
