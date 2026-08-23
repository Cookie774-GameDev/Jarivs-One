param(
  [string]$ProjectRef = 'tipeobvisjqvpbzcpckh',
  [string]$WorkerBaseUrl = 'https://vibespace-wallpaper-delivery.vibespace-viper.workers.dev'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $repoRoot 'workers\wallpaper-delivery'
$workerConfig = Join-Path $workerDir 'wrangler.jsonc'
$manifestPath = Join-Path $repoRoot 'scripts\wallpaper-master-manifest.generated.json'
$secretBytes = New-Object byte[] 48
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($secretBytes)
} finally {
  $random.Dispose()
}
$signingSecret = [Convert]::ToBase64String($secretBytes)
$secretFile = Join-Path ([IO.Path]::GetTempPath()) (
  'vibespace-wallpaper-secret-' + [Guid]::NewGuid().ToString('N') + '.json'
)

try {
  [IO.File]::WriteAllText(
    $secretFile,
    (@{ WALLPAPER_DELIVERY_SIGNING_SECRET = $signingSecret } | ConvertTo-Json -Compress)
  )
  & npx --prefix $workerDir wrangler secret bulk $secretFile --config $workerConfig | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'cloudflare_secret_update_failed' }

  & npx --yes supabase@latest secrets set --project-ref $ProjectRef `
    "WALLPAPER_DELIVERY_SIGNING_SECRET=$signingSecret" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'supabase_secret_update_failed' }

  # Allow the new Worker secret version to reach the edge before checking grants.
  Start-Sleep -Seconds 8
  $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
  $env:VIBESPACE_WALLPAPER_VERIFY_SECRET = $signingSecret
  try {
    $grantJson = & node -e @'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [manifestPath, baseUrl] = process.argv.slice(1);
const secret = process.env.VIBESPACE_WALLPAPER_VERIFY_SECRET;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expires = Math.floor(Date.now() / 1000) + 120;
const grants = manifest.objects.map((item) => {
  const payload = ['v1', item.storagePath, item.id, item.sha256, String(expires)].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    slug: item.slug,
    url: `${baseUrl}/v1/wallpapers/${item.slug}/master.mp4?expires=${expires}&wallpaper_id=${item.id}&sha256=${item.sha256}&signature=${signature}`,
  };
});
process.stdout.write(JSON.stringify(grants));
'@ $manifestPath $WorkerBaseUrl
    if ($LASTEXITCODE -ne 0) { throw 'local_grant_generation_failed' }
  } finally {
    Remove-Item Env:VIBESPACE_WALLPAPER_VERIFY_SECRET -ErrorAction SilentlyContinue
  }
  $grantBySlug = @{}
  foreach ($grant in ($grantJson | ConvertFrom-Json)) { $grantBySlug[$grant.slug] = $grant.url }
  $verified = 0
  foreach ($item in $manifest.objects) {
    $requestUrl = $grantBySlug[$item.slug]
    $headerText = & curl.exe --silent --show-error --head `
      --header 'Origin: http://tauri.localhost' $requestUrl
    if ($LASTEXITCODE -ne 0) { throw "remote_request_failed:$($item.slug)" }
    $statusMatches = [regex]::Matches(($headerText -join "`n"), '(?im)^HTTP/\S+\s+(\d{3})')
    $statusCode = if ($statusMatches.Count) {
      [int]$statusMatches[$statusMatches.Count - 1].Groups[1].Value
    } else { 0 }
    $lengthMatch = [regex]::Match(($headerText -join "`n"), '(?im)^content-length:\s*(\d+)')
    $hashMatch = [regex]::Match(($headerText -join "`n"), '(?im)^x-vibespace-sha256:\s*([0-9a-f]{64})')
    $actualBytes = if ($lengthMatch.Success) { [int64]$lengthMatch.Groups[1].Value } else { 0 }
    $actualHash = if ($hashMatch.Success) { $hashMatch.Groups[1].Value } else { '' }
    if (
      $statusCode -ne 200 -or
      $actualBytes -ne [int64]$item.sizeBytes -or
      $actualHash -ne $item.sha256
    ) {
      throw "remote_object_verification_failed:$($item.slug):status=${statusCode}:bytes=${actualBytes}:hash_present=$($hashMatch.Success)"
    }
    $verified += 1
  }

  $firstGrantUrl = $grantBySlug[$manifest.objects[0].slug]
  $rangeResult = & curl.exe --silent --show-error --range '0-1023' --output NUL `
    --write-out '%{http_code}:%{size_download}' `
    --header 'Origin: http://tauri.localhost' $firstGrantUrl
  if ($LASTEXITCODE -ne 0 -or $rangeResult -ne '206:1024') {
    throw "remote_range_verification_failed:$rangeResult"
  }

  Write-Output "Verified $verified remote wallpaper objects totaling $($manifest.totalBytes) bytes, plus a 1 KiB signed range request."
} finally {
  if (Test-Path -LiteralPath $secretFile) {
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $resolvedSecret = [IO.Path]::GetFullPath($secretFile)
    if ($resolvedSecret.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedSecret -Force
    }
  }
}
