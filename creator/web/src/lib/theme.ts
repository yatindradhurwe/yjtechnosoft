export function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch {
    /* storage unavailable */
  }
}

/** Visitor id for affiliate attribution (first-party, random, no personal data) */
export function visitorId() {
  try {
    let v = localStorage.getItem('vid');
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem('vid', v);
    }
    return v;
  } catch {
    return undefined;
  }
}

/** Convert #rrggbb into the "h s% l%" triplet used by CSS variables */
export function hexToHsl(hex: string) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return '262 83% 50%';
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
