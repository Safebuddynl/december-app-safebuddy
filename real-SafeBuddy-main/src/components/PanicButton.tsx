import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEmergencyNumber } from "@/hooks/useEmergencyNumber";
import type { LatLng } from "@/lib/geo";

/**
 * De noodknop.
 *
 * Eerst een seconde ingedrukt houden, met een ring die volloopt: één tik in
 * een broekzak mag geen noodoproep starten. Daarna verschijnt nog steeds de
 * bevestiging met het nummer erin, want per ongeluk het alarmnummer bellen is
 * vervelend voor de meldkamer, en de gebruiker moet kunnen zien dát het het
 * juiste nummer voor dit land is.
 */
export interface PanicButtonProps {
  /** Huidige positie, waaruit het land wordt bepaald. */
  position: LatLng | null;
  /** Aangeroepen zodra de knop lang genoeg is ingedrukt. */
  onPanic?: () => void;
}

/** Hoe lang de knop ingedrukt moet blijven. */
const HOLD_MS = 1000;

const RING_RADIUS = 31;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const PanicButton = ({ position, onPanic }: PanicButtonProps) => {
  const { emergency, isResolving, isConfirmed } = useEmergencyNumber(position);
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const progressRef = useRef(0);

  const stopHold = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    progressRef.current = 0;
    setProgress(0);
  };

  const beginHold = () => {
    if (startRef.current !== null || isOpen) return;
    startRef.current = performance.now();

    const tick = (now: number) => {
      if (startRef.current === null) return;
      const value = Math.min(1, (now - startRef.current) / HOLD_MS);
      progressRef.current = value;
      setProgress(value);

      if (value >= 1) {
        stopHold();
        navigator.vibrate?.(80);
        setIsOpen(true);
        onPanic?.();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const releaseHold = () => {
    const wasHolding = startRef.current !== null;
    const reached = progressRef.current;
    stopHold();
    // A quick tap: explain how the button works instead of doing nothing.
    if (wasHolding && reached < 0.3) {
      toast("Houd de SOS-knop 1 seconde ingedrukt", { id: "sos-hint" });
    }
  };

  useEffect(() => stopHold, []);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      beginHold();
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releaseHold();
    }
  };

  return (
    <>
      <div className="relative h-[68px] w-[68px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 68 68"
          className="pointer-events-none absolute inset-0 -rotate-90"
        >
          {progress > 0 && (
            <circle cx="34" cy="34" r={RING_RADIUS} fill="none" stroke="#fff" strokeWidth="4" />
          )}
          <circle
            cx="34"
            cy="34"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--panic)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          />
        </svg>

        <button
          type="button"
          aria-label={`SOS: houd 1 seconde ingedrukt om ${emergency.number} te bellen`}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            beginHold();
          }}
          onPointerUp={releaseHold}
          onPointerLeave={releaseHold}
          onPointerCancel={releaseHold}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={releaseHold}
          className={`absolute inset-[6px] flex touch-none select-none items-center justify-center rounded-full bg-panic text-white shadow-float transition-transform duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            progress > 0 ? "scale-95" : ""
          }`}
        >
          <span className="text-sm font-bold leading-none">SOS</span>
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm border-0 shadow-2xl" role="alertdialog" aria-labelledby="sos-title">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-tint p-2">
                    <AlertTriangle className="h-5 w-5 text-panic" />
                  </div>
                  <h2 id="sos-title" className="text-base font-bold">Noodoproep</h2>
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
                <a
                  href={`tel:${emergency.number}`}
                  className="flex h-10 flex-1 items-center justify-center rounded-md bg-panic text-sm font-semibold text-white hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Bel {emergency.number}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default PanicButton;
