# Concatenates src/ parts into the single deliverable file samurai-combatt.html
$src = Join-Path $PSScriptRoot 'src'
$out = Join-Path $PSScriptRoot 'samurai-combatt.html'
$parts = Get-ChildItem $src | Sort-Object Name | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }
[IO.File]::WriteAllText($out, ($parts -join "`n"), (New-Object Text.UTF8Encoding($false)))
Write-Output "Built $out ($((Get-Item $out).Length) bytes)"
