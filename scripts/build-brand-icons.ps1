$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$brandDir = Join-Path $root 'public/branding'
$source = [System.Drawing.Image]::FromFile((Join-Path $brandDir 'nexashare-source.png'))
function Save-Icon([string]$Destination, [int]$Size, [int]$Inset = 0) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($source, $Inset, $Inset, ($Size - 2 * $Inset), ($Size - 2 * $Inset))
        $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    foreach ($size in 16, 32, 48, 128) {
        Save-Icon (Join-Path $root "chrome-extension/icons/icon$size.png") $size
    }
    foreach ($size in 16, 32, 48, 180, 192, 512) {
        Save-Icon (Join-Path $brandDir "nexashare-$size.png") $size
    }
    # Keep the complete circular logo within the PWA maskable safe zone.
    Save-Icon (Join-Path $brandDir 'nexashare-maskable-512.png') 512 64
    # ICO directory with PNG payloads at three native favicon sizes.
    $stream = [System.IO.File]::Create((Join-Path $root 'public/favicon.ico'))
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]3)
        $offset = 6 + 16 * 3
        foreach ($size in 16, 32, 48) {
            $bytes = [System.IO.File]::ReadAllBytes((Join-Path $brandDir "nexashare-$size.png"))
            $writer.Write([byte]$size); $writer.Write([byte]$size)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]$offset)
            $offset += $bytes.Length
        }
        foreach ($size in 16, 32, 48) {
            $writer.Write([System.IO.File]::ReadAllBytes((Join-Path $brandDir "nexashare-$size.png")))
        }
    } finally { $writer.Dispose(); $stream.Dispose() }
} finally { $source.Dispose() }
