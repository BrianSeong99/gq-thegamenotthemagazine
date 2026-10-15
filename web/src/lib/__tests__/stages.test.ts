// Stages: the stretched coordinates the quiz runs in, the frame each map shows, the dataset registry.
import { describe, expect, it } from "vitest";
import { frameOf, latLonToPixel, MAP_H, MAP_W } from "../map";
import { fromStretched, registerDataset, STAGES, stageById, stageOfDataset, toStretched, WORLD } from "../stages";
import { gameStage, quizCities } from "../quiz";
import { cosX100 } from "../rules";

describe("stretched coordinates", () => {
  it("leave the World Tour as it is", () => {
    for (const p of [{ lat: 48.86, lon: 2.35 }, { lat: -33.87, lon: 151.21 }, { lat: 64.15, lon: -21.94 }]) {
      expect(toStretched(WORLD, p)).toEqual(p);
      expect(fromStretched(WORLD, p)).toEqual(p);
    }
    expect(frameOf(WORLD)).toEqual({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  });

  it("scale a region by its zoom around its centre and come back, across the antimeridian too", () => {
    const europe = stageById("europe");
    const paris = toStretched(europe, { lat: 48.86, lon: 2.35 });
    expect(paris.lat).toBeCloseTo((48.86 - 48.5) * europe.factor, 6);
    expect(paris.lon).toBeCloseTo((2.35 - 10) * europe.factor, 6);
    expect(fromStretched(europe, paris).lat).toBeCloseTo(48.86, 6);
    expect(fromStretched(europe, paris).lon).toBeCloseTo(2.35, 6);
    const asia = stageById("asia");
    const apia = toStretched(asia, { lat: -13.83, lon: -171.76 }); // Samoa, east of the antimeridian
    expect(apia.lon).toBeCloseTo((188.24 - 107.5) * asia.factor, 6);
    expect(fromStretched(asia, apia).lon).toBeCloseTo(-171.76, 6);
    // every stage fits the picture: its corners land inside it
    for (const s of STAGES) {
      for (const p of [{ lat: s.lat0, lon: s.lon0 }, { lat: s.lat1, lon: s.lon1 - 1e-9 }]) {
        const { x, y } = latLonToPixel(toStretched(s, p));
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(MAP_W + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(MAP_H + 1e-6);
      }
      const f = frameOf(s);
      expect(f.w / f.h).toBeCloseTo((s.lon1 - s.lon0) / (s.lat1 - s.lat0), 6);
      // a region is framed 3:2, so it fits a desktop screen the way the 2:1 world does
      if (s.id !== "world") expect(f.w / f.h).toBeCloseTo(1.5, 6);
    }
  });

  it("the unlock order is the tile order", () => {
    expect(STAGES.map((s) => s.threshold)).toEqual([0, 3000, 4000, 5000, 6000]);
  });
});

describe("a stage quiz", () => {
  it("stores stretched coordinates with the cosine of the real latitude", async () => {
    const europe = stageById("europe");
    // ten places, so the pick has enough to choose from
    const dataset = Array.from({ length: 10 }, (_, i) => ({ name: `p${i}`, country: "Iceland", lat: 64.15 - i, lon: -21.94 + i }));
    const cities = await quizCities([1n, 2n, 3n, 4n], dataset, europe);
    for (const city of cities) {
      const p = dataset[city.idx];
      const s = toStretched(europe, p);
      expect(city).toEqual({ idx: city.idx, lat: Math.round((s.lat + 90) * 100), lon: Math.round((s.lon + 180) * 100), cos: cosX100(p.lat) });
    }
  });

  it("knows a record's stage by its dataset hash once the list is registered", () => {
    const word = [11n, 22n, 33n, 44n] as const;
    expect(stageOfDataset([...word])).toBeUndefined();
    registerDataset(stageById("africa"), [...word]);
    expect(stageOfDataset([...word])?.id).toBe("africa");
    const game = [1n, 2n, 3n, 4n, ...word, ...Array.from({ length: 40 }, () => 0n)];
    expect(gameStage(game)?.id).toBe("africa");
    expect(gameStage([1n, 2n])).toBeUndefined();
  });
});
