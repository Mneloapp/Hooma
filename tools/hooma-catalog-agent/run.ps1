$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  throw ".env is missing. Copy .env.example to .env and add HOOMA_AGENT_TOKEN."
}

Get-Content ".env" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
  }
}

npm start

