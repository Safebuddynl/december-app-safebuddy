import { useState } from "react";
import { Loader2, Locate, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import LocationSearchInput from "@/components/route/LocationSearchInput";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_TYPE_OPTIONS } from "@/lib/reports/reportTypes";
import { cn } from "@/lib/utils";

interface ReportLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportSubmitted?: () => void;
}

const SEVERITY_OPTIONS = [
  { value: "low", label: "Laag", swatch: "bg-success" },
  { value: "medium", label: "Matig", swatch: "bg-warning" },
  { value: "high", label: "Hoog", swatch: "bg-destructive" },
] as const;

/** Stored values are the same English words the dialog always wrote. */
const TIME_OPTIONS = [
  { value: "Morning", label: "Ochtend" },
  { value: "Afternoon", label: "Middag" },
  { value: "Evening", label: "Avond" },
  { value: "Night", label: "Nacht" },
] as const;

const MAX_DESCRIPTION = 500;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const ReportLocationDialog = ({ open, onOpenChange, onReportSubmitted }: ReportLocationDialogProps) => {
  const [locationAddress, setLocationAddress] = useState("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [reportType, setReportType] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const handleGetCurrentLocation = async () => {
    // Check HTTPS
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
      toast.error("HTTPS is vereist voor locatie");
      return;
    }

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      toast.error("Geolocation wordt niet ondersteund door je browser");
      return;
    }

    setIsLocating(true);
    toast.loading("Locatie ophalen...");

    // Skip permissions API on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (!isIOS && navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          toast.dismiss();
          toast.error("Locatie toegang is geblokkeerd. Ga naar je browser instellingen.");
          setIsLocating(false);
          return;
        }
      } catch {
        // Continue anyway
      }
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Sla coördinaten direct op
          setCoordinates({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json&addressdetails=1`
          );
          const data = await response.json();
          if (data && data.address) {
            const addr = data.address;
            let streetAddress = "";
            if (addr.road) {
              streetAddress = addr.road;
              if (addr.house_number) streetAddress += ` ${addr.house_number}`;
            }
            if (addr.city || addr.town || addr.village) {
              streetAddress += streetAddress ? `, ${addr.city || addr.town || addr.village}` : (addr.city || addr.town || addr.village);
            }
            setLocationAddress(streetAddress || data.display_name);
          }
          toast.dismiss();
          toast.success("Locatie gevonden");
        } catch (error) {
          console.error("Reverse geocoding failed:", error);
          toast.dismiss();
          toast.error("Kon adres niet ophalen");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        toast.dismiss();
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Locatie toegang geweigerd. Sta locatie toe in je browser/telefoon instellingen.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Locatie niet beschikbaar. Zet GPS aan.");
            break;
          case error.TIMEOUT:
            toast.error("Locatie ophalen duurde te lang. Probeer opnieuw.");
            break;
          default:
            toast.error("Kon locatie niet ophalen");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!locationAddress || !reportType) {
      toast.error("Vul een adres in en kies wat er aan de hand is");
      return;
    }

    if (!coordinates) {
      toast.error("Kies een adres uit de suggesties of gebruik je huidige locatie");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Log in om een melding te plaatsen");
        return;
      }

      // PostGIS verwacht POINT(longitude latitude) format
      const locationString = `POINT(${coordinates.lon} ${coordinates.lat})`;

      const { error } = await supabase.from("safety_reports").insert({
        user_id: user.id,
        location_address: locationAddress,
        location: locationString,
        report_type: reportType,
        severity,
        time_of_day: timeOfDay,
        description,
      });

      if (error) throw error;

      toast.success("Melding geplaatst", { description: "Dank je. Je melding is nu zichtbaar." });
      onReportSubmitted?.();

      // Emit event so Profile can update report count
      window.dispatchEvent(new Event('reportSubmitted'));

      setLocationAddress("");
      setCoordinates(null);
      setReportType("");
      setSeverity("medium");
      setTimeOfDay("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Melding plaatsen mislukt. Probeer het opnieuw.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="gradient-header space-y-1 rounded-t-2xl p-5 text-left">
          <DialogTitle className="text-lg text-primary-foreground">Nieuwe melding</DialogTitle>
          <p className="text-sm text-primary-foreground/80">
            Help anderen door een onveilige plek te melden.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 p-5">
          <section className="space-y-2">
            <p id="report-location-label" className="text-sm font-semibold">
              Waar is het?
            </p>
            <LocationSearchInput
              value={locationAddress}
              onValueChange={setLocationAddress}
              onSelect={(suggestion) => {
                setLocationAddress(suggestion.label);
                // Stored so the report can be written as a PostGIS point.
                setCoordinates({ lat: suggestion.lat, lon: suggestion.lng });
              }}
              placeholder="Zoek een adres of straat"
              ariaLabel="Adres"
              inputClassName="h-11 rounded-xl border border-input bg-background pr-3"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleGetCurrentLocation()}
                disabled={isLocating}
                className="rounded-full"
              >
                {isLocating ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Locate className="h-4 w-4" />
                )}
                Gebruik huidige locatie
              </Button>
              {coordinates && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Locatie vastgelegd
                </span>
              )}
            </div>
          </section>

          <section>
            <p id="report-type-label" className="mb-2 text-sm font-semibold">
              Wat is er aan de hand?
            </p>
            <div
              role="radiogroup"
              aria-labelledby="report-type-label"
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
            >
              {REPORT_TYPE_OPTIONS.map(({ value, label, Icon }) => {
                const selected = reportType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReportType(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center text-[11px] font-medium leading-tight transition-colors motion-reduce:transition-none",
                      selected
                        ? "border-primary bg-primary-tint text-primary"
                        : "border-border bg-card text-foreground hover:bg-muted",
                      focusRing
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p id="report-severity-label" className="mb-2 text-sm font-semibold">
              Hoe ernstig?
            </p>
            <div
              role="radiogroup"
              aria-labelledby="report-severity-label"
              className="grid grid-cols-3 gap-2"
            >
              {SEVERITY_OPTIONS.map(({ value, label, swatch }) => {
                const selected = severity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSeverity(value)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors motion-reduce:transition-none",
                      selected
                        ? "border-primary bg-primary-tint text-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted",
                      focusRing
                    )}
                  >
                    <span aria-hidden="true" className={cn("h-3.5 w-3.5 rounded-full", swatch)} />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p id="report-time-label" className="mb-2 text-sm font-semibold">
              Wanneer speelt het? <span className="font-normal text-muted-foreground">(optioneel)</span>
            </p>
            <div role="radiogroup" aria-labelledby="report-time-label" className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map(({ value, label }) => {
                const selected = timeOfDay === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTimeOfDay(selected ? "" : value)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted",
                      focusRing
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="report-description" className="text-sm font-semibold">
                Toelichting <span className="font-normal text-muted-foreground">(optioneel)</span>
              </label>
              <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {description.length}/{MAX_DESCRIPTION}
              </span>
            </div>
            <Textarea
              id="report-description"
              placeholder="Wat moeten anderen weten?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              className="rounded-xl"
            />
          </section>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 rounded-xl"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {isSubmitting ? "Bezig met plaatsen…" : "Melding plaatsen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportLocationDialog;
