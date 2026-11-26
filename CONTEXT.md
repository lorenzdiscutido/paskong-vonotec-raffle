# Skyscraper Rappelling Race — Project Context

## Domain Vocabulary
- **Name Picker Only:** Selects winning rappellers from the party roster without tracking or announcing prizes.
- **Rappellers:** Active participants racing up ropes along the outside of a 100-story skyscraper (`ROOFTOP_FLOOR = 100`).
- **Live Skyscraper Race ([raceEngine.ts](src/utils/raceEngine.ts) & [SummitRaceCanvas.tsx](src/components/SummitRaceCanvas.tsx)):** Every active rappeller climbs simultaneously with variable velocity segments (`boost` surges, `slip` drops, `gust` slowdowns), fair time-governed pacing (`raceDurationSeconds`, `5s–120s`), uniform floor-based pack tension, and photo-finish above `90F`.
- **Bulk Entry & Crowd Scalability:** [ManageModal.tsx](src/components/ManageModal.tsx) opens directly on a bulk-paste box + CSV uploader (`100s+` guests) with a paginated roster table; [SummitRaceCanvas.tsx](src/components/SummitRaceCanvas.tsx) draws full name pills for leaders/eventful rappellers and canvas-rendered elevation tracker dots so 100–500+ attendees run at 60 FPS.
- **Dual-Screen Sync (`?view=projector` & `?view=controller`):** Synchronized via `BroadcastChannel` ([syncChannel.ts](src/utils/syncChannel.ts)) and `localStorage` ([storage.ts](src/utils/storage.ts)).
- **Absent Mark & Instant Re-Race:** Marks a winning rappeller `absent` (keeping them out of the active pool) and optionally starts an immediate 1-winner replacement race.

## Architecture & Key Seams
- [src/types/raffle.ts](src/types/raffle.ts): Core domain models (`Participant`, `PullResult`, `RaffleSettings`, `WishStage`).
- [src/utils/raceEngine.ts](src/utils/raceEngine.ts): Pure live rappelling simulation (`createRaceSimulation`, `stepRaceSimulation`, `fastForwardRace`, `getRaceLeaderboard`).
- [src/utils/rng.ts](src/utils/rng.ts): Cryptographic `secureRandom` and `createId`.
- [src/utils/csv.ts](src/utils/csv.ts): Participant CSV import/deduplication (`parseParticipantsCsv`, `mergeImportedParticipants`) and winner CSV export.
- [src/utils/storage.ts](src/utils/storage.ts): Quota-safe `localStorage` helpers.
- [src/utils/syncChannel.ts](src/utils/syncChannel.ts): Cross-window `BroadcastChannel` typed messaging.
- [src/utils/soundEngine.ts](src/utils/soundEngine.ts): Procedural Web Audio synthesizer synced to countdown, surges/slips, photo finish, and rooftop victory.
- [src/components/SummitRaceCanvas.tsx](src/components/SummitRaceCanvas.tsx): 100-story illuminated skyscraper facade renderer, articulated rappellers, pre-allocated snow/spark pools, and throttled live HUD.
- [src/components/SplashRevealOverlay.tsx](src/components/SplashRevealOverlay.tsx) & [src/components/AnimatedWinterBackdrop.tsx](src/components/AnimatedWinterBackdrop.tsx): Rooftop Winner spotlight & multi-winner finish podium.
- [src/components/ManageModal.tsx](src/components/ManageModal.tsx): Rappeller bulk-paste/CSV manager, winners log, and race settings.
