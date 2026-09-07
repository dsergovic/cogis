# 🧠 Cogis

> **Your Sovereign Cognitive Engine.**  
> An open-source, private-first alternative to centralized AI assistants.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

## 🚨 The Problem
Closed-source AI assistants demand the keys to your entire digital life—emails, Slack channels, GitHub repos, and calendars. They process your most sensitive data on centralized servers to build data moats for VC-funded startups. For developers, executives, and privacy-conscious users, this is a massive security risk and an unacceptable trade-off for convenience.

## 💡 The Solution: Cogis
Cogis gives you a 24/7 personal assistant accessible via Telegram, Signal, or Web—without handing your credentials to a third party. It flips the model: execution stays on your hardware, under your control.

### ✨ Core Features
- 🔒 **Zero-Trust & Local First:** Credentials (OAuth, API keys) and data never leave your server. Stored in a local encrypted SQLite vault.
- ⚡ **1-Click Docker Setup:** Spin up the full agent stack in under 2 minutes.
- 🔌 **MCP Native:** Powered by the Model Context Protocol (MCP) for seamless, open-standard integrations with Slack, GitHub, Google Workspace, and local files.
- 🔀 **Model Agnostic:** Route to local, uncensored models via Ollama, or securely proxy to Claude/OpenAI using your own API keys via LiteLLM.
- 📱 **Omnichannel UX:** Interact via a sleek local Next.js dashboard, or securely text your agent via Telegram/Signal.

---

## 🏗️ Architecture Stack
- **Backend/Orchestration:** Python (FastAPI)
- **AI Routing:** LiteLLM (Any LLM, Any Provider)
- **Integration Layer:** Model Context Protocol (MCP)
- **Database:** SQLite + Local Encrypted Vault
- **Interface:** Next.js (React) + Telegram/Signal Webhooks
- **Deployment:** Docker & Docker Compose

---

## 🚀 Quickstart

Get your sovereign agent running in less than 2 minutes.

```bash
# 1. Clone the repository
git clone https://github.com/your-handle/cogis.git
cd cogis

# 2. Set up your environment variables
cp .env.example .env

# 3. Add your preferred Model API key (or leave blank to use local Ollama)
# Edit .env and set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_HOST

# 4. Spin up the stack
docker-compose up -d
```
Access your local dashboard at `http://localhost:3000`.

---

## 🛠️ Configuration (.env)
Cogis relies on a simple `.env` file for core configuration. 

```env
# AI Model Routing (LiteLLM)
DEFAULT_MODEL=claude-3-5-sonnet-20240620
ANTHROPIC_API_KEY=your_key_here
# OLLAMA_BASE_URL=http://localhost:11434

# Security / Vault
VAULT_ENCRYPTION_KEY=generate_a_secure_random_string

# Messaging Integrations (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_token
```

---

## 🗺️ Roadmap
- [ ] Phase 1: Core CLI & LiteLLM Routing MVP
- [ ] Phase 2: Telegram Bot Integration & SQLite Vault
- [ ] Phase 3: MCP Server integrations (GitHub, Local Filesystem)
- [ ] Phase 4: Next.js Local Web Dashboard
- [ ] Phase 5: Autonomous background cron tasks

---

## 🤝 Contributing
Cogis is built by and for the privacy-first developer community. If you are tired of centralized AI monopolies, join us.
Check out [CONTRIBUTING.md](CONTRIBUTING.md) to get started. We need:
- MCP Server builders
- Docker optimization wizards
- Next.js UI/UX designers

## 📜 License
MIT License. See `LICENSE` for more information.
