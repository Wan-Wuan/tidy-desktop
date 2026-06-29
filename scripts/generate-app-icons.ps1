Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BuildDir = Join-Path $Root 'build'
$PublicDir = Join-Path $Root 'public'

New-Item -ItemType Directory -Force -Path $BuildDir, $PublicDir | Out-Null

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconBitmap {
  param([int]$Size)

  $scale = $Size / 512.0
  $bmp = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.ScaleTransform($scale, $scale)
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgPath = New-RoundedRectPath 0 0 512 512 112
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(76, 54),
    [System.Drawing.PointF]::new(440, 464),
    [System.Drawing.Color]::FromArgb(255, 23, 53, 50),
    [System.Drawing.Color]::FromArgb(255, 7, 19, 18)
  )
  $g.FillPath($bgBrush, $bgPath)

  $arcShadow = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(42, 200, 255, 242), 30)
  $arcShadow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcShadow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawBezier($arcShadow, 104, 379, 190, 415, 328, 416, 408, 381)

  $shadowPath = New-RoundedRectPath 102 114 308 292 58
  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(68, 0, 0, 0))
  $g.FillPath($shadowBrush, $shadowPath)

  $panelPath = New-RoundedRectPath 102 96 308 292 58
  $panelBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(128, 126),
    [System.Drawing.PointF]::new(380, 374),
    [System.Drawing.Color]::FromArgb(255, 244, 255, 252),
    [System.Drawing.Color]::FromArgb(255, 217, 238, 232)
  )
  $g.FillPath($panelBrush, $panelPath)

  $innerPath = New-RoundedRectPath 128 131 256 222 38
  $innerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 236, 250, 246))
  $g.FillPath($innerBrush, $innerPath)
  $innerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(40, 18, 59, 54), 4)
  $g.DrawPath($innerPen, $innerPath)

  foreach ($dot in @(@(158, 120, 255, 107, 95), @(188, 120, 255, 202, 88), @(218, 120, 101, 211, 110))) {
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, $dot[2], $dot[3], $dot[4]))
    $g.FillEllipse($brush, $dot[0] - 9, $dot[1] - 9, 18, 18)
    $brush.Dispose()
  }

  $tiles = @(
    @(150, 164, 88, 72, 120, 241, 216, 37, 187, 166),
    @(274, 164, 88, 72, 159, 184, 255, 78, 127, 255),
    @(150, 274, 88, 72, 255, 227, 154, 255, 181, 69),
    @(274, 274, 88, 72, 199, 255, 242, 118, 228, 199)
  )
  foreach ($tile in $tiles) {
    $path = New-RoundedRectPath $tile[0] $tile[1] $tile[2] $tile[3] 20
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.PointF]::new($tile[0], $tile[1]),
      [System.Drawing.PointF]::new($tile[0] + $tile[2], $tile[1] + $tile[3]),
      [System.Drawing.Color]::FromArgb(255, $tile[4], $tile[5], $tile[6]),
      [System.Drawing.Color]::FromArgb(255, $tile[7], $tile[8], $tile[9])
    )
    $g.FillPath($brush, $path)
    $path.Dispose()
    $brush.Dispose()
  }

  $dividerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(44, 20, 61, 57), 13)
  $dividerPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $dividerPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($dividerPen, 150, 252, 362, 252)

  $sweepPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 110, 241, 212), 24)
  $sweepPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sweepPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawBezier($sweepPen, 158, 388, 212, 433, 301, 438, 365, 400)

  $checkPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 244, 255, 252), 18)
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($checkPen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(335, 384),
    [System.Drawing.PointF]::new(375, 398),
    [System.Drawing.PointF]::new(345, 432)
  ))

  $g.Dispose()
  return $bmp
}

function Save-Png {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Get-PngBytes {
  param([System.Drawing.Bitmap]$Bitmap)
  $stream = [System.IO.MemoryStream]::new()
  $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  return $bytes
}

function Save-Ico {
  param([hashtable]$Images, [string]$Path)
  $ordered = $Images.Keys | Sort-Object {[int]$_}
  $entries = @()
  $offset = 6 + ($ordered.Count * 16)
  foreach ($size in $ordered) {
    $bytes = $Images[$size]
    $entries += [pscustomobject]@{ Size = [int]$size; Bytes = $bytes; Offset = $offset }
    $offset += $bytes.Length
  }

  $fs = [System.IO.File]::Create($Path)
  $bw = [System.IO.BinaryWriter]::new($fs)
  $bw.Write([uint16]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]$entries.Count)
  foreach ($entry in $entries) {
    $dimension = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
    $bw.Write([byte]$dimension)
    $bw.Write([byte]$dimension)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$entry.Bytes.Length)
    $bw.Write([uint32]$entry.Offset)
  }
  foreach ($entry in $entries) {
    $bw.Write([byte[]]$entry.Bytes)
  }
  $bw.Dispose()
  $fs.Dispose()
}

$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
$icoImages = @{}
foreach ($size in $iconSizes) {
  $bitmap = New-IconBitmap $size
  $icoImages[$size] = Get-PngBytes $bitmap
  if ($size -eq 256) {
    Save-Png $bitmap (Join-Path $BuildDir 'icon-256.png')
    Save-Png $bitmap (Join-Path $PublicDir 'icon-256.png')
    Save-Png $bitmap (Join-Path $PublicDir 'favicon.png')
  }
  $bitmap.Dispose()
}

Save-Ico $icoImages (Join-Path $BuildDir 'app-icon.ico')
Save-Ico $icoImages (Join-Path $BuildDir 'icon.ico')
