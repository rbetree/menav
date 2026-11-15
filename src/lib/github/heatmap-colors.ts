type Rgb = {
  r: number;
  g: number;
  b: number;
};

type HeatmapPalette = {
  dark: string[];
  light: string[];
};

const DEFAULT_HEATMAP_RGB: Rgb = { r: 0x37, g: 0xb2, b: 0x4d };

// 目标相对亮度按卡片背景预留余量：深色 level 1 对 #1e1c1a 约 3.4:1，浅色 level 1 对 #e9e9e4 约 3.2:1。
const DARK_LEVEL_LUMINANCE = [0.16, 0.24, 0.34, 0.48];
const LIGHT_LEVEL_LUMINANCE = [0.22, 0.16, 0.11, 0.07];
// 空格子只做弱提示，不参与数据层级对比度要求。
const DARK_LEVEL_ZERO = 'rgba(255, 255, 255, 0.08)';
const LIGHT_LEVEL_ZERO = '#d8dee4';

function parseHexColor(input: unknown): Rgb | null {
  const raw = String(input ?? '')
    .trim()
    .replace(/^#/, '');
  const hex =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => char + char)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

// 在 sRGB 通道上按比例混合，保留输入色的色相，只改变明暗。
function mixColor(rgb: Rgb, targetChannel: number, ratio: number): Rgb {
  return {
    r: rgb.r + (targetChannel - rgb.r) * ratio,
    g: rgb.g + (targetChannel - rgb.g) * ratio,
    b: rgb.b + (targetChannel - rgb.b) * ratio,
  };
}

function mixToLuminance(rgb: Rgb, targetLuminance: number): Rgb {
  const towardWhite = relativeLuminance(rgb) < targetLuminance;
  const targetChannel = towardWhite ? 255 : 0;
  let low = 0;
  let high = 1;

  for (let step = 0; step < 40; step += 1) {
    const ratio = (low + high) / 2;
    const luminance = relativeLuminance(mixColor(rgb, targetChannel, ratio));
    const needsMoreMix = towardWhite ? luminance < targetLuminance : luminance > targetLuminance;
    if (needsMoreMix) low = ratio;
    else high = ratio;
  }

  return mixColor(rgb, targetChannel, (low + high) / 2);
}

function toHex(rgb: Rgb): string {
  const channel = (value: number): string => Math.round(value).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function buildLevelPalette(rgb: Rgb, targets: number[], levelZero: string): string[] {
  return [levelZero, ...targets.map((target) => toHex(mixToLuminance(rgb, target)))];
}

function buildHeatmapPalette(input: unknown): HeatmapPalette {
  const rgb = parseHexColor(input) ?? DEFAULT_HEATMAP_RGB;

  return {
    dark: buildLevelPalette(rgb, DARK_LEVEL_LUMINANCE, DARK_LEVEL_ZERO),
    light: buildLevelPalette(rgb, LIGHT_LEVEL_LUMINANCE, LIGHT_LEVEL_ZERO),
  };
}

export { buildHeatmapPalette };
export type { HeatmapPalette };
