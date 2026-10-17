# web

## 0.10.0

### Minor Changes

- a1d6c85: Printing a box label creates its order through `POST /orders`. A label printed without items is an open order: YOLOE watches for a broad list of everyday objects, and the first seal writes what it tracked as the order's items, so the proof page and the after-seal check run against what went into the box.

## 0.9.0

### Minor Changes

- 3106e66: The label's free-text details become a ship-to form: recipient, country, street with address suggestions from Photon in the chosen country, postcode and city, printed as three lines.
- 3106e66: The station's Cmd-K omnibox becomes the Inspector, a docked agent panel built on AI Elements: one thread per order, live tool steps, cited moments that play in place with the detector's boxes, suggestions per bench state, hold Space to talk with a live Canary transcript, and the after-seal check with Repack or Ship as short.

## 0.8.0

### Minor Changes

- f52ff54: API: `POST /chat` streams answers in the AI SDK UI message stream protocol (tool parts, evidence data parts, streamed text, Weave trace link), on one agent loop shared with `POST /ask`.
- f52ff54: API: after a seal the agent checks the pack clip against the order lines and stores a verdict in `proofbox.checks`, served at `GET /packs/{pack_id}/check`.

## 0.7.0

### Minor Changes

- 6e9a1ea: A 404 page for dead links: the logo's box opened and empty, a one-click proof link when the path carries an order number, and an order lookup for anyone holding a label.

## 0.6.0

### Minor Changes

- e733bd9: The bench camera has a camera picker that prefers an iPhone over Continuity Camera, remembers your pick and falls back to another camera when one drops out; `?replay=/demo/<clip>` plays a demo clip with the same chrome as the live camera.
- e733bd9: The station reads the box label's QR live, tracks items going in with YOLOE, records the pack and seals it into VAST with its detection track. The API on the lab VM stores orders, packs and tracks in VastDB, answers questions through W&B Inference with Cosmos watching the clip, and transcribes voice with Canary. The header shows a DiceBear avatar and the three-way theme switch, and Activity survives a reload.
- e733bd9: Public proof page at /proof/:orderId: verdict seal, the packing clip with its detections replayed on the video, a timeline of items going in, a checklist that jumps to each item, and the Cosmos summary of the pack.
- e733bd9: Label QR codes open the proof page on the deployed Worker, which forwards the four public reads (order, pack video with range requests, detection track, Cosmos summary) to the API and answers 404 to every other /api path. The proof page reads the summary computed at seal instead of asking Cosmos on every visit, and shows "still describing" until it exists. `just tunnel` serves the dev server publicly as a fallback.
- e733bd9: `just replay <clip> <order>` (the `proofbox-replay` command in apps/vision) tracks a recorded packing clip with the station's model, tracker and vocabulary and seals it as a pack, so the proof page and the omnibox get real evidence without a live camera; an optional render writes a copy with the boxes burned in.

## 0.5.0

### Minor Changes

- b50c7a4: Packing station redesign: status strip, account menu with avatar and email, designed loading, empty, error and offline states for the camera, label preview, printing and activity panels, and the ProofBox mark as the favicon.

## 0.4.0

### Minor Changes

- 22a2b5a: Sign in with WorkOS AuthKit before the interface loads, and deploy the web app as the Cloudflare Worker proofbox.

## 0.3.0

### Minor Changes

- ac1811c: Packing station dashboard: live camera, API and printer status, label preview and printing.

### Patch Changes

- 9c37a34: Labels print on one sticker without feeding a blank second label.

## 0.2.0

### Minor Changes

- 8662084: Print box labels with the order ID and a QR code to the packing proof on a USB thermal printer.
