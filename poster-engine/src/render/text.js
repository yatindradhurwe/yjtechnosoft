'use strict';

const sharp = require('sharp');
const { escapeXml, color } = require('./util');

const DEFAULT_FONT = 'Noto Sans';

function transform(text, mode) {
  if (mode === 'uppercase') return text.toLocaleUpperCase();
  if (mode === 'lowercase') return text.toLocaleLowerCase();
  if (mode === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toLocaleUpperCase());
  return text;
}

/**
 * Render text with Pango (via sharp/libvips). Pango shapes complex scripts such as
 * Devanagari, Tamil and Bengali correctly, which SVG text in librsvg does not always do.
 *
 * Returns { buffer, width, height, fontSize } of a transparent PNG that is no larger than maxW x maxH.
 * With fit='shrink' the text is drawn at style.fontSize, and is shrunk only when it does not fit.
 */
async function renderTextBlock(rawText, { maxW, maxH, style = {}, fit = 'shrink', maxLines, fonts = {}, fillOverride }) {
  const text = transform(rawText, style.textTransform);
  const size = style.fontSize || 32;
  const family = style.fontFamily || DEFAULT_FONT;
  const weight = style.fontWeight || 400;
  const fill = fillOverride || color(style.color, '#000000');
  const letterSpacing = style.letterSpacing ? ` letter_spacing="${Math.round(style.letterSpacing * 1024)}"` : '';
  const markup =
    `<span foreground="${fill.slice(0, 7)}" font_weight="${weight}"${style.italic ? ' font_style="italic"' : ''}${letterSpacing}` +
    `${fill.length === 9 ? ` alpha="${Math.round((parseInt(fill.slice(7), 16) / 255) * 100)}%"` : ''}>${escapeXml(text)}</span>`;
  const singleLine = maxLines === 1;
  const lineHeight = style.lineHeight ?? 1.2;

  const options = (fontSize) => ({
    text: markup,
    font: `${family} ${fontSize}`,
    fontfile: fonts[family]?.[weight] || fonts[family]?.default,
    align: style.align || 'left',
    rgba: true,
    wrap: singleLine ? 'none' : 'word-char',
    spacing: Math.round((lineHeight - 1) * fontSize),
  });

  const render = async (opts) => {
    const { data, info } = await sharp({ text: opts }).png().toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, dpi: info.textAutofitDpi };
  };

  // Pango point sizes equal pixels at 72 dpi.
  let block = await render({ ...options(size), width: singleLine ? undefined : Math.floor(maxW), dpi: 72 });
  if (fit === 'fixed' || (block.width <= maxW && block.height <= maxH)) return { ...block, fontSize: size };

  // Too big: let libvips search for the largest dpi that fits the box (fit-to-box).
  block = await render({ ...options(size), width: Math.floor(maxW), height: Math.floor(maxH) });
  const fontSize = Math.round((size * (block.dpi || 72)) / 72);
  // Autofit can grow text. Never draw larger than the requested font size.
  if (fontSize > size) block = await render({ ...options(size), width: Math.floor(maxW), dpi: 72 });
  return { ...block, fontSize: Math.min(fontSize, size) };
}

module.exports = { renderTextBlock, DEFAULT_FONT };
