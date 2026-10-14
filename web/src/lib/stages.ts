// The 1P stages: the World Tour and four regions a posted record unlocks. A stage's map is an
// equirectangular crop of the pixel world (tasks/maps/pixelmap.py draws it from Natural Earth), and
// its quiz runs in "stretched" coordinates: the region scaled by `factor` around its centre, so
// the contract's kilometre scoring becomes map-distance scoring with no change to the scripts. The
// World Tour is the identity. Every stage has its own city list, told apart by its dataset hash.

import type { LatLon } from "./map";
import type { Word4 } from "./notes";

export type StageId = "world" | "america" | "africa" | "europe" | "asia";
export type Stage = {
  id: StageId;
  /** the English name, a t() key */
  name: string;
  /** the score a posted record must reach to unlock it */
  threshold: number;
  lon0: number;
  lon1: number;
  lat0: number;
  lat1: number;
  map: string;
  cities: string;
  /** how much bigger the region is drawn than on the world map */
  factor: number;
};
const stage = (id: StageId, name: string, threshold: number, lon0: number, lon1: number, lat0: number, lat1: number): Stage => ({
  id, name, threshold, lon0, lon1, lat0, lat1,
  map: `/brand/pixel-${id}.svg`,
  cities: id === "world" ? "/cities.json" : `/cities.${id}.json`,
  factor: Math.min(360 / (lon1 - lon0), 180 / (lat1 - lat0)),
});
/** In the order of the tiles: the World Tour, then by the score to unlock. Bounds mirror tasks/maps/pixelmap.py. */
export const STAGES: Stage[] = [
  stage("world", "World Tour", 0, -180, 180, -90, 90),
  stage("america", "America", 3000, -170, -30, -57, 72),
  stage("africa", "Africa", 4000, -20, 55, -36, 38),
  stage("europe", "Europe", 5000, -25, 45, 34, 72),
  stage("asia", "Asia", 6000, 25, 190, -48, 78),
];
export const WORLD = STAGES[0];
export const stageById = (id: StageId): Stage => STAGES.find((s) => s.id === id)!;

const centre = (s: Stage) => ({ lat: (s.lat0 + s.lat1) / 2, lon: (s.lon0 + s.lon1) / 2 });
/** `lon` within 180° of `around` (a region may pass the antimeridian). */
const unwrap = (lon: number, around: number) => ((((lon - around + 180) % 360) + 360) % 360) - 180 + around;
/** A real place in the stage's stretched coordinates, what the quiz and the note hold. */
export const toStretched = (s: Stage, p: LatLon): LatLon => {
  if (s.id === "world") return p;
  const c = centre(s);
  return { lat: (p.lat - c.lat) * s.factor, lon: (unwrap(p.lon, c.lon) - c.lon) * s.factor };
};
/** Back from stretched coordinates to the real place. */
export const fromStretched = (s: Stage, p: LatLon): LatLon => {
  if (s.id === "world") return p;
  const c = centre(s);
  return { lat: p.lat / s.factor + c.lat, lon: unwrap(p.lon / s.factor + c.lon, 0) };
};

// the dataset hash of each stage's city list, learnt when the list is loaded
const byHash = new Map<string, Stage>();
export const registerDataset = (s: Stage, word: Word4) => byHash.set(word.join(","), s);
/** The stage a note's game data belongs to, by its dataset hash; undefined for a list this app does not have. */
export const stageOfDataset = (word: Word4): Stage | undefined => byHash.get(word.join(","));
