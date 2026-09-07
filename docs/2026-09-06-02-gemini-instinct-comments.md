ONE-PAGE OVERVIEW: Project Sovereign
The Problem
Closed-source AI assistants like Instinct demand the keys to users' entire digital lives—emails, Slack channels, GitHub repos, and calendars—processing them on centralized servers to build VC-owned data moats. For developers, executives, and privacy-conscious users, this is a massive security risk and an unacceptable trade-off for convenience.

The Solution
Sovereign is a 1-click, self-hosted AI assistant. It provides the seamless, conversational UX of an SMS/text-based agent, but runs entirely on your own infrastructure (a local machine, a Raspberry Pi, or a private VPS). Your API keys, authentication tokens, and personal data never leave your secure environment.

Core Value Proposition

Zero-Trust Architecture: Credentials (OAuth, API keys) are stored in a local encrypted vault, not a startup’s database.

Model Agnostic: Plug in local, uncensored models via Ollama, or route to Claude/OpenAI using your own API keys.

Zero-Friction UX: Interact via Telegram, Signal, or a clean local web dashboard—no clunky terminal required.

The Technology Stack (Built for Speed & Open Source)
To move fast, you cannot build integrations from scratch. You must leverage the current open-source meta.

Backend & Orchestration: Python (FastAPI). Python is mandatory because the entire AI/Agent ecosystem is built on it. It’s fast to write and easy to integrate with existing AI libraries.

The AI Router: LiteLLM. This allows the user to easily toggle between using local models (like Llama 3) or external APIs (Anthropic, OpenAI) with a single line of code.

The Integration Engine: Model Context Protocol (MCP). This is your secret weapon. Recently released by Anthropic, MCP is an open standard that connects AI to data sources. Instead of writing custom API wrappers for Slack, GitHub, and Google Drive, you just plug in existing open-source MCP servers.

Database & State: SQLite + Local Encrypted Vault. Keep it lightweight. No massive database setups required. State lives in a single local file.

User Interface: Next.js (React) for a sleek local dashboard, integrated with the Telegram API or Signal API for the mobile texting experience (SMS via Twilio is too complex for a 1-click self-host MVP; Telegram/Signal is secure, free, and developer-friendly).

Deployment: Docker Compose. The user types docker-compose up and the whole stack (database, agent, UI, integrations) boots up instantly.

Who Should Code It? (The Execution Plan)
Phase 1: The Weekend MVP (You + AI)
Do not hire a team yet. With the current state of AI coding tools, you can build the core architecture yourself in a week.

Use Cursor (the AI code editor) combined with Claude 3.5 Sonnet.

Focus only on getting a Python backend to read a Telegram message, pass it to a local LLM, use one tool (e.g., read a local file or check a dummy calendar), and text back.

Phase 2: The Founding OSS Core (2-3 People)
Once the MVP is on GitHub, you need a lean, brutal execution team:

The Agent Hacker (Backend/Python): Someone obsessed with AI agents, prompt engineering, and the Model Context Protocol. They build the brain and the integrations.

The Interface/DevOps Hacker (Fullstack/Docker): Someone who can make the Next.js dashboard look like a $2B startup, and package the whole thing into a flawless, bug-free Docker container so non-technical users can install it easily.