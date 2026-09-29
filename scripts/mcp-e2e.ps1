#requires -Version 7
<#
    E2E test driver for the local StyleNotes MCP bridge.

    Runs ONE persistent shim process over stdio (exactly how a real MCP client
    keeps its server alive) and exchanges JSON-RPC line by line. A fresh process
    per call is unreliable because the shim tears down on stdin EOF and the
    last response can be lost — this mirrors real client behaviour instead.

    The app must be running with write access granted in Settings -> MCP.

    Usage: pwsh -File scripts/mcp-e2e.ps1 [-KeepData] [-ShimPath <path>]
#>
param(
    [switch]$KeepData,
    [string]$ShimPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ShimPath) {
    foreach ($c in @("src-tauri/target/debug/stylenotes-mcp.exe", "src-tauri/stylenotes-mcp-x86_64-pc-windows-msvc.exe")) {
        if (Test-Path $c) { $ShimPath = (Resolve-Path $c).Path; break }
    }
}
if (-not $ShimPath -or -not (Test-Path $ShimPath)) { throw "Shim binary not found. Run 'bun run mcp:sidecar' or 'cargo build' first." }

$McpDir = Join-Path $env:APPDATA "com.arifpebryan.stylenotes/mcp"
$Snapshot = Join-Path $McpDir "snapshot.json"
$RefreshWait = 4  # seconds; the app throttles snapshot writes to <1 per 2s

# ---------------------------------------------------------------------------
# Persistent MCP session
# ---------------------------------------------------------------------------
class McpSession {
    [System.Diagnostics.Process]$Proc
    [int]$NextId = 10

    McpSession([string]$exe) {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $exe
        $psi.RedirectStandardInput = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $this.Proc = [System.Diagnostics.Process]::Start($psi)
        $this.Send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e","version":"1.0"}}}') | Out-Null
        $this.Proc.StandardInput.Write('{"jsonrpc":"2.0","method":"notifications/initialized"}' + "`n")
        $this.Proc.StandardInput.Flush()
    }

    [string] Send([string]$line) {
        $this.Proc.StandardInput.Write($line + "`n")
        $this.Proc.StandardInput.Flush()
        return $line
    }

    # Reads lines until the response with `id` arrives (notifications are skipped).
    [object] Request([string]$method, [hashtable]$params) {
        return $this.Request($method, $params, 15)
    }

    [object] Request([string]$method, [hashtable]$params, [int]$TimeoutSec) {
        $id = $this.NextId++
        $payload = @{ jsonrpc = "2.0"; id = $id; method = $method }
        if ($null -ne $params) { $payload.params = $params }
        $json = $payload | ConvertTo-Json -Compress -Depth 12
        $this.Proc.StandardInput.Write($json + "`n")
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
        throw "No response for $method (id=$id) within ${TimeoutSec}s"
    }

    [void] Close() {
        try { $this.Proc.StandardInput.Close() } catch {}
        if (-not $this.Proc.WaitForExit(4000)) { $this.Proc.Kill() }
    }
}

# ---------------------------------------------------------------------------
$script:Pass = 0
$script:Fail = 0
$script:Notes = @{}
$script:Tasks = @{}
$session = $null

function Assert($name, $cond, $detail) {
    if ($cond) { $script:Pass++; Write-Host "  [PASS] $name" -ForegroundColor Green }
    else { $script:Fail++; Write-Host ("  [FAIL] " + $name + "  -> " + $detail) -ForegroundColor Red }
}

# Tool call returning a normalised envelope: {ok, data, error, message}.
function Call-Tool([string]$Tool, [hashtable]$ToolArgs = @{}) {
    $params = @{ name = $Tool; arguments = $ToolArgs }
    $msg = $session.Request("tools/call", $params, 20)
    $sc = $msg.result.structuredContent
    if ($msg.result.isError) {
        return @{ ok = $false; error = $sc.error; message = $msg.result.content[0].text; data = $sc }
    }
    return @{ ok = $true; data = $sc; message = "" }
}

