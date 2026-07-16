$ErrorActionPreference = "Stop"

Write-Host "Installing Hooma Catalog Agent dependencies..."
npm install
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env. Add the token shown in Hooma Admin -> Catalog Agent."
}
Write-Host "Installation complete. Run .\run.ps1 after editing .env."

