import type { Asset, Show } from "@/types/show";
import { evaluateCue, type EvaluatedCue } from "@/lib/tweens";
import { cueRect, type StageRect } from "@/lib/stageGeometry";

export function collectStageCues(show: Show): EvaluatedCue[] {
  return show.timelines
    .filter((t) => t.enabled)
    .flatMap((t) => {
      const ordered = [...t.layers].reverse();
      return ordered.flatMap((layer) => {
        if (!layer.enabled) return [];
        return t.cues
          .filter((c) => c.layerId === layer.id)
          .map((c) => evaluateCue(c, t.playhead, t.cues))
          .filter((x): x is EvaluatedCue => !!x);
      });
    });
}

export function cueRects(cues: EvaluatedCue[], assets: Asset[]): StageRect[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return cues
    .filter((ev) => ev.cue.type === "media")
    .map((ev) => cueRect(ev, ev.cue.assetId ? byId.get(ev.cue.assetId) : undefined));
}
