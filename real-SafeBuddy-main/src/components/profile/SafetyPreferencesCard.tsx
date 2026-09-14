import { Shield, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { useSafetyPreferences, type RouteModePreference } from "@/hooks/useSafetyPreferences";
import { cn } from "@/lib/utils";

/**
 * Safety preferences on the profile. Each change is stored immediately, on
 * this device, and read again by the map and the settings dialog.
 */

const ROUTE_OPTIONS: { value: RouteModePreference; label: string; Icon: typeof Shield }[] = [
  { value: "safe", label: "Veilig", Icon: ShieldCheck },
  { value: "fast", label: "Snel", Icon: Zap },
];

const SafetyPreferencesCard = () => {
  const { preferences, update } = useSafetyPreferences();
  const { theme, setTheme } = useTheme();

  return (
    <Card className="rounded-2xl border-0 shadow-card">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Veiligheidsvoorkeuren</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Wordt bewaard op dit apparaat.</p>

        <div className="mt-2 divide-y divide-border">
          <div className="py-3">
            <p id="pref-route-label" className="font-medium">
              Standaard route
            </p>
            <p className="text-sm text-muted-foreground">
              Welke route de kaart eerst laat zien na het plannen
            </p>
            <div
              role="radiogroup"
              aria-labelledby="pref-route-label"
              className="mt-3 grid grid-cols-2 gap-2"
            >
              {ROUTE_OPTIONS.map(({ value, label, Icon }) => {
                const selected = preferences.defaultRouteMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ defaultRouteMode: value })}
                    className={cn(
                      "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected
                        ? "border-primary bg-primary-tint text-primary"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <SwitchRow
            id="pref-dark-mode"
            title="Donkere modus"
            description="Een donker thema voor de hele app"
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />

          <SwitchRow
            id="pref-safety-alerts"
            title="Veiligheidswaarschuwingen"
            description="Waarschuwingen over onveilige plekken in de buurt"
            checked={preferences.safetyAlerts}
            onCheckedChange={(checked) => update({ safetyAlerts: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
};

const SwitchRow = ({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="min-w-0">
      <Label htmlFor={id} className="font-medium">
        {title}
      </Label>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

export default SafetyPreferencesCard;
