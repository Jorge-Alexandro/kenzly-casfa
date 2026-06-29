# Sube las variables de entorno de .env.local a Vercel (production, preview,
# development). Ejecútalo DESPUÉS de `vercel login` y `vercel link`.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\vercel-env.ps1

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path $envFile)) { throw ".env.local no encontrado" }

$targets = @("production", "preview", "development")

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()

  foreach ($t in $targets) {
    Write-Host "→ $key ($t)"
    # Quita la variable si ya existe (ignora error si no existe) y la re-agrega.
    try { & vercel env rm $key $t --yes 2>$null } catch {}
    $val | & vercel env add $key $t
  }
}
Write-Host "`nListo. Variables subidas. Ahora: vercel --prod"
