param(
    [string]$VariantRoot = (Join-Path $PSScriptRoot "..\public\sprites\cat-variants")
)

Add-Type -AssemblyName System.Drawing

$generatorSource = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class CatVariantGenerator
{
    private static readonly Color CreamShadow = Parse("#A9815D");
    private static readonly Color CreamMain = Parse("#D9BD91");
    private static readonly Color CreamHighlight = Parse("#F0D9B5");
    private static readonly Color GingerShadow = Parse("#7D422C");
    private static readonly Color GingerMain = Parse("#B9683E");
    private static readonly Color GingerHighlight = Parse("#DD996C");
    private static readonly Color CalicoShadow = Parse("#302421");
    private static readonly Color CalicoMain = Parse("#40302C");
    private static readonly Color CalicoHighlight = Parse("#75635B");
    private static readonly Color SealShadow = Parse("#30231F");
    private static readonly Color SealMain = Parse("#513B34");
    private static readonly Color SealHighlight = Parse("#80665A");
    private static readonly Color IvoryShadow = Parse("#A58F70");
    private static readonly Color IvoryMain = Parse("#D8C5A3");
    private static readonly Color IvoryHighlight = Parse("#F0E2C8");
    private static readonly Color BlueShadow = Parse("#526B78");
    private static readonly Color BlueMain = Parse("#7896A8");
    private static readonly Color BlueHighlight = Parse("#A6C0CB");
    private static readonly Color SilverShadow = Parse("#595855");
    private static readonly Color SilverMain = Parse("#AAA69E");
    private static readonly Color SilverHighlight = Parse("#D5D3CC");

    public static void Convert(string sourcePath, string destinationPath, string variant)
    {
        using (var source = new Bitmap(sourcePath))
        using (var result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var pixel = source.GetPixel(x, y);
                    if (pixel.A == 0)
                    {
                        result.SetPixel(x, y, Color.Transparent);
                        continue;
                    }

                    var luminance = Luminance(pixel);
                    var replacement = pixel;
                    var pink = IsPink(pixel);
                    var warmFur = IsWarmFur(pixel);

                    if (variant == "cream" && warmFur && !pink)
                    {
                        replacement = Palette(luminance, CreamShadow, CreamMain, CreamHighlight, pixel.A);
                    }
                    else if (variant == "calico" && warmFur && !pink)
                    {
                        var charcoalPatch = (x < 92 && y > 105) ||
                            (x >= 122 && x < 190 && y < 112) ||
                            (x >= 198 && x < 258 && y < 92);
                        replacement = charcoalPatch
                            ? Palette(luminance, CalicoShadow, CalicoMain, CalicoHighlight, pixel.A)
                            : Palette(luminance, GingerShadow, GingerMain, GingerHighlight, pixel.A);
                    }
                    else if (variant == "siamese" && !pink)
                    {
                        var leftEye = x >= 214 && x <= 252 && y >= 82 && y <= 126;
                        var rightEye = x >= 274 && x <= 318 && y >= 82 && y <= 126;
                        var eye = (leftEye || rightEye) && luminance < 0.48;
                        var faceOffsetX = (x - 263d) / 66d;
                        var faceOffsetY = (y - 116d) / 47d;
                        var faceMask = faceOffsetX * faceOffsetX + faceOffsetY * faceOffsetY <= 1;
                        var darkPaws = y >= 190 && x >= 174;
                        var point = warmFur || faceMask || darkPaws;
                        if (eye)
                        {
                            replacement = Palette(Math.Max(luminance, 0.42), BlueShadow, BlueMain, BlueHighlight, pixel.A);
                        }
                        else if (point)
                        {
                            replacement = Palette(luminance, SealShadow, SealMain, SealHighlight, pixel.A);
                        }
                        else if (luminance > 0.25)
                        {
                            replacement = Palette(luminance, IvoryShadow, IvoryMain, IvoryHighlight, pixel.A);
                        }
                    }
                    else if (variant == "silver-tabby" && !pink)
                    {
                        replacement = luminance < 0.2
                            ? Color.FromArgb(pixel.A, 58, 57, 57)
                            : Palette(luminance, SilverShadow, SilverMain, SilverHighlight, pixel.A);
                    }

                    result.SetPixel(x, y, replacement);
                }
            }

            Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
            result.Save(destinationPath, ImageFormat.Png);
        }
    }

    private static Color Parse(string value)
    {
        return ColorTranslator.FromHtml(value);
    }

    private static double Luminance(Color color)
    {
        return (0.2126 * color.R + 0.7152 * color.G + 0.0722 * color.B) / 255;
    }

    private static bool IsPink(Color color)
    {
        return color.R > 145 && color.R > color.G * 1.18 && color.B > color.G * 0.72;
    }

    private static bool IsWarmFur(Color color)
    {
        var maximum = Math.Max(color.R, Math.Max(color.G, color.B));
        var minimum = Math.Min(color.R, Math.Min(color.G, color.B));
        var saturation = maximum == 0 ? 0 : (double)(maximum - minimum) / maximum;
        return saturation > 0.12 && color.R > color.G * 1.06 && color.G > color.B * 1.03;
    }

    private static Color Palette(double luminance, Color shadow, Color main, Color highlight, int alpha)
    {
        return luminance < 0.5
            ? Mix(shadow, main, (luminance - 0.16) / 0.34, alpha)
            : Mix(main, highlight, (luminance - 0.5) / 0.43, alpha);
    }

    private static Color Mix(Color from, Color to, double amount, int alpha)
    {
        amount = Math.Max(0, Math.Min(1, amount));
        return Color.FromArgb(
            alpha,
            (int)Math.Round(from.R + (to.R - from.R) * amount),
            (int)Math.Round(from.G + (to.G - from.G) * amount),
            (int)Math.Round(from.B + (to.B - from.B) * amount));
    }
}
'@

if (-not ("CatVariantGenerator" -as [type])) {
    Add-Type -TypeDefinition $generatorSource -Language CSharp -ReferencedAssemblies ([System.Drawing.Bitmap].Assembly.Location)
}

$frames = @("rest.png", "blink.png", "paw-up.png", "lick.png")
foreach ($frame in $frames) {
    [CatVariantGenerator]::Convert((Join-Path $VariantRoot "orange\$frame"), (Join-Path $VariantRoot "cream\$frame"), "cream")
    [CatVariantGenerator]::Convert((Join-Path $VariantRoot "orange\$frame"), (Join-Path $VariantRoot "calico\$frame"), "calico")
    [CatVariantGenerator]::Convert((Join-Path $VariantRoot "orange\$frame"), (Join-Path $VariantRoot "siamese\$frame"), "siamese")
    [CatVariantGenerator]::Convert((Join-Path $VariantRoot "gray\$frame"), (Join-Path $VariantRoot "silver-tabby\$frame"), "silver-tabby")
}
