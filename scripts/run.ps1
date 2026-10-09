param([ValidateSet('dev','test','package')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
$blokkyRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $blokkyRoot
if (Test-Path -LiteralPath '.tools/cargo/bin/cargo.exe') {
    $env:CARGO_HOME = Join-Path $blokkyRoot '.tools/cargo'
    $env:RUSTUP_HOME = Join-Path $blokkyRoot '.tools/rustup'
    $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
}
switch ($Task) {
    'dev' { npm.cmd run desktop }
    'test' {
        npm.cmd test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
    }
    'package' { npm.cmd run package }
}
exit $LASTEXITCODE
