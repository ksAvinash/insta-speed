# insta-speed

**Open source.** A browser braking game with real vehicle physics.

You are launched instantly at speed. One job: **stop on the line.**

Play: **[ksavinash.github.io/insta-speed](https://ksavinash.github.io/insta-speed/)**  
Repo: **[github.com/ksAvinash/insta-speed](https://github.com/ksAvinash/insta-speed)**

## Contribute

Fork it, add a feature, open a PR. Vehicles and scenes are one-file drops.

- **Vehicle** → `src/vehicles/specs/`
- **Scene** → `src/scenes/defs/`
- **Feel / polish** → physics, audio, garage UI, scoring, mobile UX

```bash
git clone https://github.com/ksAvinash/insta-speed.git
cd insta-speed
npm install
npm run dev          # https://localhost:5173
npm test             # before opening a PR
```

Phone over LAN: `npm run dev:mobile` (HTTPS required for tilt — accept the cert warning).

Full checklist: [`docs/ADDING_CONTENT.md`](docs/ADDING_CONTENT.md). Issues and PRs welcome.

## Controls

|        | Steer                     | Brake                       |
| ------ | ------------------------- | --------------------------- |
| Desktop | ← / → or A / D           | ↓, S, or Space              |
| Phone   | Tilt or on-screen arrows | Hold anywhere on the screen |

## Game in brief

Speed ladders unlock with clean stops (car 300→600, bike 150→300, truck 100→250).  
Score 0–100 = Close (80) + Fast (20). Earn **$**, spend on tyres / brakes / aero / chassis.

More detail: [`docs/PHYSICS.md`](docs/PHYSICS.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPLOY.md`](docs/DEPLOY.md)
