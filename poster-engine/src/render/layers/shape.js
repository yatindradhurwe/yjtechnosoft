'use strict';

const { svgFill, color } = require('../util');

module.exports = async function renderShape(layer) {
  const { w, h } = layer.box;
  const s = layer._s;
  const { paint, defs } = svgFill(layer.fill ?? '#000000', `g_${layer.id.replace(/[^a-z0-9]/gi, '_')}`);
  const sw = (layer.stroke?.width || 0) * s;
  const stroke = sw ? ` stroke="${color(layer.stroke.color)}" stroke-width="${sw}"` : '';
  let body;
  if (layer.shape === 'ellipse') {
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - sw / 2}" ry="${h / 2 - sw / 2}" fill="${paint}"${stroke}/>`;
  } else if (layer.shape === 'path') {
    // The path is drawn in its own viewBox and stretched to the box (useful for wave/curve footers).
    const [vx, vy, vw, vh] = layer.viewBox || [0, 0, w, h];
    body = `<svg x="0" y="0" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="none"><path d="${layer.path}" fill="${paint}"${stroke}/></svg>`;
  } else {
    const r = Math.min((layer.radius || 0) * s, w / 2, h / 2);
    body = `<rect x="${sw / 2}" y="${sw / 2}" width="${w - sw}" height="${h - sw}" rx="${r}" ry="${r}" fill="${paint}"${stroke}/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;
  return [{ input: Buffer.from(svg), left: layer.box.x, top: layer.box.y }];
};
