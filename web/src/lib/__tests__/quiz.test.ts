import { describe, expect, it } from "vitest";
import quizVectors from "../../../../rules/quiz_vectors.json";
import { cityNames, datasetWord, encodeGame, pickIndices, recordCities, seedBytes, type Word4 } from "../quiz";

const toWord = (s: (number | string)[]): Word4 => s.map((v) => BigInt(v)) as Word4;

describe("quiz selection", () => {
  it("picks the same indices as the Rust reference", async () => {
    for (const v of quizVectors) {
      expect(await pickIndices(toWord(v.seed), v.dataset_size), JSON.stringify(v.seed)).toEqual(v.indices);
    }
  });

  it("serializes the seed little-endian", () => {
    const bytes = seedBytes([1n, 0n, 0n, 256n]);
    expect(bytes[0]).toBe(1);
    expect(bytes[25]).toBe(1);
  });

  it("hashes the dataset bytes into four u32 felts", async () => {
    const w = await datasetWord(new TextEncoder().encode("abc"));
    // sha256("abc") = ba7816bf 8f01cfea 414140de 5dae2223 ...
    expect(w[0]).toBe(BigInt(0xbf1678ba));
    expect(w[1]).toBe(BigInt(0xeacf018f));
  });
});

describe("a record's cities by name", () => {
  it("decodes GeoQuizz game data, names what the dataset knows, and gives nothing for other game data", () => {
    const places = [{ name: "Funafuti", country: "Tuvalu", lat: 0, lon: 0 }];
    const cities = Array.from({ length: 10 }, (_, i) => ({ idx: i, lat: 0, lon: 0, cos: 0 }));
    const game = encodeGame({ seed: [0n, 0n, 0n, 0n], dataset: [0n, 0n, 0n, 0n], cities });
    expect(cityNames(recordCities(game), places)).toEqual(["Funafuti"]);
    expect(recordCities([])).toEqual([]);
  });
});
