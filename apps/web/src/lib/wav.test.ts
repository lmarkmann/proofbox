import { expect, test } from "vite-plus/test";

import { encodeWav } from "@/lib/wav";

test("a WAV header declares 16 kHz mono 16-bit PCM and the data length", async () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
  const view = new DataView(await wav.arrayBuffer());
  const text = (offset: number) => String.fromCharCode(...new Uint8Array(view.buffer, offset, 4));

  expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16_000);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getUint32(40, true)).toBe(8);
  expect([1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([
    0x7fff, -0x8000, 0x7fff,
  ]);
});
