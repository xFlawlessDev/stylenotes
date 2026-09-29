#requires -Version 7
<#
    Scenario driver: builds a realistic example workspace over MCP and records
    expected vs actual for every tool. Kept separate from mcp-e2e.ps1 so the
    smoke suite stays fast; this one deliberately leaves data behind.

    Usage: pwsh -File scripts/mcp-scenario.ps1
#>
param(
    [string]$ShimPath = "",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
if (-not $ShimPath) {
    foreach ($c in @("src-tauri/target/debug/stylenotes-mcp.exe", "src-tauri/stylenotes-mcp-x86_64-pc-windows-msvc.exe")) {
        if (Test-Path $c) { $ShimPath = (Resolve-Path $c).Path; break }
    }
}
if (-not $ShimPath -or -not (Test-Path $ShimPath)) { throw "Shim binary not found." }

$McpDir = Join-Path $env:APPDATA "com.arifpebryan.stylenotes/mcp"
$Snapshot = Join-Path $McpDir "snapshot.json"
$RefreshWait = 4

class McpSession {
    [System.Diagnostics.Process]$Proc
    [int]$NextId = 10
    McpSession([string]$exe) {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $exe
        $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
        $this.Proc = [System.Diagnostics.Process]::Start($psi)
        $this.Proc.StandardInput.Write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"scenario","version":"1.0"}}}' + "`n")
        $this.Proc.StandardInput.Flush()
        $this.Proc.StandardOutput.ReadLine() | Out-Null
        $this.Proc.StandardInput.Write('{"jsonrpc":"2.0","method":"notifications/initialized"}' + "`n")
        $this.Proc.StandardInput.Flush()
    }
    [object] Request([string]$method, [hashtable]$params) { return $this.Request($method, $params, 20) }
    [object] Request([string]$method, [hashtable]$params, [int]$TimeoutSec) {
        $id = $this.NextId++
        $payload = @{ jsonrpc = "2.0"; id = $id; method = $method; params = $params }
        $this.Proc.StandardInput.Write(($payload | ConvertTo-Json -Compress -Depth 12) + "`n")
        $this.Proc.StandardInput.Flush()
        $deadline = (Get-Date).AddSeconds($TimeoutSec)
        while ((Get-Date) -lt $deadline) {
            $task = $this.Proc.StandardOutput.ReadLineAsync()
            if ($task.Wait([Math]::Max(50, [int](($deadline - (Get-Date)).TotalMilliseconds)))) {
                $line = $task.Result
                if ($null -eq $line) { break }
                if (-not $line.Trim()) { continue }
                try { $msg = $line | ConvertFrom-Json } catch { continue }
                if ($msg.id -eq $id) { return $msg }
            }
        }
        throw "No response for $method (id=$id)"
    }
    [void] Close() {
        try { $this.Proc.StandardInput.Close() } catch {}
        if (-not $this.Proc.WaitForExit(4000)) { $this.Proc.Kill() }
    }
}

$script:Pass = 0
$script:Fail = 0
$script:Rows = New-Object System.Collections.ArrayList

function Call-Tool([string]$Tool, [hashtable]$ToolArgs = @{}) {
    $msg = $session.Request("tools/call", @{ name = $Tool; arguments = $ToolArgs })
    if ($msg.result.isError) {
        return @{ ok = $false; error = $msg.result.structuredContent.error; data = $msg.result.structuredContent; message = $msg.result.content[0].text }
    }
    return @{ ok = $true; data = $msg.result.structuredContent; message = "" }
}

# Records one expected-vs-actual observation for the report table.
function Check([string]$Tool, [string]$Expected, [scriptblock]$Probe) {
    try {
        $res = & $Probe
        $actual = $res.actual
        $pass = [bool]$res.pass
    } catch {
        $actual = "EXCEPTION: " + $_.Exception.Message
        $pass = $false
    }
    if ($pass) { $script:Pass++ } else { $script:Fail++ }
    [void]$script:Rows.Add([pscustomobject]@{
        Tool = $Tool; Expected = $Expected; Actual = $actual
        Result = if ($pass) { "PASS" } else { "FAIL" }
    })
    $color = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [" + $(if ($pass) { "PASS" } else { "FAIL" }) + "] " + $Tool + " : " + $actual) -ForegroundColor $color
    return $pass
}

