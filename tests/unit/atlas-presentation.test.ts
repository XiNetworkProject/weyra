import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATLAS_IDLE_MS, createAtlasPresentation } from "@/lib/atlas-presentation";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function setup() {
  const change = vi.fn();
  const controller = createAtlasPresentation(change);
  controller.activate(true);
  return { controller, change };
}
describe("Atlas presentation during exploration", () => {
  it("reduces immediately and restores only after eight seconds from the last interaction", () => {
    const { controller, change } = setup();
    controller.interact();
    expect(change).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(7000);
    controller.interact();
    vi.advanceTimersByTime(7999);
    expect(change).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it("keeps information compact throughout a long drag or pinch, then starts the idle delay", () => {
    const { controller, change } = setup();
    controller.pointerDown(1);
    controller.pointerDown(2);
    vi.advanceTimersByTime(30000);
    expect(change).toHaveBeenLastCalledWith(true);
    controller.pointerUp(1);
    vi.advanceTimersByTime(10000);
    expect(change).toHaveBeenLastCalledWith(true);
    controller.pointerUp(2);
    vi.advanceTimersByTime(ATLAS_IDLE_MS);
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it("stays compact during radar playback and restores eight seconds after pausing", () => {
    const { controller, change } = setup();
    controller.playback(true);
    vi.advanceTimersByTime(60000);
    expect(change).toHaveBeenLastCalledWith(true);
    controller.interact();
    controller.playback(false);
    vi.advanceTimersByTime(7999);
    expect(change).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it("allows immediate explicit expansion even during playback", () => {
    const { controller, change } = setup();
    controller.playback(true);
    controller.expand();
    vi.advanceTimersByTime(20000);
    expect(change).toHaveBeenLastCalledWith(false);
    controller.interact();
    expect(change).toHaveBeenLastCalledWith(true);
  });
  it("resets on leaving and returning, ignoring interactions while hidden", () => {
    const { controller, change } = setup();
    controller.interact();
    controller.activate(false);
    controller.interact();
    vi.advanceTimersByTime(10000);
    expect(change).toHaveBeenLastCalledWith(false);
    controller.activate(true);
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it("releases a pointer when the window loses focus without overriding playback", () => {
    const { controller, change } = setup();
    controller.pointerDown(1);
    controller.playback(true);
    controller.releasePointers();
    vi.advanceTimersByTime(10000);
    expect(change).toHaveBeenLastCalledWith(true);
    controller.playback(false);
    vi.advanceTimersByTime(ATLAS_IDLE_MS);
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it("cancels pending work on unmount", () => {
    const { controller, change } = setup();
    controller.interact();
    controller.destroy();
    change.mockClear();
    vi.advanceTimersByTime(10000);
    expect(change).not.toHaveBeenCalled();
  });
});