function Report($label, $res) {
    $state = if ($res.ok) { "ok" } else { "err:" + $res.error }
    Write-Host ("    -> " + $label + " : " + $state)
    if (-not $res.ok) { Write-Host ("       " + $res.message) -ForegroundColor DarkYellow }
    return $res
}

# Waits for the app to publish a snapshot newer than the one we last saw.
function Wait-Refresh {
    Start-Sleep -Seconds $RefreshWait
}

Write-Host "`n=== StyleNotes MCP E2E ===" -ForegroundColor Cyan
Write-Host ("shim : " + $ShimPath)

$info = Get-Content (Join-Path $McpDir "app-info.json") -Raw | ConvertFrom-Json
Write-Host ("app  : running=" + $info.appRunning + " enabled=" + $info.enabled + " grant=" + $info.grant.access + " scopes=[" + ($info.grant.scopes -join ",") + "]")
if (-not $info.enabled) { throw "MCP is disabled in Settings -> MCP." }
if ($info.grant.access -ne "write") { throw "Write access is off; enable it in Settings -> MCP." }

$session = [McpSession]::new($ShimPath)

try {
    # -----------------------------------------------------------------------
    Write-Host "`n-- 0. handshake & registry --" -ForegroundColor Yellow
    $init = $session.Request("tools/list", @{})
    Assert "tools/list responds" ($null -ne $init.result.tools) "no tools array"
    $toolNames = @($init.result.tools | ForEach-Object { $_.name })
    Assert "tools/list exposes 20 tools" ($toolNames.Count -eq 20) ("got " + $toolNames.Count)

    $expected = @(
        'list_notes','search_notes','get_note','context','list_tasks','get_task','task_board',
        'daily_summary','list_dependencies','critical_path','graph_query',
        'create_note','update_note_body','delete_note','create_task','update_task',
        'complete_task','delete_task','link_tasks','unlink_tasks'
    )
    $missing = @($expected | Where-Object { $_ -notin $toolNames })
    Assert "all 20 expected tools present" ($missing.Count -eq 0) ("missing: " + ($missing -join ","))
    $writeTools = @($init.result.tools | Where-Object { $_.annotations.readOnlyHint -eq $false })
    Assert "9 write tools flagged non-read-only" ($writeTools.Count -eq 9) ("got " + $writeTools.Count)

    # -----------------------------------------------------------------------
    Write-Host "`n-- 1. seed data (write tools) --" -ForegroundColor Yellow
    $stamp = Get-Date -Format "HHmmss"

    $mkNote = {
        param($title, $body, $tags)
        $r = Call-Tool "create_note" @{ title = $title; body = $body; folder = "e2e"; tags = $tags }
        Report "create_note $title" $r
        return $r
    }

    $a = & $mkNote "E2E-Alpha-$stamp" "# Alpha`n`nLinks to [[E2E-Beta-$stamp]] and [[E2E-Gamma-$stamp]]." @("e2e", "alpha")
    $b = & $mkNote "E2E-Beta-$stamp"  "# Beta`n`nBack to [[E2E-Alpha-$stamp]]. Also [[E2E-Gamma-$stamp]]." @("e2e", "beta")
    $c = & $mkNote "E2E-Gamma-$stamp" "# Gamma`n`nA leaf. Points at [[E2E-Alpha-$stamp]]." @("e2e")

    $rootT = Report "create_task Root"  (Call-Tool "create_task" @{ title = "E2E-Root-$stamp";  status = "todo";  priority = "high";   folder = "e2e" })
    $midT  = Report "create_task Mid"   (Call-Tool "create_task" @{ title = "E2E-Mid-$stamp";   status = "doing"; priority = "medium"; folder = "e2e" })
    $leafT = Report "create_task Leaf"  (Call-Tool "create_task" @{ title = "E2E-Leaf-$stamp";  status = "todo";  priority = "low";    folder = "e2e" })

    Wait-Refresh

    # Resolve ids the way an agent would: search by title, then keep the ref.
    function Find-NoteId([string]$title) {
        $r = Call-Tool "search_notes" @{ query = $title }
        $hit = @($r.data.notes | Where-Object { $_.title -eq $title } | Select-Object -First 1)
        if ($hit.Count -eq 0) { return "" }
        return $hit[0].id
    }
    function Find-TaskId([string]$title) {
        $r = Call-Tool "list_tasks" @{}
        $hit = @($r.data.tasks | Where-Object { $_.title -eq $title } | Select-Object -First 1)
        if ($hit.Count -eq 0) { return "" }
        return $hit[0].id
    }

    $alphaId = Find-NoteId "E2E-Alpha-$stamp"
    $betaId  = Find-NoteId "E2E-Beta-$stamp"
    $gammaId = Find-NoteId "E2E-Gamma-$stamp"
    $rootId  = Find-TaskId "E2E-Root-$stamp"
    $midId   = Find-TaskId "E2E-Mid-$stamp"
    $leafId  = Find-TaskId "E2E-Leaf-$stamp"

    $script:Notes = @{ alpha = $alphaId; beta = $betaId; gamma = $gammaId }
    $script:Tasks = @{ root = $rootId; mid = $midId; leaf = $leafId }

    Assert "seeded notes are resolvable by title" (($alphaId -and $betaId -and $gammaId)) ("ids: $alphaId / $betaId / $gammaId")
    Assert "seeded tasks are resolvable by title" (($rootId -and $midId -and $leafId)) ("ids: $rootId / $midId / $leafId")
    # Read payloads carry a bare `id` plus a workspace-prefixed `ref` (#13b).
    $alphaRef = @((Call-Tool "search_notes" @{ query = "E2E-Alpha-$stamp" }).data.notes | Where-Object { $_.title -eq "E2E-Alpha-$stamp" })[0].ref
    Assert "read payloads carry a workspace-prefixed ref" ($alphaRef -match "^workspace-default/") ("ref: " + $alphaRef)

    # Root <- Mid <- Leaf, plus Leaf <- Root for a richer graph.
    Report "link_tasks Mid depends on Root"  (Call-Tool "link_tasks" @{ id = $midId;  dependsOn = $rootId }) | Out-Null
    Report "link_tasks Leaf depends on Mid"  (Call-Tool "link_tasks" @{ id = $leafId; dependsOn = $midId }) | Out-Null
    Report "link_tasks Leaf depends on Root" (Call-Tool "link_tasks" @{ id = $leafId; dependsOn = $rootId }) | Out-Null
    Report "update_task Leaf due yesterday"  (Call-Tool "update_task" @{ id = $leafId; patch = @{ dueAt = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") } }) | Out-Null
    Wait-Refresh

    # -----------------------------------------------------------------------
    Write-Host "`n-- 2. read tools --" -ForegroundColor Yellow

    $listNotes = Report "list_notes" (Call-Tool "list_notes" @{ folder = "e2e"; limit = 200 })
    if ($listNotes.ok) {
        $titles = @($listNotes.data.notes | ForEach-Object { $_.title })
        Assert "list_notes sees all 3 seeded notes" (@(("E2E-Alpha-$stamp","E2E-Beta-$stamp","E2E-Gamma-$stamp") | Where-Object { $_ -in $titles }).Count -eq 3) ("titles: " + ($titles -join ", "))
        Assert "list_notes folder filter excludes other folders" (@(($listNotes.data.notes | Where-Object { $_.folder -ne "e2e" })).Count -eq 0) "folder filter leaked"
    }

    $search = Report "search_notes by title" (Call-Tool "search_notes" @{ query = "E2E-Beta-$stamp" })
    if ($search.ok) {
        Assert "search_notes finds Beta first" (@($search.data.notes)[0].title -eq "E2E-Beta-$stamp") ("first: " + @($search.data.notes)[0].title)
    }

    $searchBody = Report "search_notes body term" (Call-Tool "search_notes" @{ query = "A leaf" })
    if ($searchBody.ok) {
        Assert "search_notes matches body text" (@($searchBody.data.notes | Where-Object { $_.title -eq "E2E-Gamma-$stamp" }).Count -eq 1) "gamma not matched in body"
    }

    $getNote = Report "get_note Alpha" (Call-Tool "get_note" @{ id = $alphaId })
    if ($getNote.ok) {
        $d = $getNote.data
        Assert "get_note returns body" ($d.body.Length -gt 0) "empty body"
        $outTitles = @($d.outlinks | ForEach-Object { $_.title })
        Assert "get_note outlinks = Beta + Gamma" ($outTitles.Count -eq 2) ("outlinks: " + ($outTitles -join ","))
        Assert "get_note backlinks >= 1" (@($d.backlinks).Count -ge 1) ("backlinks: " + @($d.backlinks).Count)
    }

    # A leaf note must show the inbound wiki link — this is the assertion that
    # caught the graph-id mismatch between the app and the shim.
    $getGamma = Call-Tool "get_note" @{ id = $gammaId }
    if ($getGamma.ok) {
        $backTitles = @($getGamma.data.backlinks | ForEach-Object { $_.title })
        Assert "get_note backlinks resolve Alpha + Beta for Gamma" (@(("E2E-Alpha-$stamp","E2E-Beta-$stamp") | Where-Object { $_ -in $backTitles }).Count -eq 2) ("backlinks: " + ($backTitles -join ","))
    }

    $ctx = Report "context 'E2E Alpha'" (Call-Tool "context" @{ query = "E2E-Alpha-$stamp" })
    if ($ctx.ok) {
        Assert "context returns a scored note" (@($ctx.data.notes).Count -ge 1) "no results"
        $nb = @($ctx.data.notes)[0].neighbours
        Assert "context attaches neighbours" ($null -ne $nb) "no neighbours field"
        Assert "context neighbours include resolved edges" ((@($nb.outlinks).Count + @($nb.backlinks).Count) -ge 1) ("out=" + @($nb.outlinks).Count + " back=" + @($nb.backlinks).Count)
    }

    $listTasks = Report "list_tasks" (Call-Tool "list_tasks" @{ folder = "e2e" })
    if ($listTasks.ok) {
        Assert "list_tasks sees all 3 seeded tasks" (@($listTasks.data.tasks).Count -eq 3) ("count: " + @($listTasks.data.tasks).Count)
        Assert "list_tasks sorts high priority first" (@($listTasks.data.tasks)[0].title -eq "E2E-Root-$stamp") ("first: " + @($listTasks.data.tasks)[0].title)
    }

    $overdue = Report "list_tasks overdueOnly" (Call-Tool "list_tasks" @{ overdueOnly = $true })
    if ($overdue.ok) {
        Assert "overdue filter returns the Leaf" (@($overdue.data.tasks | Where-Object { $_.title -eq "E2E-Leaf-$stamp" }).Count -eq 1) "leaf not overdue"
    }

    $getTask = Report "get_task Leaf (blocked)" (Call-Tool "get_task" @{ id = $leafId })
    if ($getTask.ok) {
        $t = $getTask.data
        Assert "leaf reports blocked=true" ($t.blocked -eq $true) ("blocked=" + $t.blocked)
        Assert "leaf blockedBy has 2 entries" (@($t.blockedBy).Count -eq 2) ("blockedBy=" + @($t.blockedBy).Count)
        Assert "leaf lists the Root as a blocker" (@($t.blockedBy | Where-Object { $_ -eq $rootId }).Count -eq 1) "root not in blockedBy"
    }

    $rootTask = Report "get_task Root (blocking)" (Call-Tool "get_task" @{ id = $rootId })
    if ($rootTask.ok) {
        Assert "root reports blocking >= 2" (@($rootTask.data.blocking).Count -ge 2) ("blocking=" + @($rootTask.data.blocking).Count)
    }

    $board = Report "task_board" (Call-Tool "task_board" @{})
    if ($board.ok) {
        Assert "task_board exposes columns" (@($board.data.PSObject.Properties.Name) -contains "columns") ("fields: " + ($board.data.PSObject.Properties.Name -join ","))
    }

    $daily = Report "daily_summary" (Call-Tool "daily_summary" @{})
    if ($daily.ok) {
        Assert "daily_summary exposes openTasks + inProgress" ((@($daily.data.PSObject.Properties.Name) -contains "openTasks") -and (@($daily.data.PSObject.Properties.Name) -contains "inProgress")) ("fields: " + ($daily.data.PSObject.Properties.Name -join ","))
    }

    $deps = Report "list_dependencies" (Call-Tool "list_dependencies" @{})
    if ($deps.ok) {
        Assert "list_dependencies has >= 3 edges" (@($deps.data.dependencies).Count -ge 3) ("edges=" + @($deps.data.dependencies).Count)
    }

    $crit = Report "critical_path to Leaf" (Call-Tool "critical_path" @{ toId = $leafId })
    if ($crit.ok) {
        Assert "critical_path chain length >= 3" ($crit.data.length -ge 3) ("length=" + $crit.data.length)
        # `chain[].id` is workspace-prefixed; compare on the resolved ref.
        Assert "critical_path ends at the Leaf" (@($crit.data.chain)[-1].id -eq ("workspace-default/" + $leafId)) ("last=" + @($crit.data.chain)[-1].id)
    }

    $graph = Report "graph_query from Alpha" (Call-Tool "graph_query" @{ id = $alphaId; depth = 1 })
    if ($graph.ok) {
        Assert "graph_query returns nodes" (@($graph.data.nodes).Count -ge 2) ("nodes=" + @($graph.data.nodes).Count)
        Assert "graph_query returns edges" (@($graph.data.edges).Count -ge 1) ("edges=" + @($graph.data.edges).Count)
    }

    $graphWiki = Report "graph_query wiki-only" (Call-Tool "graph_query" @{ id = $alphaId; depth = 2; kind = @("wiki") })
    if ($graphWiki.ok) {
        $kinds = @($graphWiki.data.edges | ForEach-Object { $_.kind } | Select-Object -Unique)
        Assert "kind filter keeps only wiki edges" (($kinds.Count -eq 0) -or ($kinds -contains "wiki" -and $kinds.Count -eq 1)) ("kinds: " + ($kinds -join ","))
    }

    # -----------------------------------------------------------------------
    Write-Host "`n-- 3. write semantics & guards --" -ForegroundColor Yellow

    $updBody = Report "update_note_body Gamma" (Call-Tool "update_note_body" @{ id = $gammaId; body = "# Gamma`n`nEdited by E2E. [[E2E-Alpha-$stamp]]" })
    Wait-Refresh
    if ($updBody.ok) {
        $reget = Call-Tool "get_note" @{ id = $gammaId }
        Assert "update_note_body persisted" ($reget.ok -and $reget.data.body -match "Edited by E2E") "body unchanged"
    }

    $cycle = Report "link_tasks cycle (refused)" (Call-Tool "link_tasks" @{ id = $rootId; dependsOn = $leafId })
    Assert "cycle rejected with dependency_cycle" ((-not $cycle.ok) -and $cycle.error -eq "dependency_cycle") ("error=" + $cycle.error)

    $self = Report "link_tasks self (refused)" (Call-Tool "link_tasks" @{ id = $rootId; dependsOn = $rootId })
    Assert "self link rejected" ((-not $self.ok) -and $self.error -eq "dependency_cycle") ("error=" + $self.error)

    $noConfirm = Report "delete_task without confirm (refused)" (Call-Tool "delete_task" @{ id = $leafId })
    Assert "missing confirm is bad_arguments" ((-not $noConfirm.ok) -and $noConfirm.error -eq "bad_arguments") ("error=" + $noConfirm.error)

    $complete = Report "complete_task Mid" (Call-Tool "complete_task" @{ id = $midId })
    Wait-Refresh
    if ($complete.ok) {
        $gt = Call-Tool "get_task" @{ id = $midId }
        Assert "complete_task set status=done" ($gt.ok -and $gt.data.status -eq "done" -and $gt.data.completed -eq $true) ("status=" + $gt.data.status)
    }

    $unlink = Report "unlink_tasks Leaf -> Root" (Call-Tool "unlink_tasks" @{ id = $leafId; dependsOn = $rootId })
    Wait-Refresh
    if ($unlink.ok) {
        $dl = Call-Tool "get_task" @{ id = $leafId }
        Assert "unlink removed one blocker" (@($dl.data.blockedBy).Count -eq 1) ("blockedBy=" + @($dl.data.blockedBy).Count)
    }

    $unknown = Report "unknown tool (refused)" (Call-Tool "does_not_exist" @{})
    Assert "unknown tool is unknown_tool" ((-not $unknown.ok) -and $unknown.error -eq "unknown_tool") ("error=" + $unknown.error)

    $badId = Report "get_note without id (refused)" (Call-Tool "get_note" @{})
    Assert "missing required arg is refused" (-not $badId.ok) "unexpectedly ok"

    $missing = Report "get_note unknown id (refused)" (Call-Tool "get_note" @{ id = "no-such-note-xyz" })
    Assert "unknown id is not_found" ((-not $missing.ok) -and $missing.error -eq "not_found") ("error=" + $missing.error)

    # -----------------------------------------------------------------------
    Write-Host "`n-- 4. cleanup --" -ForegroundColor Yellow
    if ($KeepData) {
        Write-Host "  -KeepData set; seed data left in place." -ForegroundColor DarkYellow
        Write-Host ("  notes: " + (($script:Notes.Values) -join ", "))
        Write-Host ("  tasks: " + (($script:Tasks.Values) -join ", "))
    } else {
        foreach ($nid in $script:Notes.Values) {
            $r = Call-Tool "delete_note" @{ id = $nid; confirm = $true }
            Write-Host ("  deleted note " + $nid + " : " + $r.ok)
        }
        foreach ($tid in $script:Tasks.Values) {
            $r = Call-Tool "delete_task" @{ id = $tid; confirm = $true }
            Write-Host ("  deleted task " + $tid + " : " + $r.ok)
        }
        Wait-Refresh
        $snap = Get-Content $Snapshot -Raw | ConvertFrom-Json
        $leftNotes = @($snap.notes | Where-Object { $_.id -in @($script:Notes.Values) })
        $leftTasks = @($snap.tasks | Where-Object { $_.id -in @($script:Tasks.Values) })
        Assert "no seeded notes left in snapshot" ($leftNotes.Count -eq 0) ("left=" + $leftNotes.Count)
        Assert "no seeded tasks left in snapshot" ($leftTasks.Count -eq 0) ("left=" + $leftTasks.Count)
    }
}
finally {
    if ($session) { $session.Close() }
}

# ---------------------------------------------------------------------------
$snap = Get-Content $Snapshot -Raw | ConvertFrom-Json
Write-Host "`n=== result ===" -ForegroundColor Cyan
Write-Host ("  passed : " + $script:Pass) -ForegroundColor Green
Write-Host ("  failed : " + $script:Fail) -ForegroundColor $(if ($script:Fail -gt 0) { "Red" } else { "Green" })
Write-Host ("  snapshot revision: " + $snap.revision + "  notes=" + $snap.notes.Count + " tasks=" + $snap.tasks.Count)
exit $(if ($script:Fail -gt 0) { 1 } else { 0 })
