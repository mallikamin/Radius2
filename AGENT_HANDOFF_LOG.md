# Agent Handoff Log

Append one row per issued message. Do not edit historical rows except to correct obvious typos in `Notes`.

## Fields
- `Output#`: global unique sequence ID
- `Sender`: who issued the message
- `Recipient`: intended receiver
- `Task`: task id or short description
- `Status`: REQUEST, IN_PROGRESS, BLOCKED, DONE
- `Timestamp`: local time in ISO format (`YYYY-MM-DD HH:MM`)
- `In-Reply-To`: prior output id or `none`
- `Notes`: short evidence/blocker summary

## Ledger
| Output# | Sender | Recipient | Task | Status | Timestamp | In-Reply-To | Notes |
|---|---|---|---|---|---|---|---|
| Output#1 | User | All | Adopt message protocol | REQUEST | 2026-02-19 00:00 | none | Initialize tracking workflow |
| Output#2 | User | All | Enforce protocol on all upcoming responses | REQUEST | 2026-02-19 00:05 | Output#1 | Claude/Cursor/Codex must use required header and numbering |
