/**
 * Het noodnummer per land.
 *
 * Een reiziger die in paniek raakt in Londen moet 999 bellen, niet 112 omdat
 * de app in Nederland is gebouwd. 112 werkt weliswaar in de hele EU en op veel
 * GSM-netwerken daarbuiten, maar het is geen wereldwijde garantie: in de
 * Verenigde Staten is het 911 en in Australië 000.
 *
 * Sleutel is de ISO 3166-1 alpha-2 landcode in kleine letters, zoals Nominatim
 * die teruggeeft in `address.country_code`.
 */

export interface EmergencyNumber {
  /** Het nummer dat gedraaid wordt. */
  number: string;
  /** Landnaam, om in de interface te tonen. */
  country: string;
  /** Waar dit nummer vandaan komt, voor als het nummer onverwacht lijkt. */
  note?: string;
}

/** Gebruikt wanneer het land onbekend is. */
export const FALLBACK_EMERGENCY: EmergencyNumber = {
  number: "112",
  country: "onbekend",
  note: "Land onbekend. 112 werkt in de hele EU en op de meeste mobiele netwerken wereldwijd.",
};

/**
 * Landen waar 112 het officiële algemene noodnummer is.
 *
 * Dit is de hele EU plus de rest van de EER en een aantal landen die het
 * nummer hebben overgenomen. Apart gehouden zodat de lijst hieronder alleen
 * de uitzonderingen bevat.
 */
const DIALS_112 = [
  // EU
  "be", "bg", "cy", "dk", "de", "ee", "fi", "fr", "gr", "hu", "ie", "it",
  "hr", "lv", "lt", "lu", "mt", "nl", "at", "pl", "pt", "ro", "si", "sk",
  "es", "cz", "se",
  // Overige Europa
  "is", "li", "no", "ch", "al", "ba", "me", "mk", "rs", "tr", "ua", "md", "xk",
  // Daarbuiten
  "in", "za", "id", "vn", "kr", "ru", "by", "kz", "ge", "am", "az",
] as const;

const COUNTRY_NAMES: Record<string, string> = {
  nl: "Nederland", be: "België", de: "Duitsland", fr: "Frankrijk",
  es: "Spanje", it: "Italië", pt: "Portugal", at: "Oostenrijk",
  ch: "Zwitserland", dk: "Denemarken", se: "Zweden", no: "Noorwegen",
  fi: "Finland", is: "IJsland", ie: "Ierland", pl: "Polen",
  cz: "Tsjechië", sk: "Slowakije", hu: "Hongarije", ro: "Roemenië",
  bg: "Bulgarije", gr: "Griekenland", hr: "Kroatië", si: "Slovenië",
  ee: "Estland", lv: "Letland", lt: "Litouwen", lu: "Luxemburg",
  mt: "Malta", cy: "Cyprus", tr: "Turkije", ua: "Oekraïne",
  rs: "Servië", ba: "Bosnië en Herzegovina", me: "Montenegro",
  mk: "Noord-Macedonië", al: "Albanië", md: "Moldavië", xk: "Kosovo",
  li: "Liechtenstein", ru: "Rusland", by: "Belarus", kz: "Kazachstan",
  ge: "Georgië", am: "Armenië", az: "Azerbeidzjan",
  gb: "Verenigd Koninkrijk", us: "Verenigde Staten", ca: "Canada",
  au: "Australië", nz: "Nieuw-Zeeland", jp: "Japan", cn: "China",
  in: "India", za: "Zuid-Afrika", br: "Brazilië", mx: "Mexico",
  ar: "Argentinië", cl: "Chili", co: "Colombia", pe: "Peru",
  id: "Indonesië", th: "Thailand", vn: "Vietnam", my: "Maleisië",
  sg: "Singapore", ph: "Filipijnen", hk: "Hongkong", kr: "Zuid-Korea",
  tw: "Taiwan", il: "Israël", ae: "Verenigde Arabische Emiraten",
  sa: "Saoedi-Arabië", eg: "Egypte", ma: "Marokko", ke: "Kenia",
  ng: "Nigeria", gh: "Ghana", et: "Ethiopië", tz: "Tanzania",
};

/** Landen die géén 112 gebruiken. */
const EXCEPTIONS: Record<string, { number: string; note?: string }> = {
  gb: { number: "999", note: "112 werkt hier ook." },
  us: { number: "911" },
  ca: { number: "911" },
  mx: { number: "911" },
  ar: { number: "911" },
  au: { number: "000", note: "112 werkt vanaf een mobiele telefoon ook." },
  nz: { number: "111" },
  br: { number: "190", note: "190 is de politie. 192 is de ambulance." },
  cl: { number: "133", note: "133 is de politie. 131 is de ambulance." },
  co: { number: "123" },
  pe: { number: "105", note: "105 is de politie." },
  jp: { number: "110", note: "110 is de politie. 119 is brandweer en ambulance." },
  cn: { number: "110", note: "110 is de politie. 120 is de ambulance." },
  tw: { number: "110", note: "110 is de politie. 119 is brandweer en ambulance." },
  hk: { number: "999" },
  th: { number: "191", note: "191 is de politie. 1669 is de ambulance." },
  my: { number: "999" },
  sg: { number: "999", note: "999 is de politie. 995 is brandweer en ambulance." },
  ph: { number: "911" },
  il: { number: "100", note: "100 is de politie. 101 is de ambulance." },
  ae: { number: "999", note: "999 is de politie. 998 is de ambulance." },
  sa: { number: "999", note: "999 is de politie. 997 is de ambulance." },
  eg: { number: "122", note: "122 is de politie. 123 is de ambulance." },
  ma: { number: "190", note: "190 is de politie in de stad. 177 is de gendarmerie." },
  ke: { number: "999", note: "112 werkt hier ook." },
  ng: { number: "112" },
  gh: { number: "191", note: "191 is de politie. 112 werkt ook." },
  et: { number: "991", note: "991 is de politie." },
  tz: { number: "112" },
};

/**
 * Het noodnummer voor een landcode.
 *
 * Onbekende of ontbrekende codes leveren {@link FALLBACK_EMERGENCY} op, zodat
 * de knop altijd iets bruikbaars doet.
 */
export function emergencyNumberFor(countryCode: string | null | undefined): EmergencyNumber {
  const code = countryCode?.trim().toLowerCase();
  if (!code || code.length !== 2) return FALLBACK_EMERGENCY;

  const country = COUNTRY_NAMES[code] ?? code.toUpperCase();
  const exception = EXCEPTIONS[code];

  if (exception) {
    return { number: exception.number, country, note: exception.note };
  }

  if ((DIALS_112 as readonly string[]).includes(code)) {
    return { number: "112", country };
  }

  return {
    ...FALLBACK_EMERGENCY,
    country,
    note: `Het noodnummer van ${country} is niet bekend in de app. 112 werkt op de meeste mobiele netwerken.`,
  };
}

/** Of we het nummer met zekerheid weten, of terugvallen op 112. */
export function isKnownCountry(countryCode: string | null | undefined): boolean {
  const code = countryCode?.trim().toLowerCase();
  if (!code || code.length !== 2) return false;
  return code in EXCEPTIONS || (DIALS_112 as readonly string[]).includes(code);
}
