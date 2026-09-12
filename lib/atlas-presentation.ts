export const ATLAS_IDLE_MS = 8000;

/** Interaction timing is independent of radar polling and camera animation. */
export function createAtlasPresentation(onChange: (compact: boolean) => void) {
  let active = false;
  let playing = false;
  let compact = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const show = (value: boolean) => {
    compact = value;
    onChange(value);
  };
  const schedule = () => {
    cancel();
    if (active && compact && !playing && !pointers.size) timer = setTimeout(() => show(false), ATLAS_IDLE_MS);
  };
  return {
    activate(value: boolean) {
      active = value;
      pointers.clear();
      cancel();
      show(false);
    },
    playback(value: boolean) {
      playing = value;
      if (active && value) show(true);
      schedule();
    },
    interact() {
      if (!active) return;
      show(true);
      schedule();
    },
    pointerDown(id: number) {
      if (!active) return;
      pointers.add(id);
      cancel();
      show(true);
    },
    pointerUp(id: number) {
      if (pointers.delete(id)) schedule();
    },
    releasePointers() {
      pointers.clear();
      schedule();
    },
    expand() {
      cancel();
      show(false);
    },
    destroy() {
      active = false;
      pointers.clear();
      cancel();
    },
  };
}
