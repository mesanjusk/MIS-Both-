param(
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$ProtocolName = "misfile"
$InstallDir = Join-Path $env:LOCALAPPDATA "MISLocalFileOpener"
$HandlerPath = Join-Path $InstallDir "Open-MISLocalPath.ps1"
$ProtocolKey = "HKCU:\Software\Classes\$ProtocolName"

if ($Uninstall) {
  if (Test-Path $ProtocolKey) {
    Remove-Item $ProtocolKey -Recurse -Force
  }
  if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
  }
  Write-Host "MIS local file opener removed." -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$handler = @'
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$ProtocolUrl
)

$ErrorActionPreference = "Stop"

function Get-QueryValue {
  param([string]$Query, [string]$Name)

  foreach ($pair in ($Query.TrimStart("?") -split "&")) {
    if (-not $pair) { continue }
    $parts = $pair -split "=", 2
    if ($parts.Count -ne 2) { continue }
    if ($parts[0] -eq $Name) {
      return [System.Uri]::UnescapeDataString($parts[1])
    }
  }

  return $null
}

try {
  $uri = [System.Uri]$ProtocolUrl
  if ($uri.Scheme -ne "misfile") { exit 2 }

  $target = Get-QueryValue -Query $uri.Query -Name "path"
  $select = (Get-QueryValue -Query $uri.Query -Name "select") -eq "1"

  if ([string]::IsNullOrWhiteSpace($target)) { exit 3 }
  if ($target -match "[\x00-\x1F]") { exit 4 }

  # Only allow normal Windows drive paths or UNC/network-share paths.
  $isUnc = $target.StartsWith("\\")
  $isDrivePath = $target -match "^[A-Za-z]:\\"
  if (-not ($isUnc -or $isDrivePath)) { exit 5 }

  if (-not (Test-Path -LiteralPath $target)) {
    # The synced file may not have appeared yet. Open its existing parent folder
    # instead, so the user lands in the right LAN location rather than in Drive.
    $parent = Split-Path -LiteralPath $target -Parent
    if ($parent -and (Test-Path -LiteralPath $parent)) {
      Start-Process explorer.exe -ArgumentList ('"' + $parent + '"')
      exit 0
    }
    exit 6
  }

  if ($select -and (Test-Path -LiteralPath $target -PathType Leaf)) {
    Start-Process explorer.exe -ArgumentList ('/select,"' + $target + '"')
  } else {
    Start-Process explorer.exe -ArgumentList ('"' + $target + '"')
  }
} catch {
  exit 10
}
'@

Set-Content -Path $HandlerPath -Value $handler -Encoding UTF8

$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Command = "`"$PowerShellExe`" -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$HandlerPath`" `"%1`""

New-Item -Path $ProtocolKey -Force | Out-Null
Set-Item -Path $ProtocolKey -Value "URL:MIS Local File Opener"
New-ItemProperty -Path $ProtocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$IconKey = Join-Path $ProtocolKey "DefaultIcon"
New-Item -Path $IconKey -Force | Out-Null
Set-Item -Path $IconKey -Value "$env:SystemRoot\explorer.exe,0"

$CommandKey = Join-Path $ProtocolKey "shell\open\command"
New-Item -Path $CommandKey -Force | Out-Null
Set-Item -Path $CommandKey -Value $Command

Write-Host ""
Write-Host "MIS local file opener installed successfully." -ForegroundColor Green
Write-Host "Chrome/Edge can now open misfile:// links in Windows File Explorer."
Write-Host "Install this once on every Windows PC that will use the Bills local-file button."
