$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outPath = Join-Path $dir 'index.pck'
if (Test-Path -LiteralPath $outPath) {
    throw "index.pck already exists in $dir. Remove it first."
}
$parts = Get-ChildItem -LiteralPath $dir -Filter 'index.pck.part*' | Sort-Object Name
if ($parts.Count -eq 0) {
    throw "No index.pck.part* files found in $dir."
}
$outFs = [System.IO.File]::Create($outPath)
try {
    foreach ($part in $parts) {
        $inFs = [System.IO.File]::OpenRead($part.FullName)
        try { $inFs.CopyTo($outFs) } finally { $inFs.Close() }
    }
} finally {
    $outFs.Close()
}
Write-Output "Rejoined $($parts.Count) parts into index.pck ($((Get-Item -LiteralPath $outPath).Length) bytes)"
