# Deploys the three edge functions to Supabase.
#
# Prerequisite: a personal access token from
#   https://supabase.com/dashboard/account/tokens
# Run once per terminal session:
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."

$ErrorActionPreference = "Stop"
$env:Path = "C:\Users\pgarnier\node-portable\node-v22.20.0-win-x64;$env:Path"
Set-Location $PSScriptRoot

$ref = "ihtcmemyrwejeetybepg"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "SUPABASE_ACCESS_TOKEN is not set." -ForegroundColor Red
  Write-Host "Create one at https://supabase.com/dashboard/account/tokens, then run:"
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."'
  exit 1
}

# stripe-webhook is called by Stripe, which has no Supabase JWT — it must skip
# JWT verification or every webhook delivery returns 401 and subscriptions
# never sync. The other two are called from the app with a logged-in session.
$functions = @(
  @{ name = "create-subscription"; noJwt = $false },
  @{ name = "ai-match";            noJwt = $false },
  @{ name = "stripe-webhook";      noJwt = $true  }
)

foreach ($fn in $functions) {
  Write-Host "`nDeploying $($fn.name)..." -ForegroundColor Cyan
  $args = @("--yes", "supabase@latest", "functions", "deploy", $fn.name, "--project-ref", $ref)
  if ($fn.noJwt) { $args += "--no-verify-jwt" }
  & npx @args
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy $($fn.name)" -ForegroundColor Red
    exit 1
  }
}

Write-Host "`nAll three functions deployed." -ForegroundColor Green
Write-Host "Next: set ANTHROPIC_API_KEY and STRIPE_WEBHOOK_SECRET in"
Write-Host "Supabase - Edge Functions - Secrets."
