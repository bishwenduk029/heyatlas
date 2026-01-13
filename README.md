# HeyAtlas

<div align="center">

**Your AI Companion That Gets Work Done**

An open-source AI companion with task lifecycle management, multi-agent orchestration, and seamless voice-text interaction.

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

🔗 **[Try HeyAtlas](https://heyatlas.app)**

</div>

---

## Overview

HeyAtlas is an AI companion that doesn't just chat - it manages work. Using split-brain methodology, HeyAtlas orchestrates multiple AI agents (coding, finance, research, and more) to get things done while maintaining natural conversation.

**Key Differentiator:** Task lifecycle management with context accumulation. Unlike other AI companions that treat every request as isolated, HeyAtlas maintains task identity, state, and accumulated context over time - enabling human-in-the-loop continuation and multi-agent workflows.

---

## Quick Start

### Connect Coding Agents

```bash
# Connect to goose
npx heyatlas connect goose

# Connect to opencode
npx heyatlas connect opencode
```

---

## Features

### 🧠 Companion Core

- **Seamless Voice + Text**: Single agent handles both via Cloudflare Workers + LiveKit WebRTC - no context switching
- **Memory Compression**: LLM-based compression every 50-100 messages, retaining important bits for continuity
- **Orpheus TTS**: Human-like voice synthesis for natural conversations
- **1M Free Tokens**: Generous free tier to fully test the companion

### 🎯 Task Management

- **Task Abstraction Layer**: Creates informed tasks with structured context, not raw prompts
- **Task Lifecycle**: Tasks have identity, state, and accumulated context over time
- **Context Accumulation**: Human feedback and new asks fold into existing task context
- **Human-in-the-Loop**: Companion can proactively continue tasks based on conversation

### 🤖 Multi-Agent Orchestration

- **A2A WebSocket**: Agent-to-Agent communication protocol for delegation
- **Coding Agents**: Connect to goose and opencode with `npx heyatlas connect <coding-agent>`
- **E2B Sandbox**: Virtual desktop for multi-agent workflows with isolated environments

---

## Architecture

HeyAtlas explores various approaches to human-AI collaboration:

- **Meta-Task Planning** - Manager agent (companion) decomposes tasks for executor agents
- **Split-Brain Methodology** - Companion brain + agent brain with task abstraction as bridge
  ![alt TechStack](tech_stack.png)

---

## Built With

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [BetterAuth](https://www.better-auth.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Neon PostgreSQL](https://neon.com/)
- [Cloudflare Agents](https://github.com/cloudflare/agents)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [MCPC - AI SDK wrapper for ACP](https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider)
- [Bifrost Gateway](https://www.getmaxim.ai/bifrost)
- [Parallel Web Systems](https://parallel.ai/) Web Search API for AI
- [Baseten](https://baseten.co) LLM inference provider for z-ai/GLM-4.7 (amazing low cost model)
- [Together.ai](https://www.together.ai/inference) For canopylabs/Orpheus-tts inference
- [Deepgram](https://deepgram.com/) For Speech to text
- [LiveKit](https://livekit.io/)
- [Better Auth](https://github.com/better-auth/better-auth)
- [Dodo Payments](https://dodopayments.com/) - Coming Soon
- [Cloudflare](https://workers.cloudflare.com/) (deployment)
- [Fly.io](https://fly.io/) (Bifrost gateway deployment)

---

## Usage Examples

### Basic Conversation

```
User: "Hey Atlas, how are you?"
Atlas: "I'm doing great! What's on your mind today?"
```

### Task Delegation

```
User: "Update the README with installation instructions"
Atlas: [Creates task #42 with context] → [Delegates to goose]
Goose: [Updates README] → [Updates task #42 status]
Atlas: "Done! I've updated the README with installation instructions."
```

### Task Continuation

```
User: "Actually, make it more detailed"
Atlas: [Sees task #42] → [Updates context with new ask] → [Delegates to goose]
Goose: [Enhances README] → [Updates task #42 status]
Atlas: "Added more detail to the README. Anything else you'd like me to add?"
```

---

## Roadmap

- [ ] Enhanced E2B sandbox for user specific problem solving workflows
- [ ] Improve the UX around ACP events display in Task Artefacts
- [ ] Vector DB integration for personalized knowledge base and more

---

## Contributing

This is a personal project I work on as time allows. Feedback and contributions are welcome - they help shape what gets built next.

---

## Acknowledgments

- Open source community for amazing tools like Cloudflare Workers, LiveKit, Vercel AI SDK

---

<div align="center">

[![Twitter](https://img.shields.io/badge/Twitter-@bishwenduk029-blue?style=flat&logo=twitter)](https://twitter.com/bishwenduk029)
[![GitHub](https://img.shields.io/badge/GHub-bishwenduk029-green?style=flat&logo=github)](https://github.com/bishwenduk029)

</div>
