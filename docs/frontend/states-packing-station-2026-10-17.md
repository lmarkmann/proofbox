# UI states: packing station

Surface: the signed-in packing station in `apps/web` (header, status strip, bench camera, box label, activity). The signed-out screen is `components/sign-in-screen.tsx` from PR #6 and is out of scope here.

Every state below renders without reproducing its backend condition at `http://localhost:5173/?states` (dev only; `App.tsx` lazy-loads `src/debug/state-gallery.tsx` behind `import.meta.env.DEV`, so production builds drop it).

## Inventory

| Panel         | idle                                   | loading                                                                                              | empty                                                                   | error                                                                                                 | partial                                                      | conflict                                       | offline                                               |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| Status strip  | n/a                                    | skeleton per tile while a probe is `checking`                                                        | labels tile at 0, "None printed yet"                                    | API unreachable, agent offline, camera unavailable                                                    | each tile independent: API up with printer down renders both | N.A.: read-only probes                         | browser offline banner; probes keep their last answer |
| Bench camera  | `off` with a start prompt              | `requesting`, spinner                                                                                | n/a                                                                     | `denied`, `not-found`, `in-use`, `insecure`, `disconnected`, `unknown`, each with a fix and Try again | n/a                                                          | `in-use` covers another app holding the device | camera is local, unaffected                           |
| Label preview | `waiting` until an order ID is entered | `rendering`: skeleton after 200 ms on first render, previous image dimmed after 200 ms on later ones | `waiting`                                                               | `failed` per printer failure                                                                          | previous label stays visible while the next renders          | stale responses dropped by AbortController     | preview goes through the local agent, unaffected      |
| Printing      | `idle`, copy follows printer status    | `printing`, button spinner                                                                           | n/a                                                                     | `agent-down`, `no-printer`, `busy`, `rejected`, `failed`, each with Print again                       | n/a                                                          | `busy`: printer held over WebUSB elsewhere     | local, unaffected                                     |
| Activity      | n/a                                    | n/a                                                                                                  | first run: "No boxes labelled yet" with a CTA that focuses the order ID | n/a                                                                                                   | n/a                                                          | N.A.                                           | session-local list                                    |
| Shell         | n/a                                    | auth splash while WorkOS resolves (fades in after 200 ms)                                            | n/a                                                                     | per-panel crash card                                                                                  | other panels keep working when one crashes                   | N.A.                                           | amber banner                                          |

Form validation on the label: order ID required (shown on blur or print, focus moves to the field), details capped at 3 lines with a live counter. Entered values are kept on every failure and cleared only after a successful print.

## Boundaries

| Failure                                   | Mechanism                                                                 | Reset                                          |
| ----------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Render throw in camera, label or activity | `PanelBoundary` (react-error-boundary) around each panel                  | Reload panel button calls `resetErrorBoundary` |
| Probe fetch failure                       | `useProbe` maps it to `{tag: "down"}`                                     | next poll, every 5 s                           |
| `getUserMedia` rejection, track ended     | `useCamera` classifies the DOMException into `CameraFailure`              | Try again                                      |
| Preview or print HTTP failure             | `classify()` in `lib/printer.ts` maps status and body to `PrinterFailure` | Print again, or any edit re-runs the preview   |

No union has a `threw` member; render throws only reach the boundaries.

## Changes

| Before                                                  | After                                                               | Why                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `useHealth` returned `T \| null \| undefined`           | `Probe<T>` union: checking, down, up with body                      | null and undefined meant two states nobody could tell apart |
| `printerReady` boolean                                  | `PrinterStatus`: checking, agent-down, no-printer, ready            | the UI needs to say which fix applies                       |
| Camera kept stream, error and loading in separate state | `CameraState` union with the stream on `live`                       | impossible combinations like live plus error                |
| Preview and print shared booleans                       | `Preview` and `PrintJob` unions, `assertNever` on every switch      | adding a state fails typecheck until every view handles it  |
| Any non-OK response was "Print failed"                  | five classified failures with their own copy and fix                | 503 no printer and 409 busy need different actions          |
| Header status pills                                     | four-tile status strip with skeletons                               | room for the reason and the fix, not only a colour          |
| No account UI                                           | avatar with user icon fallback, email, theme and sign out in a menu | user request                                                |
| "No labels printed yet" line                            | designed first-run empty state with a CTA                           | first-run is the state every new station sees               |
| Blank screen while auth loads                           | `AuthSplash`                                                        | no white flash before the sign-in screen                    |
| Vite default favicon                                    | ProofBox mark as SVG (light and dark), ICO and apple-touch icon     | user request                                                |

## Proven

Rendered at 1440 px light and dark, and at 390 px, in the gallery: every status strip variant, all 9 camera states, all 7 preview states, all 11 print feedback states, activity empty and filled, the panel crash card, the offline banner, the auth splash, the account menu open (named user; long email truncates), and the composed station with live probes (API up, printer ready).

## Unproven

- The account menu inside the live header and a real `profilePictureUrl`: the gallery skips WorkOS sign-in, so the header there has no user. Checked by eye in a signed-in browser only.
- `check_proof.py` and `states_scan.py` do not exist on this machine, so the proof check could not run.

## Still at risk

- Activity lives in component state and is lost on reload; persisting it needs the API to record labels.
- The station polls the agent every 5 s with no backoff while it is down.
- Offline only reads `navigator.onLine`; a captive network still reports online until the API probe fails.
