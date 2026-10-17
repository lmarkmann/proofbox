export type LabelRequest = {
  order_id: string;
  proof_url: string;
  lines: string[];
};

async function post(path: string, label: LabelRequest): Promise<Response> {
  const response = await fetch(`/printer${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(label),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : response.statusText);
  }
  return response;
}

export async function previewLabel(label: LabelRequest): Promise<Blob> {
  return (await post("/labels/preview", label)).blob();
}

export async function printLabel(label: LabelRequest): Promise<void> {
  await post("/labels", label);
}
