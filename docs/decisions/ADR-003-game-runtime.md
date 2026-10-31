# ADR-003: Data-Driven, Server-Authoritative Game Runtime

**Status:** Accepted, 2026-10-31. The mobile bridge is unproven until Stage 4.

## Context

The spec lists 45 mini-games and forbids building each as a separate application. It also forbids arbitrary JavaScript from CMS content and client-authoritative rewards.

## Decision

1. **Templates, not games.** About 10 templates (matching, sorting, sequencing, spelling, multiple choice, and so on) implement the plugin contract. A catalogue game is a validated JSON configuration plus bound content, so authors can create games in the builder without developers.
2. **Phaser 3.90** for 2D, on the pin in ADR-004. Phaser 4 exists, but the spec names Phaser 3. Moving is a separate decision.
3. **Three.js** only for selected 3D experiences, always with a 2D fallback.
4. **The server scores.** Clients send an ordered action log. The API replays it through the same pure scoring functions from a shared package, and only that result can trigger rewards.
5. **Sandboxed SDK.** Game code receives a narrow SDK, never tokens or API access.
6. **Mobile embeds the web runtime** in a WebView with a typed message bridge, because Phaser requires a browser canvas.

## Consequences

- Scoring logic must stay pure and deterministic to run on both sides. Randomness comes from a server-issued seed.
- Offline play works by replaying the queued event log on reconnection.
- WebView performance on low-end Android devices is a real risk, and it is the first thing to prove in Stage 4.
