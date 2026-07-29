<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png" />
  <img alt="open·kritt" src="docs/images/logo-light.png" width="96" height="96" />
</picture>

# open·kritt

**Orchestrate AI agents to find real vulnerabilities in code.**

An open-source, self-hosted security research platform that turns focused AI analysis
into de-duplicated, ranked findings with configurable validation and enrichment.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Kritt-ai/open-kritt?sort=semver)](https://github.com/Kritt-ai/open-kritt/releases)

[Website](https://kritt.ai) ·
[Documentation](https://docs.kritt.ai) ·
[Getting started](https://docs.kritt.ai/getting-started/installation-and-setup) ·
[Contributing](CONTRIBUTING.md) ·
[Research paper](https://kritt.ai/open-kritt-launch) ·
[Discord community](https://t.co/WzXMUKWxcR) ·
[Twitter](https://x.com/Kritt_AI)

</div>

![open·kritt workflow builder](assets/workflow_screen.png)

## What is open·kritt?

Pointing a model at an entire repository and asking it to find vulnerabilities rarely
works well. open·kritt takes a focused approach: break the research into small,
well-defined tasks, run them across AI agents in parallel, and combine their output into
findings you can validate and prioritize.

It is built for security researchers and security-minded developers who want control
over their prompts, workflows, model providers, and infrastructure.

### What it does

- **Build workflows** — chain focused prompts into reusable security research playbooks.
- **Run scans** — analyze remote or local repositories and their dependencies with Codex
  or Claude Code.
- **Verify findings** — use post-scripts to validate issues, build proofs of concept, and
  produce reports.
- **Prioritize results** — apply custom severity rankers, a consistent finding schema,
  and automatic de-duplication.
- **Bring your own model access** — use a Codex login or connect through OpenAI,
  Anthropic, or OpenRouter.

> **Built from real security research.** The Kritt team has earned over **$1,500,000 in
> bug-bounty payouts** under the researcher name **Blockian**
> ([Immunefi](https://immunefi.com/profile/Blockian/) ·
> [HackenProof](https://hackenproof.com/hackers/Blockian) ·
> [blockian.xyz](https://blockian.xyz) · [@Kritt_AI](https://x.com/Kritt_AI)).
> open·kritt is the open-source distillation of the internal project behind that work.

## Getting started

You need Git, Docker with Docker Compose, and Node.js 20 or newer. The repository-local
CLI has no install step.

```bash
git clone https://github.com/Kritt-ai/open-kritt
cd open-kritt
./kritt setup
./kritt start
```

Open [http://localhost:5173](http://localhost:5173) once the stack is running. You only
need one model-access option; `./kritt setup` guides you through the available logins and
API keys. A `GITHUB_TOKEN` is optional and only needed for private GitHub repositories.

The default ports bind to `127.0.0.1`, and the backend does not include application
authentication. Keep the stack private.

Tool-enabled agents run as root inside disposable job containers, with writable repository
copies and direct internet access so they can install tools, compile targets, run tests,
and build proofs of concept. Run open·kritt on a dedicated Docker host or VM; see the
[threat model](docs/threat-model.md) before scanning untrusted code.

For prerequisites, manual Docker setup, and provider-specific instructions, read the
[installation guide](docs-site/getting-started/installation-and-setup.mdx) and
[AI provider setup](docs-site/ai-provider-setup/overview.mdx).

### Deployment profiles

Use one of the Docker-only deployment overrides when preparing an assessment
installation:

- **Online:** `docker compose -f docker-compose.yml -f docker-compose.online.yml up --build`
  keeps the application network private while the engine has a separate egress network.
- **Air-gapped:** `docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build`
  attaches every service only to an internal Docker network and enforces the `airgap`
  deployment mode in the assessment API. Import required images, models, and tool packs
  before starting it; cloud-provider logins, provider/catalog APIs, generation requests,
  scan launches, and automatic model/catalog refresh are disabled in this topology until
  a separately configured local model provider is available.

An internal OpenAI-compatible provider can be recorded for operator status using
`OPEN_KRITT_LOCAL_MODEL_ENDPOINT` and `OPEN_KRITT_LOCAL_MODEL_ID`. The endpoint must be an
internal Docker service hostname such as `http://local-llm:8000/v1`, never `localhost`. The
status is available at `/api/airgap/status`; target execution remains disabled pending the
separate local-provider runner phase.

### Existing Ollama container

Set `OPEN_KRITT_LOCAL_MODEL_PROVIDER=ollama` and `OPEN_KRITT_LOCAL_MODEL_ID` to use an existing
Ollama container. The default endpoint is `http://ollama:11434`; use
`OPEN_KRITT_LOCAL_MODEL_ENDPOINT` when the container has another DNS name. Attach the existing
container to the resolved internal network before starting open·kritt (for the default project
name, `docker network connect open-kritt_airgap-internal ollama`). Do not use a host-loopback
endpoint: each service container has a different `localhost`.

Confirm that the internal container is reachable and the configured model has already been pulled
without enabling scans by requesting `/api/airgap/status?probe=1`. Ollama is queried only through
its internal `/api/tags` endpoint; no prompt, model content, or credentials are sent.

Before moving an air-gapped installation, create and verify a local Docker image bundle:

```bash
node scripts/offline-bundle.mjs export --output ./open-kritt-bundle --images open-kritt-engine:local
node scripts/offline-bundle.mjs import --input ./open-kritt-bundle --verify-only
```

Use `--private-key` while exporting and `--public-key --require-signature` while importing to require an Ed25519-signed manifest. The importer verifies every artifact digest before loading images.

To export every image referenced by the resolved air-gap Compose profile instead of maintaining a manual list, use:

```bash
./kritt bundle export --output ./open-kritt-bundle --compose-airgap
```

After a verified import, register the immutable manifest digest in the local backend audit inventory (the default backend port is shown below):

```bash
./kritt bundle import --input ./open-kritt-bundle --require-signature --public-key ./bundle-public.pem \
  --register-url http://127.0.0.1:3002/api/offline-bundles/imports --actor "air-gap operator"
```

Before starting the isolated stack, verify the resolved Compose policy. This checks that every service is attached only to the internal air-gap network and that automatic engine updates are disabled:

```bash
./kritt airgap verify
```

## Documentation

Preview the documentation locally with Mint:

```bash
npm install -g mint
cd docs-site
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the site.

- [Product overview](docs-site/getting-started/welcome.mdx)
- [Run your first scan](docs-site/first-scan/workflow.mdx)
- [Workflows and prompt steps](docs-site/workflows/steps.mdx)
- [Security and threat model](docs/threat-model.md)

## Community and contributing

Questions and ideas belong in [GitHub Discussions](https://github.com/Kritt-ai/open-kritt/discussions).
Use [GitHub Issues](https://github.com/Kritt-ai/open-kritt/issues) for bugs and feature
requests.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development
setup, test commands, Conventional Commits, and DCO sign-off requirements.

Please report security vulnerabilities privately by following [SECURITY.md](SECURITY.md), not through a public issue.

## License

open·kritt is licensed under the [GNU Affero General Public License v3.0](LICENSE).
