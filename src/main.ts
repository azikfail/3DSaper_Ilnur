import './style.css';
import { BoardView } from './render/BoardView';
import { Game } from './game/Game';
import { DIFFICULTIES, DifficultyId, GameConfig } from './game/config';
import { Input } from './input';
import { UI, Settings } from './ui';
import { sound } from './audio';

const view = new BoardView(document.getElementById('scene') as HTMLCanvasElement);

let game: Game;
let mode: DifficultyId = 'easy';
let timerStart = 0;       // performance.now() at first reveal
let elapsed = 0;
let timerRunning = false;
let endTimeout = 0;
let hasGame = false;

function applySettings(s: Settings) {
  sound.enabled = s.sound;
  if (!s.sound) sound.stopVoice();
  sound.volume = s.volume;
  sound.musicEnabled = s.music;
  sound.syncMusic();
  view.shakeEnabled = s.shake;
  view.setAutoRotate(s.rotate || ui.menuOpen);
}

const ui: UI = new UI({
  start: (id, cfg) => startGame(id, cfg),
  restart: () => startGame(mode, game.config),
  newGame: () => openMenu(),
  resume: () => { ui.hideMenu(); input.enabled = game.status !== 'won' && game.status !== 'lost'; applySettings(ui.settings); },
  viewBoard: () => ui.hideEnd(),
  settingsChanged: applySettings,
});

const input = new Input(view, {
  left(i) {
    if (game.status === 'won' || game.status === 'lost') return;
    const c = game.cells[i];
    if (c.flagged) return;
    if (c.revealed) { handleReveal(i, true); return; }
    handleReveal(i, false);
  },
  right(i) {
    const was = game.cells[i]?.flagged;
    if (game.toggleFlag(i)) {
      view.setFlag(i, game.cells[i].flagged);
      was ? sound.unflag() : sound.flag();
      ui.setMines(game.minesLeft);
    }
  },
  middle(i) { if (game.cells[i].revealed) handleReveal(i, true); },
});

function handleReveal(i: number, chord: boolean) {
  const before = game.status;
  const res = chord ? game.chord(i) : game.reveal(i);
  if (!res.revealed.length && res.exploded === null) return;
  if (before === 'ready' && game.status === 'playing') { timerStart = performance.now(); timerRunning = true; }
  view.revealCells(res);
  if (res.revealed.length) sound.reveal(res.revealed.length);
  if (game.status === 'lost') return lose(res.exploded!);
  if (game.status === 'won') return win(i);
}

function finish() { timerRunning = false; elapsed = (performance.now() - timerStart) / 1000; ui.setTimer(elapsed); input.enabled = false; }

function lose(idx: number) {
  finish();
  view.explode(idx);
  sound.explosion();
  sound.voice('lose', 0.9);
  ui.setMines(game.minesLeft);
  endTimeout = window.setTimeout(() => ui.showEnd(false, elapsed, ''), 1700);
}

function win(from: number) {
  finish();
  view.win(from);
  sound.win();
  sound.voice('win', 0.8);
  ui.setMines(0);
  const record = UI.saveBest(mode, game.config, elapsed);
  endTimeout = window.setTimeout(() => ui.showEnd(true, elapsed, record ? 'New best time!' : ''), 1400);
}

function startGame(id: DifficultyId, cfg: GameConfig) {
  sound.stopVoice();
  clearTimeout(endTimeout);
  mode = id;
  const { width, height, mines } = cfg;
  game = new Game({ width, height, mines });
  hasGame = true;
  timerRunning = false; elapsed = 0;
  view.hoverEnabled = true;
  view.build(game);
  ui.hideEnd(); ui.hideMenu();
  ui.setTimer(0); ui.setMines(game.minesLeft);
  const label = id === 'custom' ? 'Custom' : DIFFICULTIES[id].label;
  ui.setMode(`${label} · ${game.width}×${game.height}`);
  input.enabled = true;
  applySettings(ui.settings);
}

function openMenu() {
  sound.stopVoice();
  clearTimeout(endTimeout);
  ui.hideEnd();
  input.enabled = false;
  ui.showMenu(hasGame && game.status !== 'won' && game.status !== 'lost');
  view.setAutoRotate(true);
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (ui.settingsOpen) ui.toggleSettings(false);
    else if (!ui.menuOpen) openMenu();
  } else if (e.target instanceof HTMLInputElement) return;
  else if (e.key === 'r' || e.key === 'R') { if (hasGame && !ui.menuOpen) startGame(mode, game.config); }
  else if (e.key === 'm' || e.key === 'M') {
    ui.settings.sound = !ui.settings.sound; sound.enabled = ui.settings.sound;
    if (!sound.enabled) sound.stopVoice();
    sound.syncMusic();
    (document.getElementById('s-sound') as HTMLInputElement).checked = ui.settings.sound;
  }
});

// Browsers allow audio only after a user gesture: start the music on the first one.
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('keydown', () => sound.unlock(), { once: true });

// HUD timer
setInterval(() => { if (timerRunning) ui.setTimer((performance.now() - timerStart) / 1000); }, 100);

// Boot: decorative board behind the start menu.
game = new Game(DIFFICULTIES.medium);
view.build(game);
view.hoverEnabled = false;
view.setAutoRotate(true);
applySettings(ui.settings);
ui.showMenu(false);

// Test / debug hook
(window as unknown as { __sapper: unknown }).__sapper = { get game() { return game; }, view, reveal: (i: number) => handleReveal(i, false) };
