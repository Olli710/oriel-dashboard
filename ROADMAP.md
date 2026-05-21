# Roadmap

Reactive, not speculative — see [PRINCIPLES.md](PRINCIPLES.md) §5. What's listed here is either a known user-requested feature or a known internal gap. Things move from this list to GitHub issues when they're ready to ship; not every line item will get built.

## Up next — likely v4.5

Decided based on actual signal (user feedback, editor gaps, real friction):

- **Multi-step first-run stepper** — currently the Setup tab lists 8 personas directly. A 3-question modal that filters them would be friendlier for first-time users. Deferred from v4.4 to keep that ship focused.
- **A11 camera-first room views — editor surface** — the YAML config exists (`areas_options.<area>.camera_hero`), but no editor exposure yet. Pattern matches the per-area expansions added in v4.4.
- **Translation parity** — `de.json` has been keeping up with `en.json`, but the v4.4 strings (personas, hints, new editor tabs) added English-only fallbacks. Backfill the German translations.

## Worth considering — needs signal

Mid-priority. Build when a real user asks for it or when the maintenance benefit justifies the work.

- **Persona "switch in place" affordance** — if a user already applied "Quick start" and switches to "Energy enthusiast", we should diff the configs and show a "this will change X, Y, Z" preview before committing. Defends against accidental config loss.
- **Anomaly badge UI** — `src/utils/anomaly.ts` was shipped as a utility-only module and deleted as unused in v4.4 cleanup. Could revive with a real card / tile feature that surfaces "this entity is in an unusual state for this hour". Genuine work, low signal so far.
- **Per-user editor: full override field set** — the current PerUserTab surfaces 8 common boolean flags. Power users can still write arbitrary fields via YAML and we preserve them. A "show every flag" view would close that gap.
- **Drag-drop section reorder** — the per-mode editor uses up/down buttons. Drag-drop is nicer for >5 sections; the section-order tab already does drag-drop, the pattern could lift to `ModeOrderTab`.

## Long-tail / blue-sky — won't build without strong signal

These come up periodically but the work / impact ratio is bad:

- **AI dashboard assistant** — LLM that edits the strategy config via tool calls. Real value but ~2 weeks focused work, plus risky surfaces (hallucinated entity IDs, malformed configs). Wait for v4.x to have a real user base first.
- **Floorplan SVG visual editor** — full WYSIWYG editor on top of the floorplan-card config. The current YAML textarea is the pragmatic middle ground; a true visual editor is weeks of work for a niche feature.
- **3D / spatial floorplan** — would need user-supplied floorplan SVG + rendering of live entity overlays. The existing `floorplan-card` HACS plugin covers this; Oriel's `floorplan_view` config + emit is enough.
- **Public preset marketplace** — users sharing strategy configs. Real value once there's a real userbase; useless before.
- **WebGPU-accelerated charts** — for installs with millions of history points. Niche, and apexcharts-card already handles 99% of use cases via the section-card-registry.

## Out of scope — explicitly not doing

- **Backend HA service integration** — Oriel is frontend-only. Things like `strategy.flash_view` would need a Python integration component; that's a different project.
- **Backwards-compat layer for upstream simon42 identifiers** — clean break is intentional. Migration path is one YAML edit; see [MIGRATION.md](MIGRATION.md).
- **Hard dependency on any HACS plugin** — every feature must work in a clean fallback path (see [PRINCIPLES.md](PRINCIPLES.md) §2).

## How items get added

1. User reports a real friction (issue on this repo, comment on upstream simon42 that surfaces a pattern, direct feedback)
2. Or an internal editor gap shows up (a YAML-only feature, a hardcoded value that should be configurable)
3. The maintainer decides it's worth building → moves to a tracked GitHub issue with an estimate

Speculative items that look interesting but have no signal don't graduate. The principle is reactive, not aspirational.
