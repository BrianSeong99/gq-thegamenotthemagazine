// The map's projection: equirectangular on a 1000 × 500 picture, so a click maps to latitude and
// longitude linearly, and back.

export const MAP_W = 1000;
export const MAP_H = 500;

export type LatLon = { lat: number; lon: number };

export const pixelToLatLon = (x: number, y: number): LatLon => ({
  lat: 90 - (y / MAP_H) * 180,
  lon: (x / MAP_W) * 360 - 180,
});
export const latLonToPixel = (p: LatLon) => ({
  x: ((p.lon + 180) / 360) * MAP_W,
  y: ((90 - p.lat) / 180) * MAP_H,
});

/**
 * Where a stage's region sits on the 1000 × 500 picture in stretched coordinates (lib/stages.ts):
 * a centred box the map shows alone. The world is the whole picture.
 */
export const frameOf = (s: { lon0: number; lon1: number; lat0: number; lat1: number; factor: number }) => {
  const w = (((s.lon1 - s.lon0) * s.factor) / 360) * MAP_W;
  const h = (((s.lat1 - s.lat0) * s.factor) / 180) * MAP_H;
  return { x: (MAP_W - w) / 2, y: (MAP_H - h) / 2, w, h };
};
