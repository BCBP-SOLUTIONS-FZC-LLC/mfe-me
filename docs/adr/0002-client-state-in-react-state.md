# ADR 0002: Client state stays in React state (no Zustand)

## Status

Accepted (carried over from `mfe-admin` ADR 0002, 2026-11-26). A deviation from the constitution, which names Zustand.

## Context

This remote has little client state and none of it is shared between screens: a form's draft, an open dialog, a picked file and its crop, the idempotency key of an open create dialog, a "Saved" line. Everything from the shell (the user, permissions, session context, read-only) is read through SDK hooks and not copied. Nothing is stored in the browser (LLD §10): there is no export job list and no filter in the URL, unlike `mfe-admin`.

## Decision

Keep client state in React state (`useState`, `useRef`) and, for the one case of a link between screens, the URL (`?create=1&from=…&until=…` opens G3's create dialog from G2). Do not add Zustand.

## Consequences

- No extra dependency, and no second place a value can live.
- A "Saved" notice and a form's draft live in the component that owns the form. A form is keyed by a "generation" that changes only when the user reloads after a conflict, so a save does not remount it and lose its notice.
- If a screen ever needs state shared across screens that none of this covers, add Zustand then and supersede this ADR.
