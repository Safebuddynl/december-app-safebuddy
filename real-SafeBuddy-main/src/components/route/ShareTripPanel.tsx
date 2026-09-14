import { useEffect, useState } from "react";
import { Check, Copy, Share2, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { listContacts, shareUrlFor, type TripShare, type TrustedContact } from "@/lib/trips";
import { cn } from "@/lib/utils";

/**
 * "Deel mijn rit" en de check-in timer.
 *
 * De timer hoort hier omdat hij op dezelfde rit werkt: de verwachte
 * aankomsttijd wordt bij het starten meegegeven, en een server-side controle
 * waarschuwt de contacten als er niet op tijd is afgemeld.
 */
export interface ShareTripPanelProps {
  trip: TripShare | null;
  isBusy: boolean;
  destinationAddress: string | null;
  onStart: (expectedArrival: Date | null, contactIds: string[]) => void;
  onStop: () => void;
  /** Veilig afgemeld: sluit de rit zonder iemand te waarschuwen. */
  onCheckIn: () => void;
  /** Het duurt langer; schuif de check-in op. */
  onExtend: (extraMinutes: number) => void;
  /** Drop the card chrome when shown inside another panel. */
  embedded?: boolean;
}

/** Keuzes voor de check-in timer, in minuten. */
const TIMER_OPTIONS = [15, 30, 60, 120];

const ShareTripPanel = ({
  trip,
  isBusy,
  destinationAddress,
  onStart,
  onStop,
  onCheckIn,
  onExtend,
  embedded = false,
}: ShareTripPanelProps) => {
  const { user } = useCurrentUser();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    listContacts()
      .then(setContacts)
      .catch((error) => console.error("[SafeBuddy] Contacten laden mislukt:", error));
  }, [user]);

  const cardClass = cn(
    "border-0 bg-background/95 shadow-lg backdrop-blur-sm",
    embedded && "bg-transparent shadow-none backdrop-blur-none"
  );
  const padding = embedded ? "p-0" : "p-3";

  if (!user) {
    return (
      <Card className={cardClass}>
        <CardContent className={padding}>
          <p className="text-xs text-muted-foreground">
            Log in om je rit te delen met een vertrouwd contact.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (trip) {
    const url = shareUrlFor(trip.shareToken);

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Link gekopieerd");
      } catch {
        toast.error("Kopiëren mislukt. Selecteer de link handmatig.");
      }
    };

    return (
      <Card className={cardClass}>
        <CardContent className={cn("space-y-2", padding)}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <p className="text-sm font-semibold">Je rit wordt gedeeld</p>
          </div>

          <div className="flex gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-[11px]">{url}</code>
            <Button size="sm" variant="outline" onClick={() => void copy()} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          {trip.expectedArrival ? (
            <div className="space-y-2 rounded-lg border border-muted p-2">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                Meld je af voor{" "}
                <span className="font-semibold text-foreground">
                  {new Date(trip.expectedArrival).toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                , anders krijgen je contacten je laatste locatie.
              </p>

              <div className="flex gap-2">
                <Button size="sm" onClick={onCheckIn} disabled={isBusy} className="flex-1">
                  <Check className="mr-1 h-4 w-4" />
                  Ik ben veilig
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onExtend(15)}
                  disabled={isBusy}
                  className="shrink-0"
                >
                  +15 min
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={onCheckIn} disabled={isBusy} className="w-full">
              <Check className="mr-1 h-4 w-4" />
              Ik ben veilig aangekomen
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={onStop}
            disabled={isBusy}
            className="h-8 w-full text-xs text-muted-foreground"
          >
            <Square className="mr-1 h-3 w-3" />
            Alleen stoppen met delen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );

  return (
    <Card className={cardClass}>
      <CardContent className={cn("space-y-3", padding)}>
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Deel je rit</p>
        </div>

        {contacts.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Wie mag meekijken?</p>
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggle(contact.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selected.includes(contact.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {contact.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" />
            Waarschuw ze als ik me niet afmeld binnen
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TIMER_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMinutes(minutes === option ? null : option)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  minutes === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {option < 60 ? `${option} min` : `${option / 60} uur`}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          onClick={() =>
            onStart(minutes ? new Date(Date.now() + minutes * 60_000) : null, selected)
          }
          disabled={isBusy}
          className="w-full"
        >
          <Share2 className="mr-2 h-4 w-4" />
          {destinationAddress ? "Deel deze rit" : "Deel mijn locatie"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ShareTripPanel;
