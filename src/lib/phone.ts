export type CountryIso = "IN" | "US" | "GB" | "AE" | "SG";

export interface CountryOption {
  iso: CountryIso;
  label: string;
  dialCode: string;
  nationalLength?: number;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { iso: "IN", label: "India (+91)", dialCode: "91", nationalLength: 10 },
  { iso: "US", label: "United States (+1)", dialCode: "1", nationalLength: 10 },
  { iso: "GB", label: "United Kingdom (+44)", dialCode: "44", nationalLength: 10 },
  { iso: "AE", label: "UAE (+971)", dialCode: "971", nationalLength: 9 },
  { iso: "SG", label: "Singapore (+65)", dialCode: "65", nationalLength: 8 },
];

const COUNTRY_MAP = Object.fromEntries(
  COUNTRY_OPTIONS.map((option) => [option.iso, option])
) as Record<CountryIso, CountryOption>;

const DIGITS_ONLY = /[^0-9]/g;
const E164_MIN = 8;
const E164_MAX = 15;

export function normalizeCountryIso(raw?: string | null): CountryIso {
  const candidate = (raw || "").toUpperCase();
  if (candidate in COUNTRY_MAP) {
    return candidate as CountryIso;
  }
  return "IN";
}

export function normalizePhoneNumber(rawPhone: string, countryIso: string | null | undefined): { ok: true; digits: string; e164: string; countryIso: CountryIso } | { ok: false; error: string } {
  const selectedCountry = COUNTRY_MAP[normalizeCountryIso(countryIso)];
  const input = (rawPhone || "").trim();
  if (!input) {
    return { ok: false, error: "Phone number is required." };
  }

  const hasPlus = input.startsWith("+");
  let digits = input.replace(DIGITS_ONLY, "");

  if (!digits) {
    return { ok: false, error: "Phone number contains no digits." };
  }

  // Convert international dialing prefix 00XXXXXXXX to +XXXXXXXX semantics.
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!hasPlus) {
    // If a likely national number is entered, prefix with selected country.
    if (selectedCountry.nationalLength && digits.length === selectedCountry.nationalLength) {
      digits = `${selectedCountry.dialCode}${digits}`;
    }
  }

  if (digits.length < E164_MIN || digits.length > E164_MAX) {
    return {
      ok: false,
      error: `Invalid phone number length after normalization. Expected ${E164_MIN}-${E164_MAX} digits, got ${digits.length}.`,
    };
  }

  return {
    ok: true,
    digits,
    e164: `+${digits}`,
    countryIso: selectedCountry.iso,
  };
}

