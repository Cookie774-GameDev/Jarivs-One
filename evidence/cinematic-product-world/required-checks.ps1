$ErrorActionPreference = 'Continue'
$report = @()
function Run-Check($name, $command) {
    & $command *> "evidence/cinematic-product-world/$name.txt"
    $script:report += [pscustomobject]@{name=$name;exitCode=$LASTEXITCODE;timestamp=(Get-Date).ToString('o')}
    $script:report | ConvertTo-Json | Set-Content evidence/cinematic-product-world/required-results.json
}
Run-Check 'typecheck' { npm run typecheck }
Run-Check 'app-tests-limited' { npm --prefix app run test -- --maxWorkers=1 }
Run-Check 'release-manifest' { npm run test:release-manifest }
Run-Check 'build' { npm run build }
Run-Check 'cargo-check' { cargo check --manifest-path app/src-tauri/Cargo.toml }
Run-Check 'website-tests' { node --test site/tests/*.test.mjs }
