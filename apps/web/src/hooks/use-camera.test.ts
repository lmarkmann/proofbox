import { describe, expect, test } from "vite-plus/test";

import { demoClipPath, preferredCamera } from "@/hooks/use-camera";

const ORIGIN = "http://localhost:5173";

describe("demoClipPath", () => {
  test.each([
    ["/demo/pack.mp4", "/demo/pack.mp4"],
    ["/demo/takes/second%20pack.mp4", "/demo/takes/second%20pack.mp4"],
    [`${ORIGIN}/demo/pack.mp4`, "/demo/pack.mp4"],
  ])("accepts %s", (raw, path) => {
    expect(demoClipPath(raw, ORIGIN)).toBe(path);
  });

  test.each([
    "/demo",
    "/demos/pack.mp4",
    "/demo/../api/packs",
    "/demo/%2e%2e/api/packs",
    "demo/pack.mp4/../../secret",
    "/api/packs/1/video",
    "https://evil.example/demo/pack.mp4",
    "//evil.example/demo/pack.mp4",
    "javascript:alert(1)",
  ])("rejects %s", (raw) => {
    expect(demoClipPath(raw, ORIGIN)).toBeNull();
  });
});

describe("preferredCamera", () => {
  const mac = { id: "mac", label: "FaceTime HD Camera" };
  const phone = { id: "phone", label: "Luis's iPhone Camera" };
  const continuity = { id: "continuity", label: "Continuity Camera" };
  const usb = { id: "usb", label: "Logitech BRIO" };

  test("the remembered camera wins while it is plugged in", () => {
    expect(preferredCamera([mac, phone, usb], "usb")).toBe("usb");
  });

  test("an iPhone or Continuity Camera is the default", () => {
    expect(preferredCamera([mac, phone], null)).toBe("phone");
    expect(preferredCamera([mac, continuity], null)).toBe("continuity");
  });

  test("a remembered camera that is gone falls through to the phone", () => {
    expect(preferredCamera([mac, phone], "usb")).toBe("phone");
  });

  test("without a phone or a remembered camera the browser default stays", () => {
    expect(preferredCamera([mac, usb], "gone")).toBeUndefined();
  });
});
