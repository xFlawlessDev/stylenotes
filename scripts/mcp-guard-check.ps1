#requires -Version 7
<#
    Focused E2E check for the destructive guards (B5 and friends):
      - delete_workspace refuses the default workspace
      - delete_workspace refuses the last remaining workspace
      - delete_note / delete_task / delete_workspace require confirm: true
      - delete_workspace actually removes a non-default workspace

    Run after restarting the app so the host carries the current actions.

    Usage: pwsh -File scripts/mcp-guard-check.ps1
#>
param([string]$ShimPath = "")

$ErrorActionPreference = "Stop"
if (-not $ShimPath) {
    foreach ($c in @("src-tauri/target/debug/stylenotes-mcp.exe", "src-tauri/stylenotes-mcp-x86_64-pc-windows-msvc.exe")) {
        if (Test-Path $c) { $ShimPath = (Resolve-Path $c).Path; break }
    }
}
if (-not $ShimPath -or -not (Test-Path $ShimPath)) { throw "Shim binary not found." }

$script:Pass = 0
$script:Fail = 0

function Assert($name, $cond, $detail) {
    if ($cond) { $script:Pass++; Write-Host "  [PASS] $name" -ForegroundColor Green }
    else { $script:Fail++; Write-Host ("  [FAIL] " + $name + "  -> " + $detail) -ForegroundColor Red }
}

class McpSession {
    [System.Diagnostics.Process]$Proc
    [int]$NextId = 10
    McpSession([string]$exe) {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $exe
        $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
        $this.Proc = [System.Diagnostics.Process]::Start($psi)
        $this.Proc.StandardInput.Write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"guard","version":"1.0"}}}' + "`n")
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

function Call-Tool([string]$Tool, [hashtable]$ToolArgs = @{}) {
    $msg = $session.Request("tools/call", @{ name = $Tool; arguments = $ToolArgs })
    if ($msg.result.isError) {
        return @{ ok = $false; error = $msg.result.structuredContent.error; message = $msg.result.content[0].text; data = $msg.result.structuredContent }
    }
    return @{ ok = $true; data = $msg.result.structuredContent; message = "" }
}

Write-Host "`n=== MCP destructive guards ===" -ForegroundColor Cyan
$session = [McpSession]::new($ShimPath)
$tempWs = $null

try {
    Write-Host "`n-- confirm is mandatory --" -ForegroundColor Yellow

    $note = Call-Tool "create_note" @{ title = "Guard probe note"; body = "temporary" }
    $noteId = if ($note.ok) { $note.data.note.id } else { $null }

    $task = Call-Tool "create_task" @{ title = "Guard probe task" }
    $taskId = if ($task.ok) { $task.data.task.id } else { $null }

    $r = Call-Tool "delete_note" @{ id = $noteId }
    Assert "delete_note without confirm is refused" ((-not $r.ok) -and $r.error -eq "bad_arguments") ("error=" + $r.error)

    $r = Call-Tool "delete_task" @{ id = $taskId }
    Assert "delete_task without confirm is refused" ((-not $r.ok) -and $r.error -eq "bad_arguments") ("error=" + $r.error)

    $r = Call-Tool "delete_workspace" @{ id = "workspace-default" }
    Assert "delete_workspace without confirm is refused" ((-not $r.ok) -and $r.error -eq "bad_arguments") ("error=" + $r.error)

    Write-Host "`n-- default workspace is protected --" -ForegroundColor Yellow

    $r = Call-Tool "delete_workspace" @{ id = "workspace-default"; confirm = $true }
    Assert "delete_workspace refuses workspace-default" ((-not $r.ok) -and $r.error -eq "last_workspace") ("error=" + $r.error + " msg=" + $r.message)

    # Confirm it still exists after the refused call.
    $list = Call-Tool "list_workspaces" @{}
    $ids = @($list.data.workspaces | ForEach-Object { $_.id })
    Assert "workspace-default still present" ($ids -contains "workspace-default") ("ids=" + ($ids -join ","))

    Write-Host "`n-- a real workspace can still be deleted --" -ForegroundColor Yellow

    $made = Call-Tool "create_workspace" @{ name = "Guard Temp " + (Get-Date -Format "HHmmss") }
    $tempWs = if ($made.ok) { $made.data.workspace.id } else { $null }
    Assert "temp workspace created" ($made.ok -and $tempWs) ("ok=" + $made.ok)

    Start-Sleep -Seconds 3
    $r = Call-Tool "delete_workspace" @{ id = $tempWs; confirm = $true }
    Assert "delete_workspace removes a non-default workspace" ($r.ok) ("error=" + $r.error + " msg=" + $r.message)
    $tempWs = $null

    Write-Host "`n-- unknown id --" -ForegroundColor Yellow
    $r = Call-Tool "delete_workspace" @{ id = "no-such-workspace"; confirm = $true }
    Assert "delete_workspace unknown id is not_found" ((-not $r.ok) -and $r.error -eq "not_found") ("error=" + $r.error)

    # Clean up the probe note/task.
    if ($noteId) { Call-Tool "delete_note" @{ id = $noteId; confirm = $true } | Out-Null }
    if ($taskId) { Call-Tool "delete_task" @{ id = $taskId; confirm = $true } | Out-Null }
}
finally {
    if ($tempWs) { Call-Tool "delete_workspace" @{ id = $tempWs; confirm = $true } | Out-Null }
    if ($session) { $session.Close() }
}

Write-Host "`n=== result ===" -ForegroundColor Cyan
Write-Host ("  passed : " + $script:Pass) -ForegroundColor Green
Write-Host ("  failed : " + $script:Fail) -ForegroundColor $(if ($script:Fail -gt 0) { "Red" } else { "Green" })
exit $(if ($script:Fail -gt 0) { 1 } else { 0 })
