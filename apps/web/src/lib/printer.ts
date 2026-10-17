export type LabelRequest = {
  order_id: string;
  proof_url: string;
  lines: string[];
};

export type PrinterFailure =
  | { kind: "agent-down" }
  | { kind: "no-printer" }
  | { kind: "busy" }
  | { kind: "rejected"; detail: string }
  | { kind: "failed"; detail: string };

export class PrinterRequestError extends Error {
  readonly failure: PrinterFailure;

  constructor(failure: PrinterFailure) {
    super(failure.kind);
    this.failure = failure;
  }
}

async function classify(response: Response): Promise<PrinterFailure> {
  const body = await response.json().catch(() => null);
  const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
  // without a JSON body the answer came from the dev proxy, not the agent
  if (!body) return { kind: "agent-down" };
  if (response.status === 503) return { kind: "no-printer" };
  if (response.status === 409) return { kind: "busy" };
  if (response.status === 422)
    return { kind: "rejected", detail: "The agent rejected the label fields." };
  return { kind: "failed", detail };
}

async function post(path: string, label: LabelRequest, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`/printer${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(label),
    signal,
  }).catch((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new PrinterRequestError({ kind: "agent-down" });
  });
  if (!response.ok) throw new PrinterRequestError(await classify(response));
  return response;
}

export async function previewLabel(label: LabelRequest, signal?: AbortSignal): Promise<Blob> {
  return (await post("/labels/preview", label, signal)).blob();
}

export async function printLabel(label: LabelRequest): Promise<void> {
  await post("/labels", label);
}

export function toPrinterFailure(cause: unknown): PrinterFailure {
  return cause instanceof PrinterRequestError
    ? cause.failure
    : { kind: "failed", detail: cause instanceof Error ? cause.message : String(cause) };
}
