# VAST reference

Copied from [vast-data/vast-builders-challenge](https://github.com/vast-data/vast-builders-challenge) at commit `a770d20` (17 Oct 2026), the organizers' repo for the challenge. Upstream may move during the day; to refresh, re-copy from a newer commit.

- `BEFORE_YOU_BUILD.md` and `BUILD_DAY.md` (upstream `README.md`): the event guides, with their images in `images/`.
- `INFRA_ONBOARDING.md`: upstream's infra onboarding PDF as text, the one PDF without a Markdown twin.
- `ARCHITECTURE_REFERENCE.md`: models, DataEngine pipeline, indexed video corpus.
- `SKILLS.md`: index of the skills; `INGEST.md`, `RETRIEVAL.md`, `VAST_DATABASE.md` and `GPU_MODELS.md` are upstream's per-group skill READMEs.
- `config.example`: the stack's environment variables, placeholders only.

The skills live in `.claude/skills/`, flattened from upstream's `.cursor/skills/<group>/<skill>/` to one folder per skill named after its frontmatter `name`, with links and cross-references rewritten to match; Cursor loads `.claude/skills/` too. The ground rules are `.cursor/rules/vast-builders.mdc`, symlinked as `.claude/rules/vast-builders.md`. Upstream's `deployment/` skills (redeploying the VSS stack on Kubernetes) and `build-day-quickstart` (the VM tour) were left out: ProofBox deploys to Cloudflare, and the stack is not ours to redeploy.

`.claude/skills/` and `docs/vast/` are excluded from `vp fmt` so a re-copy diffs cleanly against upstream.
