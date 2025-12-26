/**
 * Country code mapping utility for extracting country information from phone numbers
 */

export interface CountryInfo {
  code: string;
  name: string;
  dialCode: string;
  currency: "USD" | "NGN" | "GBP" | "CAD" | "GHS" | "KES" | "ZAR";
}

export const COUNTRY_CODE_MAPPING: { [key: string]: CountryInfo } = {
  // Nigeria
  "234": {
    code: "NG",
    name: "Nigeria",
    dialCode: "+234",
    currency: "NGN",
  },

  // United States and Canada both use +1, we'll handle this specially
  "1": {
    code: "US",
    name: "United States",
    dialCode: "+1",
    currency: "USD",
  },

  // United Kingdom
  "44": {
    code: "GB",
    name: "United Kingdom",
    dialCode: "+44",
    currency: "GBP",
  },

  // Ghana
  "233": {
    code: "GH",
    name: "Ghana",
    dialCode: "+233",
    currency: "GHS",
  },

  // Kenya
  "254": {
    code: "KE",
    name: "Kenya",
    dialCode: "+254",
    currency: "KES",
  },

  // South Africa
  "27": {
    code: "ZA",
    name: "South Africa",
    dialCode: "+27",
    currency: "ZAR",
  },
};

// Special handling for North American countries that share +1 dial code
export const NORTH_AMERICAN_COUNTRIES: CountryInfo[] = [
  {
    code: "US",
    name: "United States",
    dialCode: "+1",
    currency: "USD",
  },
  {
    code: "CA",
    name: "Canada",
    dialCode: "+1",
    currency: "CAD",
  },
];

/**
 * Extract country information from a phone number
 * @param phoneNumber - Phone number in international format (e.g., "+2348012345678")
 * @returns Country information or null if not found
 */
export function getCountryFromPhoneNumber(
  phoneNumber: string
): CountryInfo | null {
  // Remove + and any spaces
  const cleanNumber = phoneNumber.replace(/[+\s]/g, "");

  // Try to match by country code
  for (const [dialCode, countryInfo] of Object.entries(COUNTRY_CODE_MAPPING)) {
    if (cleanNumber.startsWith(dialCode)) {
      // Special handling for US/Canada which both use +1
      if (dialCode === "1") {
        // For North America, default to US for now
        // This could be enhanced with area code mapping if needed
        return countryInfo;
      }
      return countryInfo;
    }
  }

  return null;
}

/**
 * Get country code from phone number
 * @param phoneNumber - Phone number in international format
 * @returns Country code (e.g., "NG", "US") or null if not found
 */
export function getCountryCodeFromPhoneNumber(
  phoneNumber: string
): string | null {
  const countryInfo = getCountryFromPhoneNumber(phoneNumber);
  return countryInfo ? countryInfo.code : null;
}

/**
 * Check if a phone number belongs to a specific country
 * @param phoneNumber - Phone number in international format
 * @param countryCode - Country code to check (e.g., "NG")
 * @returns True if phone number belongs to specified country
 */
export function isPhoneNumberFromCountry(
  phoneNumber: string,
  countryCode: string
): boolean {
  const extractedCountryCode = getCountryCodeFromPhoneNumber(phoneNumber);
  return extractedCountryCode === countryCode;
}

/**
 * Get currency for a phone number
 * @param phoneNumber - Phone number in international format
 * @returns Currency code (e.g., "NGN", "USD") or null if not found
 */
export function getCurrencyFromPhoneNumber(
  phoneNumber: string
): "USD" | "NGN" | "GBP" | "CAD" | "GHS" | "KES" | "ZAR" | null {
  const countryInfo = getCountryFromPhoneNumber(phoneNumber);
  return countryInfo ? countryInfo.currency : null;
}

/**
 * Get all supported countries
 * @returns Array of all supported country information
 */
export function getSupportedCountries(): CountryInfo[] {
  // Remove duplicates and add Canada separately
  const uniqueCountries = Object.values(COUNTRY_CODE_MAPPING);
  const countries = [...uniqueCountries];

  // Add Canada since it shares dial code with US
  const canada = NORTH_AMERICAN_COUNTRIES[1];
  if (canada) {
    countries.push(canada);
  }

  return countries;
}
