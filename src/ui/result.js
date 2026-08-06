import { int, metres, seconds, renderStats } from './format.js';

const DETAIL = {
  stopped: (r) =>
    `You stopped ${r.error.toFixed(2)} m ${r.stoppedAt < r.target ? 'short of' : 'past'} the line.`,
  overshoot: (r) => `Overshot the line by ${r.error.toFixed(1)} m and rolled into the run-off.`,
  crash: (r) => `Into the wall at ${Math.round(r.impactKph)} km/h. The line was ${metres(r.target)}.`,
  offroad: () => 'Left the road. Braking hard leaves nothing to steer with — ease off to correct.',
};

/** The post-run card. */
export class Result {
  constructor(onRetry, onGarage) {
    this.root = document.getElementById('result');
    this.grade = document.getElementById('result-grade');
    this.label = document.getElementById('result-label');
    this.detail = document.getElementById('result-detail');
    this.stats = document.getElementById('result-stats');
    this.record = document.getElementById('result-record');

    document.getElementById('retry').addEventListener('click', onRetry);
    document.getElementById('to-garage').addEventListener('click', onGarage);
  }

  /** @param {ReturnType<import('../core/Game.js').Game['result']>} result */
  show(result) {
    this.grade.textContent = result.grade;
    this.grade.dataset.grade = result.grade;
    this.label.textContent = result.label;
    this.detail.textContent = (DETAIL[result.outcome] ?? DETAIL.stopped)(result);

    renderStats(this.stats, {
      Score: int(result.score),
      'Stopped at': metres(result.stoppedAt),
      'Target line': metres(result.target),
      'Time to stop': seconds(result.time),
      'Peak rotor': `${Math.round(result.peakRotorC)}°C`,
      Accuracy: `${Math.round(result.accuracy * 100)}%`,
    });

    this.record.hidden = !result.isRecord;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
