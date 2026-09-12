import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteLocalRecord, loadLocalWorkspace, saveLocalRecord } from "@/lib/local-workspace";
afterEach(() => vi.unstubAllGlobals());
describe("local test workspace persistence", () => {
  it("persists a private observation and photo, reloads it through a fresh module and deletes it", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const image = "data:image/jpeg;base64,aW1hZ2U=";
    const record = await saveLocalRecord("observation", {
      title: "Nuages à Lille",
      place: "Lille",
      lat: 50.6292,
      lon: 3.0573,
      image,
      visibility: "public",
    });
    expect(record).toMatchObject({ lat: 50.63, lon: 3.06, visibility: "private", owner: true, demo: false, image });
    vi.resetModules();
    const reloaded = await import("@/lib/local-workspace");
    expect((await reloaded.loadLocalWorkspace()).records.find((r) => r.id === record.id)).toMatchObject(record);
    await reloaded.deleteLocalRecord(record.id);
    expect((await loadLocalWorkspace()).records.some((r) => r.id === record.id)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("updates existing profiles without duplicate records and retains community data", async () => {
    const profile = await saveLocalRecord("profile", { name: "Maxime" }),
      community = await saveLocalRecord("community", { name: "Ciels du Nord" });
    await saveLocalRecord("profile", { name: "XimaM" }, "", profile.id);
    const records = (await loadLocalWorkspace()).records;
    expect(records.filter((r) => r.id === profile.id)).toHaveLength(1);
    expect(records.find((r) => r.id === profile.id)?.name).toBe("XimaM");
    expect(records.find((r) => r.id === community.id)?.name).toBe("Ciels du Nord");
    await deleteLocalRecord(profile.id);
    await deleteLocalRecord(community.id);
  });
  it("rejects invalid coordinates before writing anything", async () => {
    await expect(
      saveLocalRecord("observation", { title: "Photo", place: "Lille", lat: NaN, lon: 3 }),
    ).rejects.toThrow();
    expect((await loadLocalWorkspace()).records).toHaveLength(0);
  });
});
