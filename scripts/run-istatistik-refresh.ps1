try {
  $secRaw = npx wrangler secret get SCRAPER_API_SECRET --env production
  $secLine = ($secRaw | Select-Object -Last 1 | ForEach-Object { $_.ToString().Trim() })

  if ([string]::IsNullOrEmpty($secLine)) {
    throw "SCRAPER_API_SECRET alınamadı"
  }

  $u = "https://cadastrum-api.cadastrum-tr.workers.dev/v1/istatistik/refresh?secret=$secLine"
  $resp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri $u -TimeoutSec 240

  "refresh_status=$($resp.StatusCode)"
} catch {
  "refresh_error=$($_.Exception.Message)"
  exit 1
}

