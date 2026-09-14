import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, Locate, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/LanguageContext";
import type { LatLng } from "@/lib/geo";
import { reverseGeocode } from "@/lib/geocoding";
import { SEVERITY_HEX, SEVERITY_LABEL } from "@/lib/reports/severity";
import type { Severity } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * Report a dangerous spot: where, what, and how serious.
 *
 * The place comes from the map (the centre, or a long-press), so the user
 * never has to type an address. The address is looked up for display and
 * stored with the report, as the existing report dialog does.
 */

export interface HazardSubmission {
  point: LatLng;
  address: string;
  reportType: string;
  severity: Severity;
  description: string;
}

export interface ReportHazardFormProps {
  point: LatLng;
  onUseMyLocation: () => void;
  isLocating: boolean;
  /** Resolves to true when the report was stored. */
  onSubmit: (submission: HazardSubmission) => Promise<boolean>;
  onCancel: () => void;
  isLoggedIn: boolean;
}

/** Same values the report dialog stores, with their translation keys. */
const REPORT_TYPES = [
  { value: "Poor Lighting", key: "poorLighting" },
  { value: "Harassment", key: "harassment" },
  { value: "Theft", key: "theft" },
  { value: "Suspicious Activity", key: "suspiciousActivity" },
  { value: "Traffic Risk", key: "trafficRisk" },
  { value: "Disturbance", key: "disturbance" },
  { value: "Unsafe Area", key: "unsafeArea" },
  { value: "Other", key: "other" },
] as const;

const SEVERITIES: Severity[] = ["low", "medium", "high"];

/** Wait for the map to settle before looking up the address. */
const ADDRESS_DEBOUNCE_MS = 500;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

const ReportHazardForm = ({
  point,
  onUseMyLocation,
  isLocating,
  onSubmit,
  onCancel,
  isLoggedIn,
}: ReportHazardFormProps) => {
  const { t } = useLanguage();
  const [address, setAddress] = useState("");
  const [isResolving, setIsResolving] = useState(true);
  const [reportType, setReportType] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setIsResolving(true);
    const timer = setTimeout(async () => {
      const found = await reverseGeocode(point);
      if (!active) return;
      setAddress(found);
      setIsResolving(false);
    }, ADDRESS_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [point]);

  if (!isLoggedIn) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-ink-soft">
          Log in om een gevaarlijke plek te melden. Zo kunnen we misbruik tegengaan.
        </p>
        <Link
          to="/auth"
          className={cn(
            "flex h-12 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white hover:bg-brand-hover",
            focusRing
          )}
        >
          Inloggen
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportType || isSubmitting) return;

    setIsSubmitting(true);
    const stored = await onSubmit({
      point,
      address: address || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      reportType,
      severity,
      description,
    });
    // On success the form unmounts; only reset the busy state on failure.
    if (!stored) setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-1">
      <div className="flex items-center gap-3 rounded-2xl bg-tint p-3">
        <MapPin className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-xs text-ink-soft">Plek</p>
          <p className="truncate text-sm font-medium text-ink">
            {isResolving ? "Adres zoeken…" : address}
          </p>
        </div>
        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={isLocating}
          aria-label="Gebruik mijn locatie"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-sm hover:bg-brand-tint disabled:opacity-60",
            focusRing
          )}
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Locate className="h-4 w-4" />
          )}
        </button>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Wat is er aan de hand?</legend>
        <div role="radiogroup" aria-label="Soort melding" className="flex flex-wrap gap-2">
          {REPORT_TYPES.map(({ value, key }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reportType === value}
              onClick={() => setReportType(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
                reportType === value
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line bg-surface text-ink hover:bg-tint",
                focusRing
              )}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Hoe ernstig?</legend>
        <div role="radiogroup" aria-label="Ernst" className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={severity === option}
              onClick={() => setSeverity(option)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-colors motion-reduce:transition-none",
                severity === option
                  ? "border-brand bg-brand-tint text-ink"
                  : "border-line bg-surface text-ink hover:bg-tint",
                focusRing
              )}
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: SEVERITY_HEX[option] }}
              />
              {SEVERITY_LABEL[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="hazard-description" className="mb-2 block text-sm font-semibold text-ink">
          Toelichting <span className="font-normal text-ink-soft">(optioneel)</span>
        </label>
        <Textarea
          id="hazard-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Wat moeten anderen weten?"
          className="rounded-2xl border-line bg-surface text-ink"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "h-12 rounded-2xl border border-line px-4 text-sm font-semibold text-ink hover:bg-tint",
            focusRing
          )}
        >
          Annuleren
        </button>
        <button
          type="submit"
          disabled={!reportType || isSubmitting}
          className={cn(
            "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50",
            focusRing
          )}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {reportType ? "Melding plaatsen" : "Kies wat er aan de hand is"}
        </button>
      </div>
    </form>
  );
};

export default ReportHazardForm;
