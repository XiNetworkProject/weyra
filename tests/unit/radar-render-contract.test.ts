import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import renderContract from "../../radar-worker/render-contract.json";

describe("radar render contract", () => {
  it("declares a stable frame palette version", () => {
    expect(renderContract.framePaletteVersion).toMatch(/^weyra-v\d+$/);
  });

  it("is consumed by both the Python renderer and the TypeScript cache validator", async () => {
    const [pythonRenderer, typescriptValidator] = await Promise.all([
      readFile(path.join(process.cwd(), "radar-worker", "render_opera.py"), "utf8"),
      readFile(path.join(process.cwd(), "lib", "server", "opera-render.ts"), "utf8"),
    ]);

    expect(pythonRenderer).toContain('with Path(__file__).with_name("render-contract.json")');
    expect(typescriptValidator).toContain('from "@/radar-worker/render-contract.json"');
  });
});
