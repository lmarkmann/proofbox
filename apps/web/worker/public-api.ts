const PUBLIC_READS = [
  /^\/api(\/orders\/([^/]+))$/,
  /^\/api(\/packs\/([^/]+)\/(?:video|track|summary))$/,
];

function isPlainSegment(encoded: string) {
  try {
    const segment = decodeURIComponent(encoded);
    return segment !== "." && segment !== ".." && !/[/\\]/.test(segment);
  } catch {
    return false;
  }
}

/** The API path a public /api request maps to, or null when the Worker must answer 404. */
export function publicApiPath(method: string, pathname: string): string | null {
  if (method !== "GET") return null;
  for (const route of PUBLIC_READS) {
    const match = route.exec(pathname);
    if (match && isPlainSegment(match[2])) return match[1];
  }
  return null;
}
