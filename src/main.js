import './ui/styles.css';

import { Game } from './core/Game.js';
import { Loop } from './core/Loop.js';
import { bus } from './core/Bus.js';
import { loadSettings, saveSettings } from './core/Storage.js';
import { Renderer } from './render/Renderer.js';
import { World } from './render/World.js';
import { InputManager } from './input/InputManager.js';
import { Audio } from './fx/Audio.js';
import { Garage } from './ui/garage.js';
import { Hud } from './ui/hud.js';
import { Result } from './ui/result.js';
import { VehicleSim } from './physics/VehicleSim.js';

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas);
const world = new World(renderer);
const game = new Game();
const input = new InputManager();
const audio = new Audio();
const hud = new Hud();

const settings = loadSettings();
game.select(settings.vehicleId, settings.sceneId);
// Default to the fastest rung already earned, rather than restarting the ladder.
game.selectFastestUnlocked();

const garage = new Garage(game, () => {
  world.buildVehicle(game.vehicle);
  saveSettings({ vehicleId: game.vehicleId, sceneId: game.sceneId });
});

const result = new Result(
  () => startRun(),
  () => {
    result.hide();
    game.backToGarage();
  },
);

// A sim held in the garage purely so the showcase view has something to draw.
let showcaseSim = new VehicleSim(game.vehicle, game.scene, {
  launchSpeedKph: game.launchSpeedKph,
});

/* ------------------------------------------------------------------ input */

const brakeSurface = document.getElementById('brake-surface');
const pads = document.getElementById('pads');
const padLeft = document.getElementById('pad-left');
const padRight = document.getElementById('pad-right');
input.attach(brakeSurface, { left: padLeft, right: padRight });

const tiltToggle = document.getElementById('tilt-toggle');
const muteToggle = document.getElementById('mute-toggle');
const controlsHint = document.getElementById('controls-hint');

if (input.gyro.supported && input.touch.available) tiltToggle.hidden = false;

tiltToggle.addEventListener('click', async () => {
  if (input.gyroActive) {
    input.disableGyro();
    updateControlAffordances('Tilt steering off. Use the on-screen arrows.');
    return;
  }
  tiltToggle.disabled = true;
  const status = await input.enableGyro();
  tiltToggle.disabled = false;

  const messages = {
    granted: 'Tilt steering on. Hold the phone however you like — it re-centres at launch.',
    denied: 'Tilt permission denied. On-screen arrows will steer instead.',
    unsupported: 'No motion sensor available. On-screen arrows will steer instead.',
  };
  updateControlAffordances(messages[status]);
});

muteToggle.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  muteToggle.textContent = muted ? 'Sound off' : 'Sound on';
  muteToggle.setAttribute('aria-pressed', String(muted));
  saveSettings({ muted });
});

if (settings.muted) {
  audio.setMuted(true);
  muteToggle.textContent = 'Sound off';
  muteToggle.setAttribute('aria-pressed', 'true');
}

input.keyboard.onRestart = () => {
  if (game.state === 'result') startRun();
};

function updateControlAffordances(message) {
  tiltToggle.textContent = input.gyroActive ? 'Disable tilt steering' : 'Enable tilt steering';
  pads.hidden = !input.needsSteerPads;

  const base = input.touch.available
    ? input.gyroActive
      ? 'Tilt to steer · hold anywhere to brake.'
      : 'Arrows to steer · hold anywhere else to brake.'
    : 'Left / Right arrows steer · Down or Space brakes · Enter restarts.';
  controlsHint.textContent = message ? `${base} ${message}` : base;
}

/* ------------------------------------------------------------------- flow */

function startRun() {
  result.hide();
  garage.hide();

  audio.init();
  audio.resume();

  world.buildVehicle(game.vehicle);
  game.launch();
  world.buildScene(game.scene, game.course);

  input.reset();
  input.calibrate();
  hud.show();
  hud.setHint('');
}

document.getElementById('start').addEventListener('click', startRun);

bus.on('statechange', (state) => {
  document.body.dataset.state = state;
  if (state === 'garage') {
    garage.show();
    hud.hide();
    pads.hidden = true;
    audio.silence();
    showcaseSim = new VehicleSim(game.vehicle, game.scene, {
      launchSpeedKph: game.launchSpeedKph,
    });
  }
  if (state === 'countdown') {
    pads.hidden = !input.needsSteerPads;
  }
  if (state === 'result') {
    audio.silence();
    hud.hide();
    pads.hidden = true;
    result.show(game.result);
  }
});

const countdownEl = document.getElementById('countdown');
const countdownValue = document.getElementById('countdown-value');

bus.on('countdown', (n) => {
  countdownEl.hidden = false;
  countdownValue.textContent = n > 0 ? String(n) : 'GO';
  // Re-trigger the pop animation.
  countdownValue.style.animation = 'none';
  void countdownValue.offsetWidth;
  countdownValue.style.animation = '';
  audio.beep(n > 0 ? 620 : 980, n > 0 ? 0.1 : 0.3);
});

bus.on('launched', () => {
  countdownEl.hidden = true;
  hud.setHint('Hold to brake');
});

bus.on('result', (r) => {
  if (r.outcome === 'crash') audio.impact(1);
  else if (r.outcome === 'offroad') audio.impact(0.5);
});

/* ------------------------------------------------------------------- loop */

let showcaseTime = 0;

const loop = new Loop({
  update: (dt) => {
    const value = input.update(dt);
    game.update(dt, value);
  },
  render: (_alpha, frameDt) => {
    renderer.probe(frameDt);

    if (game.state === 'garage') {
      showcaseTime += frameDt;
      world.showcase(game.vehicle, showcaseTime);
      world.vehicle.update(showcaseSim, frameDt);
    } else if (game.sim) {
      world.update(game.sim, frameDt);
      if (import.meta.env.DEV) {
        window.__debug = { camera: renderer.camera, sim: game.sim, chase: world.chase, world, game };
      }
      audio.update(game.sim, frameDt);
      if (game.state === 'running') hud.update(game.sim, game.distanceToTarget);
    }

    renderer.render();
  },
});

/* ------------------------------------------------------------------ start */

world.buildVehicle(game.vehicle);
// A placeholder course just so the garage has scenery behind the showcase.
world.buildScene(game.scene, {
  target: 800,
  wall: 840,
  runway: 1200,
  roadWidth: game.scene.roadWidth ?? 20,
});
updateControlAffordances();
garage.show();
document.body.dataset.state = 'garage';
loop.start();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.reset();
});
