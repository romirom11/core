<div align="right">
  <details>
    <summary >🌐 Language</summary>
    <div>
      <div align="center">
        <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=en">English</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=zh-CN">简体中文</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=zh-TW">繁體中文</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=ja">日本語</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=ko">한국어</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=hi">हिन्दी</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=th">ไทย</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=fr">Français</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=de">Deutsch</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=es">Español</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=it">Italiano</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=ru">Русский</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=pt">Português</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=nl">Nederlands</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=pl">Polski</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=ar">العربية</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=fa">فارسی</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=tr">Türkçe</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=vi">Tiếng Việt</a>
        | <a href="https://openaitx.github.io/view.html?user=RedPlanetHQ&project=core&lang=id">Bahasa Indonesia</a>
      </div>
    </div>
  </details>
</div>

<div align="center">
  <a href="https://getcore.me">
    <img width="140px" alt="CORE butler — attentive" src="docs/images/attentive.gif" />
  </a>


# Your Personal AI OS

Not a chatbot you open. An AI that is always on, always watching.
Name it. Shape it. Connect it to everything you use. Reach it however you work.
Open source, self-hosted, yours forever.

---

## About this fork

A fork of [RedPlanetHQ/core](https://github.com/RedPlanetHQ/core) that routes every
model family through a self-hosted [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
gateway, each over its own native protocol.

Upstream only lets OpenAI, Azure and Ollama point at a custom endpoint. Anything
`claude-*` or `gemini-*` fell through to Mastra's model router, whose
`"provider/model"` string carries no URL — so those calls reached Anthropic's and
Google's public APIs no matter what you configured. This fork adds
`ANTHROPIC_BASE_URL` and `GEMINI_BASE_URL`, and builds a real AI SDK client for
either provider when one is set.

Talking to each vendor natively (rather than flattening everything through an
OpenAI-compatible shim) preserves what the translation drops: Claude's extended
thinking, Gemini's thought signatures, cache control, tool-use semantics.

### Configuration

Every variable lives in the environment. **Do not enter keys through the settings
UI** — a workspace key overrides the environment (`resolveApiKeyForWorkspace`
checks BYOK first), and the provider rows have no base-URL field, so a URL typed
there is stored as an encrypted API key. See [Known gaps](#known-gaps).

One gateway, one key, three protocols. The suffixes differ because each SDK
appends its own path:

```bash
CHAT_PROVIDER=openai
MODEL=gpt-5.4

OPENAI_API_KEY=<gateway key>
OPENAI_BASE_URL=http://<gateway>:8317/v1        # + /chat/completions
OPENAI_API_MODE=chat_completions

ANTHROPIC_API_KEY=<same key>
ANTHROPIC_BASE_URL=http://<gateway>:8317/v1     # + /messages

GOOGLE_GENERATIVE_AI_API_KEY=<same key>
GEMINI_BASE_URL=http://<gateway>:8317/v1beta    # + /models/{model}:generateContent

EMBEDDINGS_PROVIDER=ollama
EMBEDDING_MODEL=bge-m3
EMBEDDING_MODEL_SIZE=1024
OLLAMA_URL=http://<ollama>:11434
```

Leave a `*_BASE_URL` blank and that provider goes straight to the vendor through
the router, exactly as upstream does.

### Model catalog

`apps/webapp/app/config/llm-models.json` lists the 29 chat models the gateway
serves, replacing upstream's three `gpt-5.x` ids — none of which exist on it. The
two `gpt-image-*` ids are omitted; they answer `503 only supported on
/v1/images/generations`.

Complexity tiers are assigned by name (opus/pro → high, sonnet/flash → medium,
haiku/mini/lite → low), not measured. `getModelForUseCase` picks a tier with
`findFirst` and no `orderBy`, so with eight models sharing the `high` tier the
choice is arbitrary — pin one per use case under **Settings → Workspace → Models**
if that matters.

Regenerate the list against your own gateway with `GET /v1/models`.

### Known gaps

**A model named only through `MODEL` survives one restart.** The seeder deprecates
any catalog row missing from `llm-models.json` (`ensureDefaultProviders`, the loop
over `existingModels`), and the check that would recreate it ignores
`isDeprecated`. Add the model to the JSON file, or lift the flag by hand:

```sql
UPDATE "LLMModel" SET "isDeprecated" = false WHERE "modelId" IN ('gpt-5.4', 'bge-m3');
```

**Base URLs are environment-only.** `BYOKRow` in `settings.workspace.models.tsx`
renders a single password field per provider, and `handleSave` submits only
`apiKey` — but the row's hint text is pulled from `PROVIDER_SPECS[...].baseUrl.hint`
and talks about proxy URLs. Type a URL there and it is encrypted and stored as
that provider's key, silently shadowing the environment.

Wiring the field up properly means making `getProviderConfig` async (it reads env
today), which cascades through `getModel` → `createAgent` → its eleven importers,
and needs an env fallback in the three places with no workspace in scope:
`generateButlerName`, the batch provider, and `search/rerank.ts`.

**A custom MCP is never a first-class tool.** The agent is handed three meta-tools
(`get_integrations`, `get_integration_actions`, `execute_integration_action`) and a
line of text naming each connected account. Ask "can you see my MCP?" and it looks
at its own toolset, does not find one by that name, and truthfully says no. Ask it
to *do* something and it delegates to the orchestrator, which reaches the server.

Two catalogs are easy to confuse: **Settings → MCP Sessions** lists clients that
connect *to* CORE. **Home → Integrations → Add Custom Integration** registers a
server CORE connects *to*. Only the second is what an agent can use.

`list_available_integrations` used to make this worse — it reads
`IntegrationDefinitionV2`, so a connected custom MCP returns `{count: 0}` and the
agent concluded the tool did not exist. Claude did this reliably; GPT and Gemini
happened to delegate first. The tool now returns a `scope` field explaining what it
covers, and the prompt says an empty catalog answers "can they connect this?", never
"do they have it?". Confirmed against a running instance: Claude now delegates
instead of reporting the server missing.

**A large MCP server may blow the action-selection prompt.** Before handing actions
to the agent, `getIntegrationActions` asks a separate `low`-tier model to pick the
relevant ones, and builds its prompt with every tool's full `inputSchema`. A
60-tool server (OneUptime) produces roughly 100k tokens. If that model returns an
empty array the code returns `[]` — the agent sees no actions, with no error.

**Anything else** — upstream's docs below still apply.

---

<p align="center">
    <a href="https://getcore.me">
        <img src="https://img.shields.io/badge/Website-getcore.me-c15e50?style=for-the-badge&logo=safari&logoColor=white" alt="Website" />
    </a>
    <a href="https://docs.getcore.me">
        <img src="https://img.shields.io/badge/Docs-docs.getcore.me-22C55E?style=for-the-badge&logo=readthedocs&logoColor=white" alt="Docs" />
    </a>
    <a href="https://discord.gg/YGUZcvDjUa">
        <img src="https://img.shields.io/badge/Discord-community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" />
    </a>
    <a href="https://github.com/RedPlanetHQ/core/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/License-AGPL%203.0-blue?style=for-the-badge" alt="License: AGPL 3.0" />
    </a>
    <a href="https://github.com/RedPlanetHQ/core/stargazers">
        <img src="https://img.shields.io/github/stars/RedPlanetHQ/core?style=for-the-badge&color=gold&logo=github" alt="GitHub Stars" />
    </a>
</p>
</div>

---

## See it work

Watch CORE take a plain-text task, gather context from GitHub and memory, plan the work, run a Claude Code session, and open a PR:

[![CORE Demo](https://img.youtube.com/vi/7y_kt_UTYQs/maxresdefault.jpg)](https://www.youtube.com/watch?v=7y_kt_UTYQs)

---

## Always watching. Always ready.

Most AI tools wait to be asked. CORE watches.

Connect it to your apps and it monitors activity across all of them. An email arrives from a client, a GitHub issue gets assigned, a Sentry alert fires, a meeting ends. CORE sees it, checks your memory and the skills you have set, and either handles it or surfaces it for your judgment. You do not trigger it. It notices on its own.

Install the CORE plugin in Claude Code, Codex, or Cursor and your agent conversations get watched too. Context discussed, decisions made, code written, all of it feeds the memory knowledge graph. The next task CORE picks up already knows what happened in your last session.

When it acts, it acts directly. It can reply to emails, update Linear issues, file GitHub PRs, send Slack messages, run terminal commands, drive a browser, and spawn a Claude Code or Codex session from any interface. Send a WhatsApp message from the airport and CORE can have a coding session running and a PR open before you board.

You decide where it acts on its own and where it waits for your call. Handle Sentry alerts automatically but always ask before merging. Approve a plan before a coding session starts. Require confirmation before any email goes out. The level of autonomy is yours to set, per task, per app, per action.

---

## Four ways to reach it

A chatbot has one interface. An OS has many.

**Voice.** Press Ctrl+Option on Mac and say what needs doing. CORE runs it in the background without breaking your flow.

**Scratchpad.** Open your daily page and write `[ ] Fix the auth bug from issue #47`. CORE picks it up within 3 minutes, loads context from your repo and memory, and drafts a plan.

**Messaging.** WhatsApp, Slack, Telegram. Send a task from the airport, from your phone, from bed. CORE has your full context regardless of where the message comes from.

**Chat.** Open the dashboard and talk directly, like any assistant. When you want a back-and-forth before delegating.

One AI, four surfaces, the same memory and context behind all of them.

---

## Make it yours

Give it a name. Choose how it speaks. Set the rules it follows everywhere.

Pick from five built-in personalities — TARS's dry efficiency, Alfred's loyal formality, Hudson's warm practicality — or write your own. The personality carries into every task it runs, every plan it drafts, every message it sends on your behalf.

Choose its voice for spoken interactions. From then on, it sounds and behaves like the AI you configured, across every interface.

---

## CORE in action

### Say it, come back to a PR.

*Press Ctrl+Option, speak:* "Fix the race condition in the checkout flow from issue #312."

CORE loads the issue, pulls related commits and Slack threads, drafts a plan, and runs a Claude Code session. You come back to a diff. You were never at your desk.

### Write it at night, review it in the morning.

*Scratchpad:* `[ ] Work through tonight's backlog starting at 11pm`

CORE pulls from Linear, GitHub, and memory, prioritizes, and works through it while you sleep. Smooth runs are waiting for your review. Stuck sessions come back with one tight question, not a stalled tab.

### Message it from anywhere.

*WhatsApp from the airport:* "Ship the auth refactor."

CORE already knows the branch, the context, and your preferences. It is running in Railway. It kicks off the session before you board.

### Investigate alerts before they become incidents.

*Sentry fires at 2am.* CORE investigates, pulls related traces and prior incidents from memory, proposes a fix, and pings you on Slack: "Issue #847, fix proposed, awaiting your review." You approve from your phone.

### Get a brief that already knows your week.

*Recurring task, every morning at 8am.* CORE pulls from email, GitHub, Linear, and Slack, surfaces what actually needs attention, skips what does not, and turns follow-ups into tasks automatically.

---

## What is inside CORE

| | |
|---|---|
| **Memory** | Temporal knowledge graph across every tool and conversation. Preferences, decisions, goals, and directives, so every task starts with context loaded. |
| **Tasks** | One-shot or recurring work units with your spec, CORE's plan, live state, and a dedicated chat thread. Each task can spawn coding, browser, or terminal sessions. |
| **Connectors** | 50+ apps through one MCP endpoint, plus webhook triggers for proactive automation. GitHub, Linear, Jira, Slack, Gmail, Calendar, Sentry, Notion, Todoist, and more. |
| **Skills** | Reusable instructions that fire automatically based on context. For example: "always pull related Linear issues before planning a fix," "run tests before opening a PR," or "post a Slack summary when a task completes." 100+ built-in, or write your own. |
| **Gateway** | Runs Claude Code, Codex, browser agents, and terminal commands on your machine or in Docker and Railway, so CORE keeps working when your laptop is closed. |
| **Model agnostic** | Bring your own provider: Anthropic, OpenAI, or open-weight models. Self-host the full stack for full isolation. |

---

## How CORE compares

| | CORE | OpenClaw | Hermes Agent | Devin / Copilot |
|---|:---:|:---:|:---:|:---:|
| Multiple interfaces (voice, scratchpad, chat, messaging) | ✅ | Partial | ❌ | ❌ |
| Persistent memory across tasks | ✅ | ❌ | ✅ | ❌ |
| Delegates to coding agents (Claude Code, Codex) | ✅ | ❌ | ❌ | ✅ |
| Structured task planning with human approval | ✅ | ❌ | ❌ | Partial |
| Custom name, personality, and voice | ✅ | ❌ | ❌ | ❌ |
| 50+ app connectors | ✅ | Partial | Partial | ❌ |
| Terminal and browser access via gateway | ✅ | ✅ | ✅ | ✅ |
| Human-in-loop by default | ✅ | ❌ | ❌ | ❌ |
| Open source and self-hostable | ✅ | ✅ | ✅ | ❌ |

---

## Quickstart

Open source and self-hosted. Your data stays in your infrastructure.

**Choose your path:**

| I want to... | How |
|---|---|
| Try it on my machine | Run the one-step install below (requires Docker) |
| Deploy on a server or VPS | One-click Railway deploy |
| Use the Mac app | [Join the waitlist](https://www.getcore.me/) |

**Install and start CORE:**

```bash
npm install -g @redplanethq/corebrain && corebrain setup
```

The setup wizard asks for an install directory, AI provider, API key, and chat model. It generates secrets, starts the stack, and opens `http://localhost:3033`.

Most local installs take a few minutes once Docker is running.

**Or deploy on Railway:**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/core)

**Connect a gateway** so CORE can run coding agents, drive your browser, and access local folders:

```bash
corebrain login
corebrain gateway setup
```

**Requirements:** Docker 20.10+, Docker Compose 2.20+, 4 vCPU / 8GB RAM

[Full self-hosting guide](https://docs.getcore.me/self-hosting/setup)

**Your first task (2 minutes after setup):**

1. Open the **Scratchpad** (your daily page at `http://localhost:3033`)
2. Type `[ ] Summarize my open GitHub issues` or any task you would normally do yourself
3. CORE picks it up within 3 minutes, gathers context from connected apps, and drafts a plan
4. Approve the plan and CORE runs it and brings back the result

[Connect your first app](https://docs.getcore.me/connectors)

---

## Docs

- [**Memory**](https://docs.getcore.me/memory/overview) - Temporal knowledge graph, fact classification, intent-driven retrieval
- [**Scratchpad**](https://docs.getcore.me/concepts/scratchpad) - The daily surface where tasks and ideas start
- [**Tasks**](https://docs.getcore.me/concepts/tasks) - Plans, state, recurring work, and task-scoped context
- [**Toolkit**](https://docs.getcore.me/concepts/toolkit) - 1000+ actions across 50+ apps via MCP
- [**CORE Agent**](https://docs.getcore.me/concepts/meta-agent) - Triggers, memory, tools, and execution
- [**Gateway**](https://docs.getcore.me/access-core/overview) - WhatsApp, Slack, Telegram, email, web, and API access
- [**Skills**](https://docs.getcore.me/skills/overview) - Reusable instructions for repeatable workflows
- [**Self-hosting**](https://docs.getcore.me/self-hosting/setup) - Full deployment guide
- [**Changelog**](https://docs.getcore.me/opensource/changelog) - What has shipped

---

## Benchmark

CORE achieves **88.24%** average accuracy on the [LoCoMo benchmark](https://github.com/RedPlanetHQ/core-benchmark) across single-hop, multi-hop, open-domain, and temporal reasoning. See the benchmark repo for full results and baseline comparisons.

---

## Security

- CASA Tier 2 Certified
- TLS 1.3 in transit
- AES-256 at rest
- Your data is never used for model training
- Self-host for full isolation
- [Security policy](SECURITY.md)
- Vulnerabilities: harshith@poozle.dev

---

## Community

We are building CORE in public.

We share the roadmap and architectural decisions openly because the hardest problems in building a personal OS are best solved with the people using it. Star the repo, self-host it, share what you build, and open issues for what is broken or missing.

- [Discord](https://discord.gg/YGUZcvDjUa) - questions, ideas, show-and-tell
- [Contributing docs](https://docs.getcore.me/opensource/contributing) - how to contribute to CORE
- [`good-first-issue`](https://github.com/RedPlanetHQ/core/labels/good-first-issue) - start here

<a href="https://github.com/RedPlanetHQ/core/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=RedPlanetHQ/core" />
</a>

---

<div align="center">

**Self-host your personal AI OS.**

[Star this repo](https://github.com/RedPlanetHQ/core) · [Read the docs](https://docs.getcore.me) · [Join Discord](https://discord.gg/YGUZcvDjUa)

</div>
