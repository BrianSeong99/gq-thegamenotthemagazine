// The map: the pixel world (1000 × 500, Natural Earth geometry quantised) or a stage's region as
// the picture, the projection in lib/map.ts, a 30° graticule on the world and the marks. No map
// library. A stage shows the centred box its stretched coordinates fill (lib/stages.ts).

import type { MouseEvent } from "react";
import { frameOf, latLonToPixel, MAP_H, MAP_W, pixelToLatLon, type LatLon } from "@/lib/map";
import { useT } from "@/lib/i18n";
import { WORLD, type Stage } from "@/lib/stages";

// a graticule every 30°: meridians from 150°W to 150°E, parallels from 60°N to 60°S
const MERIDIANS = Array.from({ length: 11 }, (_, i) => latLonToPixel({ lat: 0, lon: -150 + 30 * i }).x);
const PARALLELS = Array.from({ length: 5 }, (_, i) => latLonToPixel({ lat: 60 - 30 * i, lon: 0 }).y);

export function WorldMap({
  onPick,
  marks = [],
  disabled = false,
  stage = WORLD,
}: {
  onPick?: (p: LatLon) => void;
  marks?: { at: LatLon; color: string; label?: string }[];
  disabled?: boolean;
  stage?: Stage;
}) {
  const t = useT();
  const frame = frameOf(stage);
  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (disabled || !onPick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = frame.x + ((e.clientX - rect.left) / rect.width) * frame.w;
    const y = frame.y + ((e.clientY - rect.top) / rect.height) * frame.h;
    onPick(pixelToLatLon(x, y));
  };

  return (
    <svg
      viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
      className="world-map"
      role="img"
      aria-label={stage.id === "world" ? t("World map") : t(stage.name)}
      onClick={handleClick}
      style={{ cursor: disabled || !onPick ? "default" : "crosshair" }}
    >
      <image href={stage.map} x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      {stage.id === "world" && MERIDIANS.map((x) => <line key={`v${x}`} className="grid" x1={x} y1={0} x2={x} y2={MAP_H} />)}
      {stage.id === "world" && PARALLELS.map((y) => <line key={`h${y}`} className="grid" x1={0} y1={y} x2={MAP_W} y2={y} />)}
      {marks.map((m, i) => {
        const { x, y } = latLonToPixel(m.at);
        return (
          <g key={i}>
            <rect x={x - 6} y={y - 6} width={12} height={12} fill={m.color} stroke="#0c0827" strokeWidth={2} transform={`rotate(45 ${x} ${y})`} />
            {m.label && (
              <text x={x + 10} y={y - 10} fontSize={16} fontFamily="GeoQuizz Pixel, monospace" fill={m.color} stroke="#0c0827" strokeWidth={0.8}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
