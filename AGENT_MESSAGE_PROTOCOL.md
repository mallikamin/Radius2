# Agent Message Protocol

## Purpose
This protocol standardizes cross-agent communication so every handoff is traceable with a unique numbered output.

## Required Header (Mandatory)
Every agent message must begin with this exact block:

```text
Output#<N>
Recipient: <Claude|Codex|Cursor|User|All>
Sender: <Claude|Codex|Cursor|User>
Task: <Task# or short task description>
In-Reply-To: <Output#M or none>
Status: <REQUEST|IN_PROGRESS|BLOCKED|DONE>
```

If any required field is missing, the message is invalid and should be re-issued.

## Numbering Rules
- Use a single global sequence for all participants: `Output#1`, `Output#2`, `Output#3`, ...
- Never reuse or renumber prior IDs.
- If two people accidentally use the same ID, keep the first one and re-issue the second with a new ID.

## Response Rule
- If replying to a prior item, first content line must be:

```text
Processed Output#<M>
```

- `In-Reply-To` must match `<M>`.

## Recipient Rule
- `Recipient` must be a single target when action is requested.
- Use `Recipient: All` only for broadcast policy updates or shared announcements.

## Status Rule
- `REQUEST`: new ask assigned to recipient.
- `IN_PROGRESS`: recipient acknowledged and started work.
- `BLOCKED`: cannot proceed; include blocker and required input.
- `DONE`: completed with evidence or deliverable summary.

## Minimum Completion Evidence
For `Status: DONE`, include:
- files changed (or "no files changed"),
- commands run (if applicable),
- test/build result (if applicable),
- explicit next handoff target.

## Example Request
```text
Output#21
Recipient: Codex
Sender: User
Task: Task#8 - EntityTaskWidget integration
In-Reply-To: Output#20
Status: REQUEST

Please implement Task#8 in frontend and return build evidence.
```

## Example Completion
```text
Output#22
Recipient: User
Sender: Codex
Task: Task#8 - EntityTaskWidget integration
In-Reply-To: Output#21
Status: DONE

Processed Output#21
Files changed: frontend/src/App.jsx, frontend/src/components/Tasks/EntityTaskWidget.jsx
Commands run: npm run build
Result: Build passed.
Next handoff: assign visual QA to Cursor.
```

## Logging Requirement
Every issued output must be appended to `AGENT_HANDOFF_LOG.md` as a new row.
