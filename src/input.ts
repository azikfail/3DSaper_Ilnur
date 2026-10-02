import type { BoardView } from './render/BoardView';

export interface InputHandlers {
  left(i: number): void;
  right(i: number): void;
  middle(i: number): void;
}

const CLICK_MOVE_PX = 6;
const CLICK_MAX_MS = 600;

/** Distinguishes clicks from camera drags and routes them to cell actions. */
export class Input {
  enabled = false;
  private down: { x: number; y: number; t: number; button: number } | null = null;

  constructor(private view: BoardView, private handlers: InputHandlers) {
    const c = view.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
      if (e.button === 1) e.preventDefault();
    });
    c.addEventListener('pointermove', e => {
      const dragging = this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_MOVE_PX;
      view.setHover(this.enabled && !dragging ? view.pick(e.clientX, e.clientY) : -1);
    });
    c.addEventListener('pointerleave', () => view.setHover(-1));
    window.addEventListener('pointerup', e => {
      const d = this.down; this.down = null;
      if (!d || !this.enabled || e.target !== c || e.button !== d.button) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_MOVE_PX || performance.now() - d.t > CLICK_MAX_MS) return;
      const i = view.pick(e.clientX, e.clientY);
      if (i < 0) return;
      if (d.button === 0) handlers.left(i);
      else if (d.button === 2) handlers.right(i);
      else if (d.button === 1) handlers.middle(i);
    });
  }
}
