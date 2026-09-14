/**
 * Markers drawn as HTML on top of the map. Colours come from CSS tokens, so
 * they follow `--brand` without a copy of the hex in code.
 */

/** Where the user is: a brand-coloured dot with a soft pulsing ring. */
export const UserLocationDot = () => (
  <div className="sb-user-dot" aria-hidden="true">
    <span className="sb-user-dot__pulse" />
    <span className="sb-user-dot__core" />
  </div>
);

/** The user while navigating: an arrow pointing the way they travel. */
export const NavigationArrow = () => (
  <svg
    aria-hidden="true"
    width="44"
    height="44"
    viewBox="0 0 44 44"
    style={{ filter: "drop-shadow(0 4px 6px rgba(27,23,37,.45))" }}
  >
    <path
      d="M22 4 L37 38 L22 30 L7 38 Z"
      style={{ fill: "var(--brand)" }}
      stroke="#fff"
      strokeWidth="3"
      strokeLinejoin="round"
    />
  </svg>
);

/** The chosen starting point: a small ringed dot. Anchor at the centre. */
export const StartPin = () => (
  <div
    aria-hidden="true"
    className="h-4 w-4 rounded-full border-[3px] bg-white shadow-md"
    style={{ borderColor: "var(--brand)" }}
  />
);

/** A spot being reported: the brand pin with a plus. Anchor at the bottom. */
export const ReportPin = () => (
  <svg
    aria-hidden="true"
    width="36"
    height="47"
    viewBox="0 0 32 42"
    style={{ filter: "drop-shadow(0 3px 4px rgba(27,23,37,.35))" }}
  >
    <path
      d="M16 1C8.3 1 2 7.2 2 14.9 2 25.3 16 41 16 41s14-15.7 14-26.1C30 7.2 23.7 1 16 1z"
      style={{ fill: "var(--brand)" }}
      stroke="#fff"
      strokeWidth="2"
    />
    <path d="M16 9v12M10 15h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** The destination: a teardrop pin. Anchor at the bottom. */
export const DestinationPin = () => (
  <svg
    aria-hidden="true"
    width="32"
    height="42"
    viewBox="0 0 32 42"
    style={{ filter: "drop-shadow(0 3px 4px rgba(27,23,37,.35))" }}
  >
    <path
      d="M16 1C8.3 1 2 7.2 2 14.9 2 25.3 16 41 16 41s14-15.7 14-26.1C30 7.2 23.7 1 16 1z"
      style={{ fill: "var(--brand)" }}
      stroke="#fff"
      strokeWidth="2"
    />
    <circle cx="16" cy="15" r="5" fill="#fff" />
  </svg>
);
