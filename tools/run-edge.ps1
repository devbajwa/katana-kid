param([string]$Hash = 'selftest', [int]$Budget = 60000, [string]$Shot = '')
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$file = (Resolve-Path (Join-Path $PSScriptRoot '..\samurai-combatt.html')).Path -replace '\\', '/'
$url = "file:///$file#$Hash"
$prof = Join-Path $env:TEMP ('edgeprof_' + [guid]::NewGuid())
$args = @('--headless=new', '--disable-gpu', '--no-first-run', '--autoplay-policy=no-user-gesture-required', "--user-data-dir=$prof",
          '--enable-logging=stderr', '--v=0', "--virtual-time-budget=$Budget", '--window-size=1440,810')
if ($Shot) { $args += "--screenshot=$Shot" } else { $args += '--dump-dom' }
$args += $url
$p = Start-Process -FilePath $edge -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardError "$prof.err" -RedirectStandardOutput "$prof.out"
Get-Content "$prof.err" | Where-Object { $_ -match 'CONSOLE|harness|Uncaught|Error' } | ForEach-Object { ($_ -replace '^.*?CONSOLE\(\d+\)\] ', '') }
Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
