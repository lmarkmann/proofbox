import { publicApiPath } from "./public-api";

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  API_ORIGIN?: string;
};

const FORWARDED_HEADERS = ["accept", "range", "if-range"];

const detail = (status: number, message: string) => Response.json({ detail: message }, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const path = publicApiPath(request.method, url.pathname);
    if (!path) return detail(404, "Not Found");
    if (!env.API_ORIGIN) return detail(503, "The API origin is not configured.");

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return fetch(new URL(path, env.API_ORIGIN), {
      method: request.method,
      headers,
      body: request.body,
    }).catch(() => detail(502, "The API is not reachable."));
  },
};
