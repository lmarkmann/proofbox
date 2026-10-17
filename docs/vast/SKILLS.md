# VSS2 Skills

Agent skills for working with the VSS2 video search stack. Each skill lives in its own folder under `.claude/skills/` with a `SKILL.md` that has full usage instructions - open that file when you need details. Claude Code and Cursor both load them from there.

## Layout

```
.claude/skills/
├── ask-cosmos/             # Prepare a help note for the Cosmos community
├── gpu-model-*/            # Health + smoke-test model endpoints
├── ingest-*/               # Upload new video or re-ingest indexed archive
├── retrieval-*/            # Query and explore indexed video
└── vast-database-vastdb-*/ # Raw VastDB SDK read/write (not the JWT API)
```

Runtime configuration is mounted outside the repo at absolute `/config/`:

- `/config/<team>.config` — team credentials and GPU bearer
- `/config/team-<num>-k8s.yaml` — Kubernetes access (e.g. `/config/team-1-k8s.yaml`)
- `/config/backend-secret.yaml` — retrieval backend secret (and `/config/vss-cli-secret.yaml` when aligning ingest keys)

Skills must not search the repo's `team-configs/`.

## Ingest

**Re-ingest** for content already in the team archive (hackathon default). **Upload**
when adding a new local video via the backend (`POST /api/v1/videos/upload`).

| Skill | Summary |
|-------|---------|
| [upload-video](../../.claude/skills/ingest-upload-video/SKILL.md) | Multipart upload of a new video via backend upload API |
| [reingest-videos](../../.claude/skills/ingest-reingest-videos/SKILL.md) | Re-ingest a selected indexed video/stream via dashboard API |
| [reingest-chunk](../../.claude/skills/ingest-reingest-chunk/SKILL.md) | Re-ingest one specific Explore card / chunk |

→ [ingest overview](INGEST.md)

## Retrieval

Query the indexed archive through the backend API (`/api/v1`). Most routes need a JWT — start with **login**.

| Skill | Summary |
|-------|---------|
| [login](../../.claude/skills/retrieval-login/SKILL.md) | Authenticate and obtain a bearer token |
| [search](../../.claude/skills/retrieval-search/SKILL.md) | Semantic/hybrid search over the archive |
| [list-metadata](../../.claude/skills/retrieval-list-metadata/SKILL.md) | Discover filterable fields and values |
| [dashboard](../../.claude/skills/retrieval-dashboard/SKILL.md) | Aggregate stats and ingest health |
| [suggest-prompts](../../.claude/skills/retrieval-suggest-prompts/SKILL.md) | AI-generated search prompt suggestions |
| [videos](../../.claude/skills/retrieval-videos/SKILL.md) | Browse, play back, and summarize a video |
| [agent-qa](../../.claude/skills/retrieval-agent-qa/SKILL.md) | Natural-language Q&A over the archive |

→ [retrieval overview](RETRIEVAL.md)

## Vast Database

Raw SDK access to the team’s VastDB bucket (bypasses the JWT API).

| Skill | Summary |
|-------|---------|
| [vastdb-read](../../.claude/skills/vast-database-vastdb-read/SKILL.md) | Raw VastDB catalog + select (data VIP / optional QE) |
| [vastdb-write](../../.claude/skills/vast-database-vastdb-write/SKILL.md) | Create schemas/tables + insert (data VIP only) |

→ [vast-database overview](VAST_DATABASE.md)

## GPU models

Shared endpoint addresses are documented in [gpu/README.md](GPU_MODELS.md); authentication comes from `/config/<team>.config`.

| Skill | Summary |
|-------|---------|
| [gpu README](GPU_MODELS.md) | What each model does + curl examples (Cosmos3-Reason, YOLO, Embed1, Canary) |
| [model-health](../../.claude/skills/gpu-model-health/SKILL.md) | Liveness/readiness for all four |
| [model-smoke-test](../../.claude/skills/gpu-model-smoke-test/SKILL.md) | Minimal real inference per model |

## Typical flows

**Upload a new file** → `login` → `upload-video` → `dashboard` / `videos`

**Re-ingest** → `login` → `reingest-videos` (or `reingest-chunk`) → `dashboard`

**Search** → `login` → `list-metadata` (optional) → `search` or `agent-qa`

**Watch a result** → `login` → `videos`

**VastDB custom tables** -> `vast-database-vastdb-write` (create/insert on data VIP) -> `vast-database-vastdb-read` (select)
