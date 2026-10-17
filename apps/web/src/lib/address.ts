export type Address = {
  recipient: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
};

export type AddressSuggestion = Omit<Address, "recipient" | "country"> & { district: string };

/** ISO 3166-1 alpha-2 codes the station ships to, the default first */
export const COUNTRIES = ["DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "PL", "DK", "GB"];

export const EMPTY_ADDRESS: Address = {
  recipient: "",
  street: "",
  postcode: "",
  city: "",
  country: COUNTRIES[0],
};

export const countryName = (code: string) =>
  new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

/** The address as the label prints it: at most three lines, empty ones dropped. */
export function addressLines({ recipient, street, postcode, city, country }: Address): string[] {
  const place = [postcode, city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return [recipient, street, place ? `${place}, ${country}` : ""]
    .map((line) => line.trim())
    .filter(Boolean);
}

// Photon is the OpenStreetMap geocoder built for search-as-you-type; komoot hosts it for free
const PHOTON = "https://photon.komoot.io/api/";

export function photonUrl(query: string, country: string) {
  const params = new URLSearchParams({ q: query, countrycode: country, limit: "5", lang: "en" });
  params.append("layer", "house");
  params.append("layer", "street");
  return `${PHOTON}?${params}`;
}

type PhotonProperties = {
  type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  locality?: string;
};

/** A typed house number survives picking a street that has no numbered address in OSM yet. */
function typedNumber(query: string) {
  return /\s(\d+\s?[a-z]?)$/i.exec(query.trim())?.[1] ?? "";
}

export function toSuggestions(
  features: { properties: PhotonProperties }[],
  query: string,
): AddressSuggestion[] {
  const seen = new Set<string>();
  return features.flatMap(({ properties: place }) => {
    const road = place.type === "house" ? place.street : place.name;
    if (!road) return [];
    const number = place.type === "house" ? (place.housenumber ?? "") : typedNumber(query);
    const suggestion = {
      street: number ? `${road} ${number}` : road,
      postcode: place.postcode ?? "",
      city: place.city ?? "",
      district: place.district ?? place.locality ?? "",
    };
    const key = `${suggestion.street}|${suggestion.postcode}|${suggestion.city}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [suggestion];
  });
}

export async function suggestAddresses(query: string, country: string, signal: AbortSignal) {
  const response = await fetch(photonUrl(query, country), { signal });
  if (!response.ok) return [];
  const body = (await response.json()) as { features: { properties: PhotonProperties }[] };
  return toSuggestions(body.features, query);
}
