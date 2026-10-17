import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import readerWasm from "zxing-wasm/reader/zxing_reader.wasm?url";

export type DecodedQr = { raw: string; corners: [number, number][] };

// served from our own origin so the bench never depends on jsDelivr
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? readerWasm : prefix + path,
  },
});

const detector = new BarcodeDetector({ formats: ["qr_code"] });

self.onmessage = async (event: MessageEvent<ImageBitmap>) => {
  const frame = event.data;
  try {
    const codes = await detector.detect(frame);
    const decoded: DecodedQr[] = codes.map((code) => ({
      raw: code.rawValue,
      corners: code.cornerPoints.map(({ x, y }) => [x / frame.width, y / frame.height]),
    }));
    self.postMessage(decoded);
  } catch {
    self.postMessage([]);
  } finally {
    frame.close();
  }
};
