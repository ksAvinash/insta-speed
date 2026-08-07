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
import { StartLights } from './ui/startLights.js';
import { VehicleSim } from './physics/VehicleSim.js';

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas);
const world = new World(renderer);
const game = new Game();
const input = new InputManager();
const audio = new Audio();
const hud = new Hud();
const startLights = new StartLights();

const settings = loadSettings();
game.select(settings.vehicleId, settings.sceneId);
// Default to the fastest rung already earned, rather than restarting the ladder.
game.selectFastestUnlocked();

const garage = new Garage(game, () => {
  world.buildVehicle(game.vehicle);
  // Location owns the sky, fog, ground and props. Vehicle/part/speed picks leave
  // the runway alone so the garage stays snappy — only rebuild when the scene
  // actually changes. `refresh()` always runs before this, so `garage.course`
  // is the live pairing the target line and props should match.
  if (world.currentScene?.id !== game.sceneId && garage.course) {
    world.buildScene(game.scene, garage.course);
  }
  // Fitting a part changes the spec the showcase is posed from, so the standing
  // sim is rebuilt here as well as on entering the garage.
  showcaseSim = new VehicleSim(game.vehicle, game.scene, {
    launchSpeedKph: game.launchSpeedKph,
  });
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

const TILT_MESSAGES = {
  granted: 'Tilt steering on. Hold the phone however you like — it re-centres at launch.',
  denied: 'Tilt permission denied. On-screen arrows will steer instead.',
  unsupported: 'No motion sensor available. On-screen arrows will steer instead.',
};

if (input.gyro.supported && input.touch.available) tiltToggle.hidden = false;

/**
 * Tilt steering is the default on anything with a touchscreen — it is the
 * control the game is designed around, and arriving on a phone to find two
 * small arrows instead reads as the mobile version being an afterthought. The
 * pads stay as the fallback for a refused or missing sensor.
 *
 * Getting there is fiddlier than a flag. Android hands over the sensor for the
 * asking, so it can be switched on at load. iOS only resolves
 * `requestPermission()` inside a real user gesture, so the first tap anywhere
 * in the garage is used, and `startRun` awaits it — otherwise the permission
 * sheet appears over a countdown that is already running.
 */
let tiltEnabled = settings.tilt !== false;
let tiltAttempted = false;

async function ensureTilt({ gesture = false } = {}) {
  if (tiltAttempted || input.gyroActive) return;
  if (!tiltEnabled || !input.gyro.supported || !input.touch.available) return;
  if (input.gyro.needsPermission && !gesture) return;

  tiltAttempted = true;
  const status = await input.enableGyro();
  if (status !== 'granted') tiltEnabled = false;
  updateControlAffordances(status === 'granted' ? '' : TILT_MESSAGES[status]);
}

tiltToggle.addEventListener('click', async () => {
  if (input.gyroActive) {
    input.disableGyro();
    tiltEnabled = false;
    saveSettings({ tilt: false });
    updateControlAffordances('Tilt steering off. Use the on-screen arrows.');
    return;
  }

  tiltToggle.disabled = true;
  tiltEnabled = true;
  tiltAttempted = false;
  await ensureTilt({ gesture: true });
  tiltToggle.disabled = false;
  saveSettings({ tilt: input.gyroActive });
  if (input.gyroActive) updateControlAffordances(TILT_MESSAGES.granted);
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

async function startRun() {
  // Resolved before the countdown so a first-run permission sheet cannot land
  // on top of a launch already in progress.
  await ensureTilt({ gesture: true });

  // A rung earned on the last run is taken up here, so the button on the
  // result card launches at the new speed instead of sending the player back
  // through the garage to pick it.
  game.takeUnlockedSpeed();

  result.hide();
  garage.hide();

  audio.init();
  audio.resume();

  world.buildVehicle(game.vehicle);
  game.launch();
  world.buildScene(game.scene, game.course);

  input.reset();
  input.calibrate();
  hud.setCourse(game.course);
  hud.show();
  hud.setHint('');
}

document.getElementById('start').addEventListener('click', startRun);

// Any first tap in the garage is a good enough gesture to ask iOS for the
// motion sensor, so tilt is usually already live by the time Launch is pressed.
document.getElementById('garage').addEventListener(
  'pointerdown',
  () => ensureTilt({ gesture: true }),
  { once: true },
);

bus.on('statechange', (state) => {
  document.body.dataset.state = state;
  if (state === 'garage') {
    garage.show();
    hud.hide();
    startLights.hide();
    pads.hidden = true;
    audio.silence();
    showcaseSim = new VehicleSim(game.vehicle, game.scene, {
      launchSpeedKph: game.launchSpeedKph,
    });
  }
  if (state === 'countdown') {
    pads.hidden = !input.needsSteerPads;
    // Vehicle picks the gantry: F1 for cars, MotoGP for bikes, traffic for trucks.
    startLights.show(game.vehicle);
  }
  if (state === 'result') {
    audio.silence();
    hud.hide();
    startLights.hide();
    pads.hidden = true;
    result.show(game.result);
  }
});

bus.on('countdown', (n) => {
  // Beeps still track the second ticks; the lamps are driven continuously
  // from remaining time in the render loop.
  audio.beep(n > 0 ? 620 : 980, n > 0 ? 0.1 : 0.3);
});

bus.on('launched', () => {
  startLights.go();
  // Brief hold on the extinguish / green so the start reads, then clear.
  window.setTimeout(() => startLights.hide(), 420);
  hud.setHint('Hold to brake');
});

bus.on('result', (r) => {
  if (r.outcome === 'crash') audio.impact(1);
  else if (r.outcome === 'offroad' || r.outcome === 'timeout') audio.impact(0.5);
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
      if (game.state === 'countdown') startLights.update(game.countdown);
      // The sim keeps its final state after a run ends, so everything driven by
      // it — camera shake, smoke, streaks — has to be told the run is over or
      // it carries on shaking the scene behind the result card.
      world.update(game.sim, frameDt, game.state !== 'result');
      if (import.meta.env.DEV) {
        window.__debug = {
          camera: renderer.camera,
          sim: game.sim,
          chase: world.chase,
          world,
          game,
          tier: renderer.tierName,
          info: renderer.info,
        };
      }
      audio.update(game.sim, frameDt);
      if (game.state === 'running') hud.update(game.sim, game.distanceToTarget);
    }

    if (import.meta.env.DEV) perfOverlay?.tick(frameDt);
    renderer.render();
  },
});

/* ---------------------------------------------------------- dev overlay */

/** Tiny FPS / tier / draw-call strip. `?tier=low|medium|high` forces a quality tier. */
const perfOverlay =
  import.meta.env.DEV && new URLSearchParams(location.search).has('perf')
    ? (() => {
        const el = document.createElement('div');
        el.id = 'perf-overlay';
        el.style.cssText =
          'position:fixed;left:8px;bottom:8px;z-index:50;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;' +
          'color:#c8d0da;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);border-radius:6px;' +
          'pointer-events:none;white-space:pre';
        document.body.append(el);
        let frames = 0;
        let accum = 0;
        let fps = 0;
        return {
          tick(dt) {
            frames++;
            accum += dt;
            if (accum >= 0.5) {
              fps = frames / accum;
              frames = 0;
              accum = 0;
              const info = renderer.info.render;
              el.textContent =
                `${fps.toFixed(0)} fps  tier=${renderer.tierName}\n` +
                `calls ${info.calls}  tris ${info.triangles}  smoke ${world.smoke.count}`;
            }
          },
        };
      })()
    : null;

/* ------------------------------------------------------------------ start */

world.buildVehicle(game.vehicle);
// A placeholder course just so the garage has scenery behind the showcase.
world.buildScene(game.scene, {
  target: 800,
  wall: 840,
  runway: 1200,
  roadWidth: game.scene.roadWidth ?? 14,
});
updateControlAffordances();
ensureTilt();
garage.show();
document.body.dataset.state = 'garage';
loop.start();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.reset();
});
