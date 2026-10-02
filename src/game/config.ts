export interface GameConfig { width: number; height: number; mines: number; }
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'custom';

export const DIFFICULTIES: Record<Exclude<DifficultyId, 'custom'>, GameConfig & { label: string }> = {
  easy: { label: 'Easy', width: 9, height: 9, mines: 10 },
  medium: { label: 'Medium', width: 16, height: 16, mines: 40 },
  hard: { label: 'Hard', width: 24, height: 16, mines: 85 },
};

export const LIMITS = { minSize: 5, maxSize: 30 };

/** Max mines keeps the first click and its neighbours safe whenever possible. */
export function maxMines(w: number, h: number): number {
  return Math.max(1, Math.min(w * h - 9, Math.floor(w * h * 0.35)));
}

export function validateConfig(c: GameConfig): GameConfig {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(Number.isFinite(v) ? v : a)));
  const width = clamp(c.width, LIMITS.minSize, LIMITS.maxSize);
  const height = clamp(c.height, LIMITS.minSize, LIMITS.maxSize);
  const mines = clamp(c.mines, 1, maxMines(width, height));
  return { width, height, mines };
}
