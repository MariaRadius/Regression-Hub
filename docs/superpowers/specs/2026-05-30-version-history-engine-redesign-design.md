# Version-History Engine Redesign — Releases × Environments

> **⚠️ DEPRECATED — no longer authoritative.**
>
> This document has been **superseded by [`2026-05-31-version-release-env-minimal-spec.md`](./2026-05-31-version-release-env-minimal-spec.md)**, which is now the single source of truth for the Releases × Environments refactor (RXR-11849).
>
> Do not treat anything in this file as a decision. In particular, the later document **reverses** two choices made here:
> - **Results are dense**, not sparse (one row per case × environment, default Pending).
> - **The audit log is a full activity log** (renamed from `resultEvents`), not result/assignment-only.
>
> This file is kept for historical background only and may be removed.
