from __future__ import annotations

import argparse
import os
import subprocess
import sys
import uuid
from pathlib import Path

from telemetry_client import post_event


def detect_git_branch(cwd: Path) -> str:
    try:
        p = subprocess.run(
            ['git', '-C', str(cwd), 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        out = (p.stdout or '').strip()
        return out or 'unknown'
    except Exception:
        return 'unknown'


def build_event(args, event_type: str, actor: str, message: str, status: str | None, progress: int | None, prompt_id: str, corr: str, payload: dict):
    return {
        'schema_version': 'agent_event_v1',
        'project_id': args.project_id,
        'project_name': args.project_name,
        'task_code': args.task_code,
        'task_title': args.task_title,
        'subtask_code': args.subtask_code,
        'subtask_title': args.subtask_title,
        'actor': actor,
        'event_type': event_type,
        'status': status,
        'progress': progress,
        'prompt_id': prompt_id,
        'correlation_id': corr,
        'message': message,
        'payload': payload,
    }


def run_cmd(cmd: str) -> tuple[int, str, str]:
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return p.returncode, (p.stdout or '').strip(), (p.stderr or '').strip()


def main() -> int:
    parser = argparse.ArgumentParser(description='Telemetry wrapper for Codex/Claude/Cursor workflows')
    parser.add_argument('--agent', required=True, help='Codex | Claude | Cursor | DeepSeek | Ollama')
    parser.add_argument('--task-code', required=True)
    parser.add_argument('--task-title', required=True)
    parser.add_argument('--subtask-code', required=True)
    parser.add_argument('--subtask-title', required=True)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--status-on-response', default='review')
    parser.add_argument('--progress-on-response', type=int, default=50)
    parser.add_argument('--cmd', default='', help='Optional command to execute. Use {prompt} placeholder if needed.')
    parser.add_argument('--project-name', default='')
    parser.add_argument('--project-id', default='')
    args = parser.parse_args()

    cwd = Path.cwd()
    repo_name = cwd.name
    args.project_name = args.project_name or os.getenv('TELEMETRY_PROJECT_NAME', repo_name)
    args.project_id = args.project_id or os.getenv('TELEMETRY_PROJECT_ID', repo_name)

    prompt_id = f"prm_{uuid.uuid4().hex[:10]}"
    corr = f"{args.project_id}:{args.task_code}:{args.subtask_code}:{prompt_id}"
    branch = detect_git_branch(cwd)

    post_event(build_event(
        args,
        event_type='prompt_sent',
        actor='Codex',
        message=f'Prompt sent to {args.agent}',
        status='in_progress',
        progress=None,
        prompt_id=prompt_id,
        corr=f'{corr}:prompt_sent',
        payload={'prompt': args.prompt, 'branch': branch, 'worktree_path': str(cwd), 'agent': args.agent},
    ))

    cmd = args.cmd.strip()
    if not cmd:
        template_var = f"TELEMETRY_{args.agent.upper()}_CMD"
        cmd = os.getenv(template_var, '')
    if cmd:
        cmd = cmd.replace('{prompt}', args.prompt)
        rc, out, err = run_cmd(cmd)
        excerpt = (out or err or f'Command exited rc={rc}')[:3000]
    else:
        rc, out, err = 0, '', ''
        excerpt = f"No command configured for {args.agent}; telemetry-only capture."

    post_event(build_event(
        args,
        event_type='response_received',
        actor=args.agent,
        message=f'Response captured from {args.agent}',
        status=args.status_on_response,
        progress=max(0, min(100, args.progress_on_response)),
        prompt_id=prompt_id,
        corr=f'{corr}:response_received',
        payload={
            'branch': branch,
            'worktree_path': str(cwd),
            'command': cmd,
            'exit_code': rc,
            'stdout_excerpt': out[:1200],
            'stderr_excerpt': err[:1200],
            'response_excerpt': excerpt,
        },
    ))

    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    return rc


if __name__ == '__main__':
    raise SystemExit(main())
