import {
  AlertOctagon,
  Car,
  Eye,
  Flag,
  Lightbulb,
  ShieldAlert,
  ShoppingBag,
  UserX,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type { ReportBasis, SafetyReport } from "./types";

/**
 * How a report type is shown: an icon and a Dutch label.
 *
 * `value` is exactly what `safety_reports.report_type` stores, so the report
 * dialog writes the same strings it always has.
 */

export interface ReportTypeOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

/** The types a user can pick when filing a report, in display order. */
export const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  { value: "Harassment", label: "Intimidatie", Icon: UserX },
  { value: "Theft", label: "Diefstal", Icon: ShoppingBag },
  { value: "Unsafe Area", label: "Onveilige plek", Icon: ShieldAlert },
  { value: "Poor Lighting", label: "Slechte verlichting", Icon: Lightbulb },
  { value: "Suspicious Activity", label: "Verdachte activiteit", Icon: Eye },
  { value: "Traffic Risk", label: "Verkeersgevaar", Icon: Car },
  { value: "Disturbance", label: "Overlast", Icon: Volume2 },
  { value: "Other", label: "Overig", Icon: Flag },
];

/** Types that may exist in older rows but are not offered in the picker. */
const EXTRA_TYPES: ReportTypeOption[] = [
  { value: "Assault", label: "Geweld", Icon: AlertOctagon },
];

/** Imported reports carry a free-text reason; group them by what it says. */
const BASIS_META: Record<ReportBasis, Omit<ReportTypeOption, "value">> = {
  incident: { label: "Incident", Icon: AlertOctagon },
  behaviour: { label: "Gedrag van anderen", Icon: UserX },
  perception: { label: "Voelt onveilig", Icon: ShieldAlert },
  unknown: { label: "Melding", Icon: Flag },
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ");

const BY_VALUE = new Map(
  [...REPORT_TYPE_OPTIONS, ...EXTRA_TYPES].map((option) => [normalise(option.value), option])
);

export function getReportTypeMeta(report: SafetyReport): Omit<ReportTypeOption, "value"> {
  if (report.source === "kro") return BASIS_META[report.basis];
  return BY_VALUE.get(normalise(report.reportType)) ?? { label: report.reportType, Icon: Flag };
}

/** Options for the type filter: the picker's types plus the imported reasons. */
export const TYPE_FILTER_OPTIONS: ReportTypeOption[] = [
  ...REPORT_TYPE_OPTIONS,
  { value: "kro:incident", ...BASIS_META.incident },
  { value: "kro:behaviour", ...BASIS_META.behaviour },
  { value: "kro:perception", ...BASIS_META.perception },
];

/** The filter key a report belongs to; matches a `TYPE_FILTER_OPTIONS` value. */
export function getReportTypeKey(report: SafetyReport): string {
  if (report.source === "kro") return `kro:${report.basis}`;
  return BY_VALUE.get(normalise(report.reportType))?.value ?? "Other";
}
