import { useState } from "react";
import { AlertTriangle, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEmergencyNumber } from "@/hooks/useEmergencyNumber";
import type { LatLng } from "@/lib/geo";

/**
 * De noodknop.
 *
 * Belt niet meteen. Eerst verschijnt een bevestiging met het nummer erin, want
 * per ongeluk het alarmnummer bellen is vervelend voor de meldkamer, en de
 * gebruiker moet kunnen zien dát het het juiste nummer voor dit land is.
 */
export interface PanicButtonProps {
  /** Huidige positie, waaruit het land wordt bepaald. */
  position: LatLng | null;
}

const PanicButton = ({ position }: PanicButtonProps) => {
  const { emergency, isResolving, isConfirmed } = useEmergencyNumber(position);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="destructive"
        onClick={() => setIsOpen(true)}
        aria-label={`Noodnummer bellen: ${emergency.number}`}
        className="h-14 w-14 rounded-full shadow-2xl"
      >
        <span className="text-sm font-bold leading-none">SOS</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm border-0 shadow-2xl">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-destructive/15 p-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <h2 className="text-base font-bold">Noodoproep</h2>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  aria-label="Sluiten"
                  className="h-7 w-7 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <p className="mb-1 text-sm text-muted-foreground">
                Je staat op het punt te bellen naar:
              </p>
              <p className="mb-1 text-4xl font-bold tracking-tight">{emergency.number}</p>
              <p className="text-sm text-muted-foreground">
                {isResolving
                  ? "Land wordt bepaald..."
                  : isConfirmed
                    ? `Het algemene noodnummer in ${emergency.country}.`
                    : emergency.note}
              </p>

              {!isResolving && isConfirmed && emergency.note && (
                <p className="mt-2 text-xs text-muted-foreground">{emergency.note}</p>
              )}

              {!position && (
                <p className="mt-3 rounded bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  Je locatie is niet bekend, dus dit is het standaardnummer. Controleer het
                  als je in het buitenland bent.
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                  Annuleren
                </Button>
                {/* Een tel:-link laat het toestel zelf de kiezer openen, zodat
                    de gebruiker het gesprek nog kan afbreken. */}
                <Button asChild variant="destructive" className="flex-1">
                  <a href={`tel:${emergency.number}`}>
                    <Phone className="mr-2 h-4 w-4" />
                    Bel {emergency.number}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default PanicButton;
