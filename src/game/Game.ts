import { GameConfig, validateConfig } from './config';

export type Status = 'ready' | 'playing' | 'won' | 'lost';
export type Rng = () => number;

export interface Cell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

export interface RevealResult {
  /** cells revealed by this action in BFS order, with distance from the origin */
  revealed: { index: number; depth: number }[];
  exploded: number | null;
}

export class Game {
  readonly config: GameConfig;
  readonly cells: Cell[];
  status: Status = 'ready';
  revealedCount = 0;
  flagCount = 0;
  private rng: Rng;

  constructor(config: GameConfig, rng: Rng = Math.random) {
    this.config = validateConfig(config);
    this.rng = rng;
    const n = this.config.width * this.config.height;
    this.cells = Array.from({ length: n }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }));
  }

  get width() { return this.config.width; }
  get height() { return this.config.height; }
  get size() { return this.cells.length; }
  get minesLeft() { return this.config.mines - this.flagCount; }
  get safeTotal() { return this.size - this.config.mines; }

  index(x: number, y: number) { return y * this.width + x; }

  neighbors(i: number): number[] {
    const x = i % this.width, y = (i / this.width) | 0, out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) out.push(this.index(nx, ny));
    }
    return out;
  }

  /** Places mines avoiding the first cell and (if possible) its neighbours. */
  private placeMines(first: number) {
    const forbidden = new Set<number>([first, ...this.neighbors(first)]);
    let pool: number[] = [];
    for (let i = 0; i < this.size; i++) if (!forbidden.has(i)) pool.push(i);
    if (pool.length < this.config.mines) { // fallback: only the clicked cell is safe
      pool = [];
      for (let i = 0; i < this.size; i++) if (i !== first) pool.push(i);
    }
    for (let k = 0; k < this.config.mines; k++) { // partial Fisher-Yates
      const j = k + Math.floor(this.rng() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      this.cells[pool[k]].mine = true;
    }
    for (let i = 0; i < this.size; i++) {
      this.cells[i].adjacent = this.neighbors(i).reduce((s, n) => s + (this.cells[n].mine ? 1 : 0), 0);
    }
  }

  reveal(i: number): RevealResult {
    const none: RevealResult = { revealed: [], exploded: null };
    if (this.status === 'won' || this.status === 'lost') return none;
    const c = this.cells[i];
    if (!c || c.revealed || c.flagged) return none;
    if (this.status === 'ready') { this.placeMines(i); this.status = 'playing'; }

    if (c.mine) {
      c.revealed = true;
      this.status = 'lost';
      return { revealed: [], exploded: i };
    }
    const result: RevealResult = { revealed: [], exploded: null };
    const queue: { index: number; depth: number }[] = [{ index: i, depth: 0 }];
    c.revealed = true;
    for (let q = 0; q < queue.length; q++) {
      const { index, depth } = queue[q];
      result.revealed.push({ index, depth });
      this.revealedCount++;
      if (this.cells[index].adjacent !== 0) continue;
      for (const n of this.neighbors(index)) {
        const nc = this.cells[n];
        if (nc.revealed || nc.flagged || nc.mine) continue;
        nc.revealed = true;
        queue.push({ index: n, depth: depth + 1 });
      }
    }
    this.checkWin();
    return result;
  }

  /** Reveal neighbours of a number whose flag count matches it (chord). */
  chord(i: number): RevealResult {
    const out: RevealResult = { revealed: [], exploded: null };
    const c = this.cells[i];
    if (this.status !== 'playing' || !c.revealed || c.adjacent === 0) return out;
    const ns = this.neighbors(i);
    if (ns.filter(n => this.cells[n].flagged).length !== c.adjacent) return out;
    for (const n of ns) {
      const r = this.reveal(n);
      out.revealed.push(...r.revealed);
      if (r.exploded !== null) out.exploded = r.exploded;
    }
    return out;
  }

  toggleFlag(i: number): boolean {
    const c = this.cells[i];
    if (!c || c.revealed || this.status === 'won' || this.status === 'lost') return false;
    c.flagged = !c.flagged;
    this.flagCount += c.flagged ? 1 : -1;
    return true;
  }

  private checkWin() {
    if (this.status === 'playing' && this.revealedCount === this.safeTotal) {
      this.status = 'won';
      for (const c of this.cells) if (c.mine && !c.flagged) { c.flagged = true; this.flagCount++; }
    }
  }

  /** Same config, fresh board. */
  restart(): Game { return new Game(this.config, this.rng); }
}
