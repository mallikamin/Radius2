# Telemetry Adapter Runbook

This folder adds non-invasive telemetry wrappers for multi-agent collaboration.
It does not modify product application code.

## Files
- telemetry_client.py - posts agent_event_v1 events to Campaign OS API with queue/retry fallback.
- agent_wrapper.py - wraps prompt->agent-command->response and auto emits prompt_sent + response_received.
- start.ps1 - one-command launcher for wrappers.
- .env.example - environment template.

## Setup (PowerShell)
```powershell
cd <repo_root>
$env:TELEMETRY_API_BASE='http://127.0.0.1:8090'
$env:TELEMETRY_AUTOMATION_KEY='<set-by-claude>'

# Optional command templates
$env:TELEMETRY_CLAUDE_CMD='claude --prompt "{prompt}"'
$env:TELEMETRY_CURSOR_CMD='cursor --prompt "{prompt}"'
$env:TELEMETRY_CODEX_CMD='codex --prompt "{prompt}"'
```

## One-command start (per prompt)
```powershell
.\scripts\telemetry\start.ps1 \
  -Agent Claude \
  -TaskCode Task#101 \
  -TaskTitle "Radius2 pipeline" \
  -SubtaskCode ST-1 \
  -SubtaskTitle "Design extraction step" \
  -Prompt "Analyze failure mode and propose fix"
```

For Cursor:
```powershell
.\scripts\telemetry\start.ps1 -Agent Cursor -TaskCode Task#101 -TaskTitle "Radius2 pipeline" -SubtaskCode ST-2 -SubtaskTitle "Implement patch" -Prompt "Patch and test this module"
```

## Offline fallback behavior
- If telemetry API is offline or key missing, events are queued in:
  - scripts/telemetry/event_queue.jsonl
- Queue auto flushes on next wrapper run.
- No manual curl required in normal usage.

## Metadata included in every event
- project_name, project_id
- task_code, subtask_code
- actor (agent)
- git branch
- worktree path
- prompt and response excerpts

## Reversible
To remove this integration:
- delete scripts/telemetry/
- unset TELEMETRY_* environment variables
