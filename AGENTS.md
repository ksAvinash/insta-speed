# AGENTS.md

Agent instructions for this repository live in **[CLAUDE.md](CLAUDE.md)**.

It is tool-agnostic despite the filename and covers the project layout, the
coordinate and unit conventions, the determinism requirements of the physics
loop, and a list of already-fixed bugs that are easy to reintroduce. Read it
before editing `src/physics/` or `src/render/Chase.js`.

Deeper references live in [`docs/`](docs/):

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, data flow, render pipeline, state machine |
| [docs/PHYSICS.md](docs/PHYSICS.md) | The vehicle model, force by force, and what is tuned vs. derived |
| [docs/ADDING_CONTENT.md](docs/ADDING_CONTENT.md) | Authoring new vehicles and scenes |
| [docs/PLAN.md](docs/PLAN.md) | The original approved build plan |
| [docs/DEVLOG.md](docs/DEVLOG.md) | Bugs found during the build and how they were diagnosed |
