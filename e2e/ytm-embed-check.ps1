# Windows check that YouTube Music is embedded inside Vyro's main window.
# Starts a debug build against the stand-in page, lets the app open the
# YouTube Music page and press play, then saves screenshots.
#   powershell -File e2e/ytm-embed-check.ps1 -Exe src-tauri\target\debug\vyro.exe -Out e2e\screenshots
param([string]$Exe, [string]$Out = "e2e\screenshots")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$standin = Join-Path $PSScriptRoot "ytm-standin"
python (Join-Path $standin "make-audio.py") $standin
$server = Start-Process python -ArgumentList "-m", "http.server", "8765", "--bind", "127.0.0.1", "--directory", $standin -PassThru -WindowStyle Hidden

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
function Shot([string]$name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$env:VYRO_YTM_URL = "http://127.0.0.1:8765/index.html"
$env:VYRO_E2E_YTM = "1"
$app = Start-Process $Exe -PassThru
try {
  Start-Sleep -Seconds 12
  Shot "ytm-embed-1-opened.png"
  Start-Sleep -Seconds 14
  Shot "ytm-embed-2-playing.png"
  if ($app.HasExited) { throw "Vyro exited early with code $($app.ExitCode)" }
} finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