function Wait-Refresh { Start-Sleep -Seconds $RefreshWait }

# Waits until the app publishes a snapshot satisfying `Probe`, so the scenario
# never races the 2s snapshot throttle after a write. The probe gets the parsed
# snapshot; `Arg` carries any value the probe needs (PowerShell scriptblocks do
# not close over the caller's local variables reliably).
function Wait-Until([scriptblock]$Probe, $Arg, [int]$TimeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $snap = Get-Content $Snapshot -Raw | ConvertFrom-Json
            if (& $Probe $snap $Arg) { return $true }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

Write-Host "`n=== MCP realistic scenario ===" -ForegroundColor Cyan
$session = [McpSession]::new($ShimPath)

$wsId = $null
$noteIds = @{}
$taskIds = @{}

try {
    # -----------------------------------------------------------------------
    Write-Host "`n-- workspace setup --" -ForegroundColor Yellow

    $listWs = Call-Tool "list_workspaces" @{}
    Check "list_workspaces before" "1 workspace named Personal with counts" {
        $names = @($listWs.data.workspaces | ForEach-Object { $_.name })
        @{ pass = ($listWs.ok -and $names -contains "Personal"); actual = "workspaces=[" + ($names -join ",") + "] count=" + $listWs.data.count }
    }

    $stamp = Get-Date -Format "HHmm"
    $wsName = "Product Launch $stamp"
    $created = Call-Tool "create_workspace" @{ name = $wsName; color = "tertiary" }
    # NOTE: assign in the outer scope. PowerShell scriptblocks passed to `Check`
    # run in a child scope, so `$wsId = ...` inside one would not reach the
    # caller — that silently sent every later write to workspace-default.
    $wsId = if ($created.ok) { $created.data.workspace.id } else { $null }
    Check "create_workspace" "new workspace id + name returned" {
        @{ pass = ($created.ok -and $wsId); actual = "id=" + $wsId + " name=" + $created.data.workspace.name }
    }
    $script:Workspace = $wsName
    # Wait for the host to re-read its workspace list and publish it, or the
    # notes below resolve `workspace` against a stale list and silently land in
    # the default workspace.
    $sawWorkspace = Wait-Until { param($snap, $id) @($snap.workspaces | Where-Object { $_.id -eq $id }).Count -eq 1 } $wsId 30
    Check "workspace visible in snapshot" "new workspace published by the host" {
        @{ pass = $sawWorkspace; actual = "visible=" + $sawWorkspace }
    }

    $afterWs = Call-Tool "list_workspaces" @{}
    Check "list_workspaces after" "2 workspaces, new one has 0 notes / 0 tasks" {
        $all = @($afterWs.data.workspaces)
        $new = @($all | Where-Object { $_.id -eq $wsId })[0]
        @{ pass = ($all.Count -eq 2 -and [int]$new.noteCount -eq 0 -and [int]$new.taskCount -eq 0); actual = "count=" + $all.Count + " newNote=" + $new.noteCount + " newTask=" + $new.taskCount }
    }

    # -----------------------------------------------------------------------
    Write-Host "`n-- notes (realistic bodies with wiki links) --" -ForegroundColor Yellow

    $notes = @(
        @{ key = "brief"; title = "Launch brief"; folder = "launch"; tags = @("launch", "spec");
           body = "# Launch brief`n`nGoal: ship v1 by the end of the quarter.`n`nPillars:`n- Positioning -> [[Positioning memo]]`n- Pricing -> [[Pricing model]]`n- Checklist -> [[Launch runbook]]" }
        @{ key = "positioning"; title = "Positioning memo"; folder = "launch"; tags = @("launch", "marketing");
           body = "# Positioning memo`n`nFor small teams who think in notes.`n`nBack to [[Launch brief]]. Blocks [[Launch runbook]]." }
        @{ key = "pricing"; title = "Pricing model"; folder = "launch"; tags = @("launch", "finance");
           body = "# Pricing model`n`nFree tier plus team plan. See [[Launch brief]]." }
        @{ key = "runbook"; title = "Launch runbook"; folder = "launch"; tags = @("launch", "ops");
           body = "# Launch runbook`n`n- [ ] Draft announcement`n- [x] Pick a date`n`nDepends on [[Positioning memo]] and [[Pricing model]]." }
    )
    foreach ($n in $notes) {
        $r = Call-Tool "create_note" @{ title = $n.title; body = $n.body; folder = $n.folder; tags = $n.tags; workspace = $wsId }
        if ($r.ok) { $noteIds[$n.key] = $r.data.note.id }
    }
    Check "create_note x4" "4 notes in the new workspace" {
        @{ pass = ($noteIds.Count -eq 4); actual = "created=" + $noteIds.Count + " ids=" + (($noteIds.Values) -join ",") }
    }
    Wait-Refresh

    # -----------------------------------------------------------------------
    Write-Host "`n-- tasks with a real dependency chain --" -ForegroundColor Yellow

    # "Run launch retro" is the only task created open with a past due date, so
    # it is the one `overdueOnly` must return ("Finalise positioning" is done).
    $tasks = @(
        @{ key = "position"; title = "Finalise positioning"; status = "done";  priority = "high";   due = (Get-Date).AddDays(-3).ToString("yyyy-MM-dd") }
        @{ key = "pricing";  title = "Approve pricing";      status = "doing"; priority = "high";   due = (Get-Date).AddDays(2).ToString("yyyy-MM-dd") }
        @{ key = "announce"; title = "Write announcement";   status = "todo";  priority = "medium"; due = (Get-Date).AddDays(5).ToString("yyyy-MM-dd") }
        @{ key = "ship";     title = "Ship v1";              status = "todo";  priority = "high";   due = (Get-Date).AddDays(10).ToString("yyyy-MM-dd") }
        @{ key = "retro";    title = "Run launch retro";     status = "todo";  priority = "low";    due = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") }
    )
    foreach ($t in $tasks) {
        $args = @{ title = $t.title; status = $t.status; priority = $t.priority; folder = "launch"; workspace = $wsId }
        if ($t.due) { $args.dueAt = $t.due }
        $r = Call-Tool "create_task" $args
        if ($r.ok) { $taskIds[$t.key] = $r.data.task.id }
    }
    Check "create_task x5" "5 tasks in the new workspace" {
        @{ pass = ($taskIds.Count -eq 5); actual = "created=" + $taskIds.Count }
    }
    Wait-Refresh

    # Chain: announcement <- pricing <- position; ship <- announcement
    $links = @(
        @{ id = $taskIds.announce; dep = $taskIds.pricing },
        @{ id = $taskIds.pricing;  dep = $taskIds.position },
        @{ id = $taskIds.ship;     dep = $taskIds.announce }
    )
    $linked = 0
    foreach ($l in $links) {
        $r = Call-Tool "link_tasks" @{ id = $l.id; dependsOn = $l.dep }
        if ($r.ok) { $linked++ }
    }
    Check "link_tasks x3" "3 dependency edges created" {
        @{ pass = ($linked -eq 3); actual = "linked=" + $linked }
    }
    Wait-Refresh

    # -----------------------------------------------------------------------
    Write-Host "`n-- read tools against the scenario --" -ForegroundColor Yellow

    $r = Call-Tool "list_notes" @{ workspace = $wsId }
    Check "list_notes workspace" "4 notes, folder=launch" {
        @{ pass = (@($r.data.notes).Count -eq 4 -and @($r.data.notes | Where-Object { $_.folder -eq "launch" }).Count -eq 4); actual = "notes=" + @($r.data.notes).Count }
    }

    $r = Call-Tool "list_notes" @{ workspace = $wsId; tag = "finance" }
    Check "list_notes tag=finance" "only Pricing model" {
        $titles = @($r.data.notes | ForEach-Object { $_.title })
        @{ pass = ($titles.Count -eq 1 -and $titles[0] -eq "Pricing model"); actual = "titles=[" + ($titles -join ",") + "]" }
    }

    $r = Call-Tool "search_notes" @{ query = "positioning"; workspace = $wsId }
    Check "search_notes('positioning')" "Positioning memo ranked first (title hit)" {
        @{ pass = (@($r.data.notes)[0].title -eq "Positioning memo"); actual = "first=" + @($r.data.notes)[0].title }
    }

    $r = Call-Tool "get_note" @{ id = $noteIds.brief; workspace = $wsId }
    Check "get_note Launch brief" "outlinks = 3 (memo, pricing, runbook)" {
        @{ pass = (@($r.data.outlinks).Count -eq 3); actual = "outlinks=" + @($r.data.outlinks).Count + " backlinks=" + @($r.data.backlinks).Count }
    }

    $r = Call-Tool "get_note" @{ id = $noteIds.runbook; workspace = $wsId }
    Check "get_note Launch runbook" "backlinks = 2 (brief + memo)" {
        $titles = @($r.data.backlinks | ForEach-Object { $_.title })
        @{ pass = ($titles.Count -eq 2); actual = "backlinks=[" + ($titles -join ",") + "]" }
    }

    $r = Call-Tool "context" @{ query = "pricing"; workspace = $wsId; depth = 1 }
    Check "context('pricing')" "Pricing model first, with neighbours" {
        $first = @($r.data.notes)[0]
        @{ pass = ($first.title -eq "Pricing model" -and $null -ne $first.neighbours); actual = "first=" + $first.title + " neighbours=" + (@($first.neighbours.outlinks).Count + @($first.neighbours.backlinks).Count) }
    }

    $r = Call-Tool "list_tasks" @{ workspace = $wsId }
    Check "list_tasks workspace" "5 tasks, high priority first" {
        @{ pass = (@($r.data.tasks).Count -eq 5 -and @($r.data.tasks)[0].priority -eq "high"); actual = "tasks=" + @($r.data.tasks).Count + " first=" + @($r.data.tasks)[0].title }
    }

    $r = Call-Tool "list_tasks" @{ workspace = $wsId; overdueOnly = $true }
    Check "list_tasks overdueOnly" "only Run launch retro (open, due yesterday)" {
        $titles = @($r.data.tasks | ForEach-Object { $_.title })
        @{ pass = ($titles.Count -eq 1 -and $titles[0] -eq "Run launch retro"); actual = "overdue=[" + ($titles -join ",") + "]" }
    }

    # A task due in the future must never be flagged, even though it has a due
    # date: that was the old mock-clock bug (any dated open task read overdue).
    $future = Call-Tool "get_task" @{ id = $taskIds.ship; workspace = $wsId }
    Check "overdue exclusion" "Ship v1 (due +10d, open) is not overdue" {
        $overdueIds = @((Call-Tool "list_tasks" @{ workspace = $wsId; overdueOnly = $true }).data.tasks | ForEach-Object { $_.id })
        @{ pass = ($overdueIds -notcontains $taskIds.ship); actual = "shipOverdue=" + ($overdueIds -contains $taskIds.ship) + " dueAt=" + $future.data.dueAt }
    }

    $r = Call-Tool "list_tasks" @{ workspace = $wsId; status = "todo"; includeDone = $false }
    Check "list_tasks status=todo includeDone=false" "3 todo tasks (announce, ship, retro)" {
        @{ pass = (@($r.data.tasks).Count -eq 3); actual = "count=" + @($r.data.tasks).Count + " =[" + (@($r.data.tasks | ForEach-Object { $_.title }) -join ",") + "]" }
    }

    $r = Call-Tool "get_task" @{ id = $taskIds.ship; workspace = $wsId }
    Check "get_task Ship v1" "blocked=true, blockedBy=Write announcement" {
        @{ pass = ($r.data.blocked -eq $true -and @($r.data.blockedBy).Count -eq 1); actual = "blocked=" + $r.data.blocked + " blockedBy=" + @($r.data.blockedBy).Count }
    }

    $r = Call-Tool "get_task" @{ id = $taskIds.position; workspace = $wsId }
    Check "get_task Finalise positioning" "blocking >= 1 (Approve pricing)" {
        @{ pass = (@($r.data.blocking).Count -ge 1); actual = "blocking=" + @($r.data.blocking).Count }
    }

    $r = Call-Tool "task_board" @{ workspace = $wsId }
    Check "task_board workspace" "columns cover 3 statuses with counts" {
        $cols = @($r.data.columns)
        @{ pass = ($cols.Count -ge 3); actual = "columns=" + (($cols | ForEach-Object { $_.status + ":" + $_.count }) -join ", ") }
    }

    $r = Call-Tool "daily_summary" @{ workspace = $wsId }
    Check "daily_summary workspace" "openTasks + inProgress reported" {
        @{ pass = ($null -ne $r.data.openTasks -and $null -ne $r.data.inProgress); actual = "open=" + $r.data.openTasks + " inProgress=" + @($r.data.inProgress).Count }
    }

    $r = Call-Tool "list_dependencies" @{ workspace = $wsId }
    Check "list_dependencies workspace" "3 edges" {
        @{ pass = (@($r.data.dependencies).Count -eq 3); actual = "edges=" + @($r.data.dependencies).Count }
    }

    $r = Call-Tool "critical_path" @{ toId = $taskIds.ship; workspace = $wsId }
    Check "critical_path to Ship v1" "chain length 4 (position->pricing->announce->ship)" {
        @{ pass = ($r.data.length -eq 4); actual = "length=" + $r.data.length + " chain=[" + (@($r.data.chain | ForEach-Object { $_.title }) -join " -> ") + "]" }
    }

    $r = Call-Tool "graph_query" @{ id = "note:$($noteIds.brief)"; depth = 1; workspace = $wsId }
    Check "graph_query Launch brief depth 1" ">=4 nodes, >=3 wiki edges" {
        @{ pass = (@($r.data.nodes).Count -ge 4 -and @($r.data.edges).Count -ge 3); actual = "nodes=" + @($r.data.nodes).Count + " edges=" + @($r.data.edges).Count }
    }

    $r = Call-Tool "graph_query" @{ id = "note:$($noteIds.brief)"; depth = 2; kind = @("wiki"); workspace = $wsId }
    Check "graph_query kind=wiki depth 2" "only wiki edges, reaches all notes" {
        $kinds = @($r.data.edges | ForEach-Object { $_.kind } | Select-Object -Unique)
        @{ pass = (@($r.data.nodes).Count -eq 4 -and ($kinds | Where-Object { $_ -ne "wiki" }).Count -eq 0); actual = "nodes=" + @($r.data.nodes).Count + " kinds=[" + ($kinds -join ",") + "]" }
    }

    # -----------------------------------------------------------------------
    Write-Host "`n-- write semantics --" -ForegroundColor Yellow

    $r = Call-Tool "update_note_body" @{ id = $noteIds.pricing; body = "# Pricing model`n`nRevised: free tier, team plan, enterprise pilot. Links [[Launch brief]]."; workspace = $wsId }
    Wait-Refresh
    $r2 = Call-Tool "get_note" @{ id = $noteIds.pricing; workspace = $wsId }
    Check "update_note_body Pricing model" "body persisted with 'Revised: free tier'" {
        @{ pass = ($r2.data.body -match "Revised: free tier"); actual = "bodyChanged=" + ($r2.data.body -match "Revised: free tier") + " chars=" + $r2.data.body.Length }
    }

    $r = Call-Tool "update_task" @{ id = $taskIds.retro; patch = @{ priority = "medium"; dueAt = (Get-Date).AddDays(14).ToString("yyyy-MM-dd") }; workspace = $wsId }
    Wait-Refresh
    $r2 = Call-Tool "get_task" @{ id = $taskIds.retro; workspace = $wsId }
    Check "update_task retro" "priority=medium and dueAt set" {
        @{ pass = ($r2.data.priority -eq "medium" -and $r2.data.dueAt); actual = "priority=" + $r2.data.priority + " dueAt=" + $r2.data.dueAt }
    }

    $r = Call-Tool "complete_task" @{ id = $taskIds.pricing; workspace = $wsId }
    Wait-Refresh
    $r2 = Call-Tool "get_task" @{ id = $taskIds.pricing; workspace = $wsId }
    Check "complete_task Approve pricing" "status=done, completed=true; unblocks announcement" {
        $ann = Call-Tool "get_task" @{ id = $taskIds.announce; workspace = $wsId }
        @{ pass = ($r2.data.status -eq "done" -and $r2.data.completed -eq $true -and @($ann.data.blockedBy).Count -eq 1); actual = "status=" + $r2.data.status + " announceBlockedBy=" + @($ann.data.blockedBy).Count }
    }

    $r = Call-Tool "unlink_tasks" @{ id = $taskIds.ship; dependsOn = $taskIds.announce; workspace = $wsId }
    Wait-Refresh
    $r2 = Call-Tool "get_task" @{ id = $taskIds.ship; workspace = $wsId }
    Check "unlink_tasks ship to announce" "ship no longer blocked" {
        @{ pass = (@($r2.data.blockedBy).Count -eq 0); actual = "blocked=" + $r2.data.blocked + " blockedBy=" + @($r2.data.blockedBy).Count }
    }

    # `unlink_tasks` removed ship -> announce, so re-link it and then close the
    # loop the other way. The second call is the cycle and must be refused.
    $relink = Call-Tool "link_tasks" @{ id = $taskIds.ship; dependsOn = $taskIds.announce; workspace = $wsId }
    Check "link_tasks re-link ship to announce" "accepted: restores the acyclic chain" {
        @{ pass = $relink.ok; actual = "ok=" + $relink.ok }
    }
    $r = Call-Tool "link_tasks" @{ id = $taskIds.announce; dependsOn = $taskIds.ship; workspace = $wsId }
    Check "link_tasks cycle" "rejected with dependency_cycle" {
        @{ pass = ((-not $r.ok) -and $r.error -eq "dependency_cycle"); actual = "ok=" + $r.ok + " error=" + $r.error + " msg=[" + $r.message + "]" }
    }

    $r = Call-Tool "rename_workspace" @{ id = $wsId; name = "$wsName (renamed)" }
    Wait-Refresh
    $r2 = Call-Tool "list_workspaces" @{}
    Check "rename_workspace" "name updated in list_workspaces" {
        $w = @($r2.data.workspaces | Where-Object { $_.id -eq $wsId })[0]
        @{ pass = ($w.name -eq "$wsName (renamed)"); actual = "name=[" + $w.name + "] renameOk=" + $r.ok }
    }

    # -----------------------------------------------------------------------
    Write-Host "`n-- cross-workspace isolation --" -ForegroundColor Yellow
    $iso = Call-Tool "get_note" @{ id = $noteIds.brief; workspace = "workspace-default" }
    Check "get_note wrong workspace" "not_found: default workspace has no such note" {
        @{ pass = (-not $iso.ok); actual = "error=" + $iso.error }
    }

    $defTasks = Call-Tool "list_tasks" @{ workspace = "workspace-default" }
    Check "list_tasks workspace-default" "does not leak the new workspace's tasks" {
        @{ pass = (@($defTasks.data.tasks).Count -eq 0); actual = "tasks=" + @($defTasks.data.tasks).Count }
    }
}
finally {
    if ($session) { $session.Close() }
}

Write-Host "`n=== result ===" -ForegroundColor Cyan
Write-Host ("  workspace : " + $script:Workspace)
Write-Host ("  passed    : " + $script:Pass) -ForegroundColor Green
Write-Host ("  failed    : " + $script:Fail) -ForegroundColor $(if ($script:Fail -gt 0) { "Red" } else { "Green" })

# Dump the observation table for the report.
$out = Join-Path $env:TEMP "mcp-scenario-rows.json"
$script:Rows | ConvertTo-Json -Depth 4 | Set-Content $out -Encoding utf8
Write-Host ("  rows      : " + $out)

$snap = Get-Content $Snapshot -Raw | ConvertFrom-Json
Write-Host ("  snapshot  : rev=" + $snap.revision + " notes=" + $snap.notes.Count + " tasks=" + $snap.tasks.Count + " workspaces=" + $snap.workspaces.Count)
exit $(if ($script:Fail -gt 0) { 1 } else { 0 })

