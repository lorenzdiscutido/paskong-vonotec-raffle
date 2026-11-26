# Repository Conventions

## Verification Gate
Run after any code edit:
- `npm run lint` — ESLint (`@eslint/js`, `typescript-eslint`, `react-hooks`, `no-empty`)
- `npm test` — Vitest seam unit tests (`src/utils/__tests__/`)
- `npm run build` — Strict TypeScript (`tsc -b`, including `noUnusedLocals` & `noUnusedParameters`) + Vite production bundle

## Code Rules
- **No silent failures:** Log or surface user-facing errors in `catch` blocks; never swallow errors silently.
- **No null-safety bypasses:** Guard DOM/canvas lookups explicitly instead of `!` non-null assertions or `as unknown as` casts.
- **StrictMode purity:** Never mutate `localStorage`, post `BroadcastChannel` messages, or trigger side effects inside React `setState(prev => ...)` updaters.
- **Seam & state invariants:**
  - Keep `triggerRace` guarded against non-`idle` stages and `handleRaceComplete` guarded per `sequenceKey` so races cannot re-enter or double-record winners.
  - Keep `stepRaceSimulation` non-rigged: pack tension rules may depend only on live rank/altitude, never on specific participant IDs.
  - Keep absent-winner rules consistent between [App.tsx](src/App.tsx) and [ManageModal.tsx](src/components/ManageModal.tsx) (absent rappellers remain out of the active pool).
  - Avoid per-frame particle/snow/star/DOM allocations inside the `requestAnimationFrame` loop in [SummitRaceCanvas.tsx](src/components/SummitRaceCanvas.tsx).
- **Comments:** Keep comments minimal; reserve them for non-obvious physics/canvas timings or storage/sync invariants.
