import { ExternalLinkIcon, PlayIcon, VideoOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { labelColor, VisionOverlay } from "@/components/vision-overlay";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getTrack, packVideoUrl } from "@/lib/api";
import { clipRange, type EvidenceClip } from "@/lib/inspector";
import { cn } from "@/lib/utils";
import { detectionsAt, type Frame, framesOf } from "@/proof/pack-model";

const tracks = new Map<string, Promise<Frame[]>>();

function framesFor(packId: string) {
  let frames = tracks.get(packId);
  if (!frames) {
    frames = getTrack(packId)
      .then(framesOf)
      .catch(() => {
        tracks.delete(packId);
        return [];
      });
    tracks.set(packId, frames);
  }
  return frames;
}

// a cited moment is a few seconds at most; replaying a little past it keeps the item in frame
const TAIL_S = 0.75;

/** Plays one cited moment of a pack's clip in place, looping it, with the detector's boxes on top. */
function EvidencePlayer({ clip }: { clip: EvidenceClip }) {
  const player = useRef<HTMLVideoElement>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [ms, setMs] = useState(0);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const start = clip.start_s ?? 0;

  useEffect(() => {
    let live = true;
    void framesFor(clip.pack_id).then((loaded) => live && setFrames(loaded));
    return () => {
      live = false;
    };
  }, [clip.pack_id]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    let handle = element.requestVideoFrameCallback(function tick(_, frame) {
      setMs(frame.mediaTime * 1000);
      if (clip.end_s !== null && frame.mediaTime > clip.end_s + TAIL_S) element.currentTime = start;
      handle = element.requestVideoFrameCallback(tick);
    });
    return () => element.cancelVideoFrameCallback(handle);
  }, [clip.end_s, start]);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-950 ring-1 ring-foreground/10">
        <video
          ref={player}
          src={packVideoUrl(clip.pack_id)}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="size-full object-contain"
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            setFrameSize({ width: videoWidth, height: videoHeight });
            event.currentTarget.currentTime = start;
          }}
          onError={() => setFailed(true)}
        />
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            <VideoOffIcon className="size-5" />
            <p className="text-xs">This clip could not be played.</p>
          </div>
        ) : (
          <VisionOverlay
            detections={detectionsAt(frames, ms)}
            frameSize={frameSize}
            fit="contain"
          />
        )}
      </div>
      <figcaption className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <span className="text-pretty">{clip.text}</span>
        {clip.order_id && (
          <a
            href={`/proof/${encodeURIComponent(clip.order_id)}?t=${start}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground hover:underline"
          >
            Proof page
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </figcaption>
    </figure>
  );
}

/** The answer's citations as chips; choosing one plays that moment right under the answer. */
export function EvidenceRow({ clips }: { clips: EvidenceClip[] }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const shown = playing === null ? null : clips[playing];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {clips.map((clip, index) => (
          <HoverCard key={index}>
            <HoverCardTrigger
              render={
                <Button
                  size="xs"
                  variant={playing === index ? "secondary" : "outline"}
                  aria-pressed={playing === index}
                  onClick={() => setPlaying(playing === index ? null : index)}
                  className="tabular-nums"
                />
              }
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: labelColor(clip.label) }}
              />
              {clip.label}
              {clipRange(clip) && <span className="text-muted-foreground">{clipRange(clip)}</span>}
            </HoverCardTrigger>
            <HoverCardContent side="top" className="flex w-72 flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground tabular-nums">
                {clip.order_id ?? clip.pack_id.slice(0, 8)} {clipRange(clip)}
              </p>
              <p className="text-pretty">{clip.text}</p>
              <p
                className={cn(
                  "flex items-center gap-1 text-xs text-muted-foreground",
                  playing === index && "hidden",
                )}
              >
                <PlayIcon className="size-3" />
                Click to play this moment here
              </p>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
      {shown && <EvidencePlayer key={playing} clip={shown} />}
    </div>
  );
}
