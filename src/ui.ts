import { DIFFICULTIES, GameConfig, LIMITS, maxMines, validateConfig, DifficultyId } from './game/config';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface UIHandlers {
  start(id: DifficultyId, cfg: GameConfig): void;
  restart(): void;
  newGame(): void;
  resume(): void;
  viewBoard(): void;
  settingsChanged(s: Settings): void;
}
export interface Settings { sound: boolean; music: boolean; volume: number; shake: boolean; rotate: boolean; }

export class UI {
  settings: Settings = { sound: true, music: true, volume: 0.6, shake: true, rotate: false };

  constructor(private h: UIHandlers) {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('sapper.settings') || '{}')); } catch { /* ignore */ }
    $<HTMLInputElement>('s-sound').checked = this.settings.sound;
    $<HTMLInputElement>('s-music').checked = this.settings.music;
    $<HTMLInputElement>('s-volume').value = String(this.settings.volume);
    $<HTMLInputElement>('s-shake').checked = this.settings.shake;
    $<HTMLInputElement>('s-rotate').checked = this.settings.rotate;

    document.querySelectorAll<HTMLButtonElement>('.mode').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.mode as DifficultyId;
      if (m === 'custom') {
        $('custom').classList.toggle('hidden');
        b.classList.toggle('active');
        this.updateCustomInfo();
      } else h.start(m, DIFFICULTIES[m]);
    }));
    for (const id of ['c-w', 'c-h', 'c-m']) $(id).addEventListener('input', () => this.updateCustomInfo());
    $('c-start').addEventListener('click', () => { const c = this.readCustom(); this.writeCustom(c); h.start('custom', c); });

    $('btn-restart').addEventListener('click', () => h.restart());
    $('btn-new').addEventListener('click', () => h.newGame());
    $('menu-resume').addEventListener('click', () => h.resume());
    $('end-restart').addEventListener('click', () => h.restart());
    $('end-new').addEventListener('click', () => h.newGame());
    $('end-view').addEventListener('click', () => h.viewBoard());

    $('btn-settings').addEventListener('click', () => this.toggleSettings(true));
    $('s-close').addEventListener('click', () => this.toggleSettings(false));
    $('settings').addEventListener('pointerdown', e => { if (e.target === $('settings')) this.toggleSettings(false); });
    for (const id of ['s-sound', 's-music', 's-volume', 's-shake', 's-rotate']) $(id).addEventListener('input', () => this.saveSettings());
    this.updateCustomInfo();
    this.showBest();
  }

  private saveSettings() {
    this.settings = {
      sound: $<HTMLInputElement>('s-sound').checked,
      music: $<HTMLInputElement>('s-music').checked,
      volume: Number($<HTMLInputElement>('s-volume').value),
      shake: $<HTMLInputElement>('s-shake').checked,
      rotate: $<HTMLInputElement>('s-rotate').checked,
    };
    try { localStorage.setItem('sapper.settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.h.settingsChanged(this.settings);
  }

  toggleSettings(open: boolean) { $('settings').classList.toggle('hidden', !open); }
  get settingsOpen() { return !$('settings').classList.contains('hidden'); }

  // ----- custom mode -----
  private readCustom(): GameConfig {
    return validateConfig({
      width: Number($<HTMLInputElement>('c-w').value),
      height: Number($<HTMLInputElement>('c-h').value),
      mines: Number($<HTMLInputElement>('c-m').value),
    });
  }
  private writeCustom(c: GameConfig) {
    $<HTMLInputElement>('c-w').value = String(c.width);
    $<HTMLInputElement>('c-h').value = String(c.height);
    $<HTMLInputElement>('c-m').value = String(c.mines);
  }
  private updateCustomInfo() {
    const w = Number($<HTMLInputElement>('c-w').value), h = Number($<HTMLInputElement>('c-h').value);
    const raw = Number($<HTMLInputElement>('c-m').value);
    const c = this.readCustom();
    const info = $('c-info');
    $<HTMLInputElement>('c-m').max = String(c.mines === raw ? maxMines(c.width, c.height) : maxMines(c.width, c.height));
    const adjusted = c.width !== w || c.height !== h || c.mines !== raw;
    info.textContent = adjusted
      ? `Adjusted to ${c.width} × ${c.height}, ${c.mines} mines (size ${LIMITS.minSize}–${LIMITS.maxSize}, max ${maxMines(c.width, c.height)} mines)`
      : `Max ${maxMines(c.width, c.height)} mines for this size`;
    info.classList.toggle('warn', adjusted);
  }

  // ----- HUD -----
  showMenu(canResume: boolean) {
    $('menu').classList.remove('hidden');
    $('menu-resume').classList.toggle('hidden', !canResume);
    $('hud').classList.add('hidden'); $('hint').classList.add('hidden');
    this.showBest();
  }
  hideMenu() { $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('hint').classList.remove('hidden'); }
  get menuOpen() { return !$('menu').classList.contains('hidden'); }
  setMines(n: number) { $('mines').textContent = String(n); }
  setTimer(s: number) { $('timer').textContent = String(Math.min(999, Math.floor(s))).padStart(3, '0'); }
  setMode(text: string) { $('mode').textContent = text; }

  showEnd(win: boolean, seconds: number, extra: string) {
    const card = document.querySelector('.end-card')!;
    card.classList.toggle('win', win); card.classList.toggle('lose', !win);
    $('end-title').textContent = win ? 'VICTORY' : 'GAME OVER';
    $('end-sub').textContent = win ? `Field cleared in ${seconds.toFixed(1)} s. Photo unlocked! ${extra}` : `You hit a mine after ${seconds.toFixed(1)} s. Clear the whole field to unlock the photo.`;
    $('end').classList.remove('hidden');
  }
  hideEnd() { $('end').classList.add('hidden'); }

  // ----- best times -----
  static bestKey(id: DifficultyId, c: GameConfig) { return `sapper.best.${id}.${c.width}x${c.height}x${c.mines}`; }
  static getBest(id: DifficultyId, c: GameConfig): number | null {
    try { const v = localStorage.getItem(UI.bestKey(id, c)); return v ? Number(v) : null; } catch { return null; }
  }
  static saveBest(id: DifficultyId, c: GameConfig, t: number): boolean {
    const prev = UI.getBest(id, c);
    if (prev !== null && prev <= t) return false;
    try { localStorage.setItem(UI.bestKey(id, c), String(t)); } catch { /* ignore */ }
    return true;
  }
  showBest() {
    const parts = (Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map(id => {
      const b = UI.getBest(id, DIFFICULTIES[id]);
      return b !== null ? `${DIFFICULTIES[id].label}: ${b.toFixed(1)}s` : null;
    }).filter(Boolean);
    $('best').textContent = parts.length ? `Best times — ${parts.join(' · ')}` : '';
  }
}
