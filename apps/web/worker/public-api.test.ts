import { describe, expect, test } from "vite-plus/test";

import { publicApiPath } from "./public-api";

describe("publicApiPath", () => {
  test.each([
    ["/api/orders/PB-20481", "/orders/PB-20481"],
    ["/api/orders/PB%2020481", "/orders/PB%2020481"],
    ["/api/packs/7f3a/video", "/packs/7f3a/video"],
    ["/api/packs/7f3a/track", "/packs/7f3a/track"],
    ["/api/packs/7f3a/summary", "/packs/7f3a/summary"],
  ])("forwards GET %s as %s", (pathname, apiPath) => {
    expect(publicApiPath("GET", pathname)).toBe(apiPath);
  });

  test.each(["POST", "PUT", "DELETE", "HEAD"])("refuses %s on a public path", (method) => {
    expect(publicApiPath(method, "/api/orders/PB-20481")).toBeNull();
  });

  test.each([
    "/api/orders",
    "/api/orders/",
    "/api/orders/PB-20481/",
    "/api/packs",
    "/api/packs/7f3a",
    "/api/packs/7f3a/seal",
    "/api/packs/7f3a/video/extra",
    "/api/ask",
    "/api/transcribe",
    "/api/health",
    "/api/orders/..%2Fpacks",
    "/api/orders/%2E%2E",
    "/api/orders/a%5Cb",
    "/api/orders/%E0%A4%A",
    "/orders/PB-20481",
  ])("refuses GET %s", (pathname) => {
    expect(publicApiPath("GET", pathname)).toBeNull();
  });
});
