// Country / currency / timezone data for workspace setup. Country + currency
// come from `countries-list`; SVG flags from `country-flag-icons` (they render
// on Windows, unlike emoji flags). Timezone list is the built-in Intl API.
//
// Only import this from lazily-loaded pages — pulling in all flag components
// adds weight we don't want in the main bundle.
import { countries } from "countries-list";
import * as Flags from "country-flag-icons/react/3x2";

// [{ code, name, currency }] sorted by name. `currency` is the country's first
// ISO-4217 code, used to auto-fill the currency picker when a country is chosen.
export const COUNTRIES = Object.entries(countries)
  .map(([code, c]) => ({
    code,
    name: c.name,
    currency: (c.currency && c.currency[0]) || "USD",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Flag component for an ISO2 code (or null if the pack doesn't ship one).
export function flagComponent(code) {
  return Flags[code] || null;
}

function currencyLabeler() {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], {
      type: "currency",
    });
  } catch {
    return null;
  }
}

// Unique ISO-4217 codes across all countries, labelled via Intl where possible.
export const CURRENCIES = (() => {
  const set = new Set();
  Object.values(countries).forEach((c) =>
    (c.currency || []).forEach((cur) => set.add(cur)),
  );
  const dn = currencyLabeler();
  return [...set].sort().map((code) => ({
    value: code,
    label: dn ? `${code} — ${dn.of(code)}` : code,
  }));
})();

export const TIMEZONES = (() => {
  let zones;
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"];
  }
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
})();

// Best-effort defaults from the browser so setup is a confirm, not a form:
// detected timezone, country from the locale region, currency from that country.
export function detectLocaleDefaults() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const region = (navigator.language || "en-US").split("-")[1]?.toUpperCase() || "";
  const match = COUNTRIES.find((c) => c.code === region);
  return {
    timezone,
    country: match ? match.code : "",
    currency: match ? match.currency : "USD",
  };
}
