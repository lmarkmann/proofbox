export type OrderItem = { name: string; qty: number };
export type Order = { order_id: string; customer: string; items: OrderItem[] };
export type Verdict = "complete" | "short" | "unexpected";
export type PackSummary = {
  pack_id: string;
  sealed_at: string;
  verdict: Verdict;
  counts: Record<string, number>;
};
export type OrderDetail = Order & { packs: PackSummary[] };

/** x1, y1, x2, y2 as fractions of the frame */
export type Box = [number, number, number, number];
export type Detection = { track: number | null; label: string; conf: number; box: Box };
export type TrackPoint = Detection & { t_ms: number };

export type SealResult = {
  pack_id: string;
  order_id: string;
  counts: Record<string, number>;
  verdict: Verdict;
  object_key: string | null;
  upload_error: string | null;
};

export type Evidence = {
  pack_id: string | null;
  order_id: string | null;
  start_s: number | null;
  end_s: number | null;
  text: string;
};
export type Answer = { answer: string; evidence: Evidence[] };

/** status 0 means the request never reached the API */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init).catch((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "The API is not reachable.");
  });
  const body = await response.json().catch(() => null);
  // the dev proxy answers with an empty 5xx when the tunnel to the VM is down
  if (!body) throw new ApiError(response.ok ? 502 : 0, "The API is not reachable.");
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof body.detail === "string" ? body.detail : response.statusText,
    );
  return body as T;
}

const json = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

export const listOrders = () => call<Order[]>("/orders");

export const getOrder = (orderId: string) =>
  call<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`);

export const createPack = (orderId: string) =>
  call<{ pack_id: string; order_id: string; started_at: string }>(
    "/packs",
    json({ order_id: orderId }),
  );

export function sealPack(packId: string, video: Blob, track: TrackPoint[]) {
  const form = new FormData();
  form.append("video", video, `${packId}.${video.type.includes("mp4") ? "mp4" : "webm"}`);
  form.append("track", JSON.stringify(track));
  return call<SealResult>(`/packs/${encodeURIComponent(packId)}/seal`, {
    method: "POST",
    body: form,
  });
}

export const getTrack = (packId: string) =>
  call<TrackPoint[]>(`/packs/${encodeURIComponent(packId)}/track`);

export const packVideoUrl = (packId: string) => `/api/packs/${encodeURIComponent(packId)}/video`;

export const ask = (question: string, orderId: string | null, signal?: AbortSignal) =>
  call<Answer>("/ask", { ...json({ question, order_id: orderId }), signal });

export function transcribe(wav: Blob) {
  const form = new FormData();
  form.append("audio", wav, "question.wav");
  return call<{ text: string }>("/transcribe", { method: "POST", body: form });
}
