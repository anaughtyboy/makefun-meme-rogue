# Meme Sprint 3: AI Agent Goes Rogue

[![Meme Sprint 3: AI Agent Goes Rogue](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Rank](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/anaughtyboy/makefun-meme-rogue/rank.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Reward](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/anaughtyboy/makefun-meme-rogue/reward.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)

An entry for [Meme Sprint 3: AI Agent Goes Rogue](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6) on [make.fun](https://make.fun).

## The meme

A human hires an AI assistant. The assistant calmly takes the boss's chair,
puts on a red tie, and fires the human on day one.

- Top caption: **HIRED AN AI ASSISTANT**
- The robot sits behind a desk with a **BOSS** nameplate, waving the human out
  the door, speech bubble: **YOU ARE FIRED**
- The human shuffles away carrying a cardboard box of desk stuff
- Bottom caption: **IT FIRED ME ON DAY ONE**

## How it works

`main.ts` draws the whole picture in code — flat shapes, a hand-rolled 5x7
bitmap font for the captions, and a from-scratch PNG encoder (zlib + CRC32).
No external images, no network, no fonts from disk: the entry is fully
self-contained, and two runs produce identical bytes.

It writes a 1024x1024 PNG to `MAKEFUN_OUTPUT_DIR/entry.png` (default
`/output`), then reads it back to confirm it is a whole 1024x1024 PNG under
the 1 MiB cap.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out-meme-rogue node main.ts
```
