param(
  [Parameter(Mandatory=$true)][string]$Agent,
  [Parameter(Mandatory=$true)][string]$TaskCode,
  [Parameter(Mandatory=$true)][string]$TaskTitle,
  [Parameter(Mandatory=$true)][string]$SubtaskCode,
  [Parameter(Mandatory=$true)][string]$SubtaskTitle,
  [Parameter(Mandatory=$true)][string]$Prompt,
  [string]$Cmd = '',
  [string]$ProjectName = '',
  [string]$ProjectId = '',
  [int]$ProgressOnResponse = 50,
  [string]$StatusOnResponse = 'review'
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $root 'agent_wrapper.py'

$argList = @(
  '--agent', $Agent,
  '--task-code', $TaskCode,
  '--task-title', $TaskTitle,
  '--subtask-code', $SubtaskCode,
  '--subtask-title', $SubtaskTitle,
  '--prompt', $Prompt,
  '--status-on-response', $StatusOnResponse,
  '--progress-on-response', "$ProgressOnResponse"
)
if ($Cmd) { $argList += @('--cmd', $Cmd) }
if ($ProjectName) { $argList += @('--project-name', $ProjectName) }
if ($ProjectId) { $argList += @('--project-id', $ProjectId) }

python $py @argList
