import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/Game';
import { validateConfig, maxMines } from '../src/game/config';

function seeded(seed: number) { return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const cfg = { width: 9, height: 9, mines: 10 };

describe('Game', () => {
  it('first click is always safe, with safe neighbours, over many seeds', () => {
    for (let s = 1; s < 300; s++) {
      const g = new Game(cfg, seeded(s));
      const first = s % g.size;
      const r = g.reveal(first);
      expect(g.status).not.toBe('lost');
      expect(r.exploded).toBeNull();
      expect(g.cells[first].mine).toBe(false);
      for (const n of g.neighbors(first)) expect(g.cells[n].mine).toBe(false);
      expect(g.cells.filter(c => c.mine).length).toBe(10);
    }
  });
  it('adjacent counts are correct', () => {
    const g = new Game(cfg, seeded(7)); g.reveal(40);
    g.cells.forEach((c, i) => expect(c.adjacent).toBe(g.neighbors(i).filter(n => g.cells[n].mine).length));
  });
  it('zero cells flood-fill, borders revealed, mines never', () => {
    const g = new Game({ width: 10, height: 10, mines: 5 }, seeded(3));
    const r = g.reveal(0);
    expect(r.revealed.length).toBeGreaterThan(1);
    for (const { index } of r.revealed) expect(g.cells[index].mine).toBe(false);
    for (const { index } of r.revealed) if (g.cells[index].adjacent === 0)
      for (const n of g.neighbors(index)) expect(g.cells[n].revealed).toBe(true);
  });
  it('flagged cells cannot be opened; flags toggle and count', () => {
    const g = new Game(cfg, seeded(1));
    expect(g.toggleFlag(0)).toBe(true);
    expect(g.minesLeft).toBe(9);
    expect(g.reveal(0).revealed.length).toBe(0);
    expect(g.status).toBe('ready');
    g.toggleFlag(0);
    expect(g.minesLeft).toBe(10);
  });
  it('cannot flag revealed cells', () => {
    const g = new Game(cfg, seeded(2)); g.reveal(40);
    expect(g.toggleFlag(40)).toBe(false);
  });
  it('revealing a mine loses; no more actions afterwards', () => {
    const g = new Game(cfg, seeded(5)); g.reveal(40);
    const m = g.cells.findIndex(c => c.mine);
    const r = g.reveal(m);
    expect(r.exploded).toBe(m);
    expect(g.status).toBe('lost');
    expect(g.reveal(0).revealed.length).toBe(0);
    expect(g.toggleFlag(1)).toBe(false);
  });
  it('revealing all safe cells wins', () => {
    const g = new Game(cfg, seeded(9)); g.reveal(40);
    g.cells.forEach((c, i) => { if (!c.mine) g.reveal(i); });
    expect(g.status).toBe('won');
    expect(g.revealedCount).toBe(g.safeTotal);
  });
  it('restart gives a fresh game of same config', () => {
    const g = new Game(cfg, seeded(4)); g.reveal(40);
    const g2 = g.restart();
    expect(g2.status).toBe('ready');
    expect(g2.config).toEqual(g.config);
    expect(g2.cells.every(c => !c.revealed && !c.mine)).toBe(true);
  });
  it('chord opens neighbours only when flags match', () => {
    const g = new Game(cfg, seeded(11)); g.reveal(40);
    const i = g.cells.findIndex(c => c.revealed && c.adjacent > 0);
    expect(g.chord(i).revealed.length).toBe(0);
    g.neighbors(i).forEach(n => { if (g.cells[n].mine) g.toggleFlag(n); });
    g.chord(i);
    expect(g.status).not.toBe('lost');
  });
});

describe('config', () => {
  it('limits mines for custom mode', () => {
    const c = validateConfig({ width: 5, height: 5, mines: 999 });
    expect(c.mines).toBe(maxMines(5, 5));
    expect(c.mines).toBeLessThanOrEqual(16);
    expect(validateConfig({ width: 100, height: 1, mines: 0 })).toEqual({ width: 30, height: 5, mines: 1 });
    expect(validateConfig({ width: NaN, height: 9, mines: 5 }).width).toBe(5);
  });
  it('clamped dense game never loses on first click', () => {
    const g = new Game({ width: 5, height: 5, mines: 24 }, seeded(1));
    g.reveal(12);
    expect(g.status).not.toBe('lost');
  });
});
