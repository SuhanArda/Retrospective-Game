param(
  [string]$Source = (Join-Path $PSScriptRoot '..\public\assets\characters-strip.png'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\public\assets\characters')
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteCleaner
{
    public static void KeepLargestConnectedShape(Bitmap bitmap)
    {
        var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        try
        {
            var bytes = new byte[Math.Abs(data.Stride) * data.Height];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            var visited = new bool[bitmap.Width * bitmap.Height];
            var largest = new List<int>();
            var queue = new Queue<int>();

            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var start = y * bitmap.Width + x;
                    if (visited[start] || bytes[y * data.Stride + x * 4 + 3] == 0) continue;
                    var component = new List<int>();
                    visited[start] = true;
                    queue.Enqueue(start);

                    while (queue.Count > 0)
                    {
                        var current = queue.Dequeue();
                        component.Add(current);
                        var currentX = current % bitmap.Width;
                        var currentY = current / bitmap.Width;
                        for (var offsetY = -1; offsetY <= 1; offsetY++)
                        {
                            for (var offsetX = -1; offsetX <= 1; offsetX++)
                            {
                                if (offsetX == 0 && offsetY == 0) continue;
                                var nextX = currentX + offsetX;
                                var nextY = currentY + offsetY;
                                if (nextX < 0 || nextX >= bitmap.Width || nextY < 0 || nextY >= bitmap.Height) continue;
                                var next = nextY * bitmap.Width + nextX;
                                if (visited[next] || bytes[nextY * data.Stride + nextX * 4 + 3] == 0) continue;
                                visited[next] = true;
                                queue.Enqueue(next);
                            }
                        }
                    }

                    if (component.Count > largest.Count) largest = component;
                }
            }

            var keep = new bool[bitmap.Width * bitmap.Height];
            foreach (var pixel in largest) keep[pixel] = true;
            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    if (!keep[y * bitmap.Width + x]) bytes[y * data.Stride + x * 4 + 3] = 0;
                }
            }
            Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

$segments = @(
  @{ Name = 'character-01-explorer.png'; Left = 0; Width = 235 },
  @{ Name = 'character-02-lion.png'; Left = 235; Width = 175 },
  @{ Name = 'character-03-princess.png'; Left = 420; Width = 205; Erase = @(@{ X = 0; Y = 0; Width = 65; Height = 420 }) },
  @{ Name = 'character-04-wizard.png'; Left = 625; Width = 230; Erase = @(@{ X = 0; Y = 0; Width = 65; Height = 420 }) },
  @{ Name = 'character-05-dreamer.png'; Left = 855; Width = 173 },
  @{ Name = 'character-06-fox.png'; Left = 1028; Width = 237; Erase = @(
      @{ X = 0; Y = 0; Width = 78; Height = 300 },
      @{ X = 0; Y = 300; Width = 60; Height = 120 }
    )
  },
  @{ Name = 'character-07-fairy.png'; Left = 1265; Width = 280; MirrorOuterWing = $true; Erase = @(
      @{ X = 0; Y = 0; Width = 28; Height = 420 },
      @{ X = 240; Y = 0; Width = 80; Height = 420 }
    )
  },
  @{ Name = 'character-08-elf.png'; Left = 1545; Width = 205; Erase = @(
      @{ X = 0; Y = 0; Width = 58; Height = 420 },
      @{ X = 290; Y = 0; Width = 30; Height = 420 }
    )
  },
  @{ Name = 'character-09-pirate.png'; Left = 1750; Width = 230; Erase = @(@{ X = 278; Y = 0; Width = 42; Height = 420 }) },
  @{ Name = 'character-10-prince.png'; Left = 1980; Width = 192 }
)

$canvasWidth = 320
$canvasHeight = 420
$sourceTop = 120

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$strip = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))

try {
  foreach ($segment in $segments) {
    $canvas = New-Object System.Drawing.Bitmap $canvasWidth, $canvasHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $destinationX = [Math]::Floor(($canvasWidth - $segment.Width) / 2)
      $destinationRectangle = New-Object System.Drawing.Rectangle $destinationX, 0, $segment.Width, $canvasHeight
      $sourceRectangle = New-Object System.Drawing.Rectangle $segment.Left, $sourceTop, $segment.Width, $canvasHeight
      $graphics.DrawImage($strip, $destinationRectangle, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally {
      $graphics.Dispose()
    }
    try {
      [SpriteCleaner]::KeepLargestConnectedShape($canvas)
      if ($segment.Erase) {
        $eraser = [System.Drawing.Graphics]::FromImage($canvas)
        try {
          $eraser.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
          foreach ($area in $segment.Erase) {
            $eraser.FillRectangle(
              [System.Drawing.Brushes]::Transparent,
              (New-Object System.Drawing.Rectangle $area.X, $area.Y, $area.Width, $area.Height)
            )
          }
        }
        finally {
          $eraser.Dispose()
        }
      }
      if ($segment.MirrorOuterWing) {
        foreach ($x in 28..79) {
          foreach ($y in 0..($canvasHeight - 1)) {
            $pixel = $canvas.GetPixel($x, $y)
            $canvas.SetPixel(($canvasWidth - 1 - $x), $y, $pixel)
          }
        }
      }
      $outputPath = Join-Path $Destination $segment.Name
      $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $canvas.Dispose()
    }
  }
}
finally {
  $strip.Dispose()
}
