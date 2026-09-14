import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A panel floating at the bottom of the map that can be dragged between
 * snap points: hidden, peek (only the top part) and expanded.
 *
 * Dragging works on the handle and the peek area. The expanded content
 * scrolls normally, so a drag never fights a scroll.
 */

export type SheetState = "hidden" | "peek" | "expanded";

export interface BottomSheetProps {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  /** Always visible while the sheet is open. */
  peek: ReactNode;
  /** Shown when the sheet is dragged up. */
  children?: ReactNode;
  /** Height the sheet covers, so map controls can sit above it. */
  onVisibleHeightChange?: (pixels: number) => void;
  label: string;
  canHide?: boolean;
  /** Positions the sheet, e.g. `bottom-20`. */
  className?: string;
}

/** Space between the panel and the bottom edge; matches `mb-3`. */
const EDGE_GAP = 12;
/** A pointer must move this far before a tap becomes a drag. */
const DRAG_THRESHOLD = 6;
/** Pixels per millisecond that count as a flick. */
const FLICK_VELOCITY = 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const BottomSheet = ({
  state,
  onStateChange,
  peek,
  children,
  onVisibleHeightChange,
  label,
  canHide = true,
  className,
}: BottomSheetProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const [sizes, setSizes] = useState({ panel: 0, peek: 0 });
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const gestureRef = useRef<{ startY: number; startTime: number; active: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const hasMore = Boolean(children);
  const states: SheetState[] = [
    ...(canHide ? (["hidden"] as const) : []),
    "peek",
    ...(hasMore ? (["expanded"] as const) : []),
  ];
  const current: SheetState = states.includes(state) ? state : "peek";

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const peekElement = peekRef.current;
    if (!panel || !peekElement) return;

    const measure = () =>
      setSizes({ panel: panel.offsetHeight, peek: peekElement.offsetHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(peekElement);
    return () => observer.disconnect();
  }, []);

  const offsetFor = (target: SheetState) =>
    target === "expanded"
      ? 0
      : target === "peek"
        ? Math.max(0, sizes.panel - sizes.peek)
        : sizes.panel + EDGE_GAP + 40;

  const restingOffset = offsetFor(current);
  const offset =
    dragOffset === null
      ? restingOffset
      : clamp(
          restingOffset + dragOffset,
          offsetFor(states[states.length - 1]) - 24,
          offsetFor(states[0])
        );

  const visibleHeight = current === "hidden" ? 0 : sizes.panel - restingOffset + EDGE_GAP;
  useEffect(() => {
    onVisibleHeightChange?.(visibleHeight);
  }, [visibleHeight, onVisibleHeightChange]);

  // Keep keyboard focus out of parts that are off screen.
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = current === "hidden";
    if (moreRef.current) moreRef.current.inert = current !== "expanded";
  }, [current]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClickRef.current = false;
    gestureRef.current = { startY: event.clientY, startTime: event.timeStamp, active: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      gestureRef.current = null;
      return;
    }

    const dy = event.clientY - gesture.startY;
    if (!gesture.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      gesture.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragOffset(dy);
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture?.active) return;

    suppressClickRef.current = true;
    setDragOffset(null);
    if (cancelled) return;

    const dy = event.clientY - gesture.startY;
    const velocity = dy / Math.max(1, event.timeStamp - gesture.startTime);
    const index = states.indexOf(current);

    let next: SheetState;
    if (Math.abs(velocity) > FLICK_VELOCITY) {
      // States run from hidden to expanded, so dragging up moves forward.
      next = states[clamp(index + (dy < 0 ? 1 : -1), 0, states.length - 1)];
    } else {
      const target = restingOffset + dy;
      next = states.reduce((best, candidate) =>
        Math.abs(offsetFor(candidate) - target) < Math.abs(offsetFor(best) - target)
          ? candidate
          : best
      );
    }

    if (next !== current) onStateChange(next);
  };

  const toggle = () => {
    if (hasMore) onStateChange(current === "expanded" ? "peek" : "expanded");
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[2000] overflow-hidden pt-8",
        className
      )}
    >
      <div
        ref={panelRef}
        role="region"
        aria-label={label}
        className={cn(
          "pointer-events-auto mx-auto mb-3 w-[calc(100%-24px)] max-w-lg rounded-2xl bg-background",
          "shadow-[0_8px_30px_rgba(27,23,37,0.16)]",
          dragOffset === null && "transition-transform duration-300 ease-out motion-reduce:transition-none",
          sizes.panel === 0 && "invisible"
        )}
        style={{ transform: `translateY(${offset}px)` }}
      >
        <div
          ref={peekRef}
          className="touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endGesture(event, false)}
          onPointerCancel={(event) => endGesture(event, true)}
          onClickCapture={(event) => {
            if (!suppressClickRef.current) return;
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label={current === "expanded" ? "Paneel inklappen" : "Paneel uitklappen"}
            aria-expanded={hasMore ? current === "expanded" : undefined}
            className="group flex w-full justify-center pb-2 pt-2.5 focus-visible:outline-none"
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-[var(--brand)] group-focus-visible:ring-offset-2" />
          </button>
          {peek}
        </div>

        {hasMore && (
          <div
            ref={moreRef}
            className="max-h-[50vh] overflow-y-auto overscroll-contain border-t border-border px-4 py-3"
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomSheet;
