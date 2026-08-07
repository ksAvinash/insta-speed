import { int, metres, seconds, renderStats } from './format.js';

const DETAIL = {
  stopped: (r) =>
    `You stopped ${r.error.toFixed(2)} m ${r.stoppedAt < r.target ? 'short of' : 'past'} the line.`,
  overshoot: (r) => `Overshot the line by ${r.error.toFixed(1)} m and rolled into the run-off.`,
  crash: (r) => `Into the wall at ${Math.round(r.impactKph)} km/h. The line was ${metres(r.target)}.`,
  offroad: () => 'Left the road. Braking hard leaves nothing to steer with — ease off to correct.',
  timeout: (r) =>
    `Out of time at ${r.timeLimit} s, still doing ${Math.round(r.timeoutKph)} km/h ` +
    `${metres(Math.abs(r.target - r.stoppedAt))} from the line. Brake later and harder — ` +
    `nursing it in costs more time than it saves.`,
};

/** The post-run card. */
export class Result {
  constructor(onRetry, onGarage) {
    this.root = document.getElementById('result');
    this.score = document.getElementById('result-score');
    this.label = document.getElementById('result-label');
    this.detail = document.getElementById('result-detail');
    this.stats = document.getElementById('result-stats');
    this.record = document.getElementById('result-record');
    this.unlock = document.getElementById('result-unlock');
    this.credits = document.getElementById('result-credits');
    this.retry = document.getElementById('retry');

    this.retry.addEventListener('click', onRetry);
    document.getElementById('to-garage').addEventListener('click', onGarage);
  }

  /** @param {ReturnType<import('../core/Game.js').Game['result']>} result */
  show(result) {
    // The score is the headline — it is what carries over between runs and what
    // the personal best is kept on. The grade band survives only as the colour
    // and the word under it.
    this.score.textContent = int(result.score);
    this.score.dataset.grade = result.grade;
    // Re-trigger the score pop when the same card is shown on a retry.
    this.score.style.animation = 'none';
    void this.score.offsetWidth;
    this.score.style.animation = '';
    this.label.textContent = result.label;
    this.detail.textContent = (DETAIL[result.outcome] ?? DETAIL.stopped)(result);

    renderStats(this.stats, {
      // The two halves of the score, so it is obvious what to attack next run.
      Precision: result.clean
        ? `${int(result.precisionPoints)} · ${result.error.toFixed(2)} m off`
        : '—',
      Pace: result.clean
        ? `${int(result.paceBonus)} · ${Math.round(result.pace * 100)}% of par`
        : '—',
      'Launch speed': `${int(result.launchSpeedKph)} km/h · ×${result.multiplier.toFixed(2)}`,
      'Stopped at': metres(result.stoppedAt),
      'Target line': metres(result.target),
      'Run time': `${seconds(result.time)} (par ${seconds(result.parSeconds)}, limit ${result.timeLimit} s)`,
      'Peak rotor': `${Math.round(result.peakRotorC)}°C`,
    });

    // Winning a rung should hand it straight over — the button launches at the
    // new speed rather than sending the player back through the garage.
    this.retry.textContent = result.unlockedKph
      ? `Launch at ${result.unlockedKph} km/h`
      : 'Run it again';

    // The first clean stop on a pairing pays a bonus, so it is called out
    // separately — otherwise the number just looks inconsistent run to run.
    if (result.creditsEarned > 0) {
      this.credits.textContent = result.clearBonus
        ? `+${int(result.creditsEarned)} cr — ${int(result.runCredits)} for the run, ${int(
            result.clearBonus,
          )} first clear · ${int(result.credits)} banked`
        : `+${int(result.creditsEarned)} cr · ${int(result.credits)} banked`;
      this.credits.hidden = false;
    } else {
      this.credits.hidden = true;
    }

    if (result.unlockedKph) {
      this.unlock.textContent = `${result.unlockedKph} km/h unlocked`;
      this.unlock.hidden = false;
    } else if (result.clean && result.isTopSpeed) {
      this.unlock.textContent = `Top speed cleared — ${int(result.launchSpeedKph)} km/h`;
      this.unlock.hidden = false;
    } else {
      this.unlock.hidden = true;
    }

    this.record.hidden = !result.isRecord;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
