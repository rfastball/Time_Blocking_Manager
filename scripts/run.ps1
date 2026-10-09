param(
    [ValidateSet('dev','test','package')][string]$Task = 'dev',
    [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$blokkyExitCode = 1
try {
    $blokkyRoot = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $blokkyRoot
    if (Test-Path -LiteralPath '.tools/cargo/bin/cargo.exe') {
        $env:CARGO_HOME = Join-Path $blokkyRoot '.tools/cargo'
        $env:RUSTUP_HOME = Join-Path $blokkyRoot '.tools/rustup'
        $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
    }
    if ($Task -eq 'dev') {
        $blokkyDebugExe = Join-Path $blokkyRoot 'src-tauri/target/debug/blokky.exe'
        $blokkyRunning = Get-Process -Name blokky -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -eq $blokkyDebugExe }
        if ($blokkyRunning) {
            throw 'BLOKKY 개발 앱이 실행 중이어서 빌드 파일을 교체할 수 없습니다. 작성 중인 내용을 저장하고, 작업 표시줄 알림 영역의 BLOKKY 아이콘에서 [종료]를 누른 뒤 다시 실행하세요. 창의 X는 트레이로 숨기기만 합니다.'
        }
    }
    switch ($Task) {
        'dev' { npm.cmd run desktop }
        'test' {
            npm.cmd test
            if ($LASTEXITCODE -eq 0) {
                cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
            }
        }
        'package' { npm.cmd run package }
    }
    $blokkyExitCode = $LASTEXITCODE
    if ($blokkyExitCode -ne 0) {
        Write-Host "`nBLOKKY $Task 실행 실패 (종료 코드 $blokkyExitCode). 위 오류를 확인하세요." -ForegroundColor Red
    }
} catch {
    Write-Host "`nBLOKKY 실행 실패: $($_.Exception.Message)" -ForegroundColor Red
}
if ($blokkyExitCode -ne 0 -and -not $NoPause -and -not [Console]::IsInputRedirected) {
    [void](Read-Host 'Enter를 누르면 창을 닫습니다')
}
exit $blokkyExitCode
