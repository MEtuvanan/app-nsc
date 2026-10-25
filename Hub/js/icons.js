/**
 * icons.js — SVG icon utility
 * Usage: icon('camera', 20) → '<svg class="ic" ...><use href="...#i-camera"></svg>'
 * Import this anywhere HTML strings are built to replace emoji with crisp SVG icons.
 */

const SPRITE = '/assets/icons/sprite.svg';

/**
 * Returns an inline SVG <use> string for a named icon.
 * @param {string} name   - icon id without "i-" prefix (e.g. 'camera', 'pin')
 * @param {number} size   - width & height in px (default 18)
 * @param {string} cls    - extra CSS classes (default '')
 * @param {string} label  - aria-label if not decorative (default '' = aria-hidden)
 */
export function icon(name, size = 18, cls = '', label = '') {
  const ariaAttr = label
    ? `role="img" aria-label="${label}"`
    : `aria-hidden="true"`;
  const classes = ['ic', cls].filter(Boolean).join(' ');
  return `<svg class="${classes}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ${ariaAttr} focusable="false"><use href="${SPRITE}#i-${name}"></use></svg>`;
}

/**
 * Convenience map — use these instead of emoji throughout the app.
 * ic.camera(20) === icon('camera', 20)
 */
export const ic = new Proxy({}, {
  get: (_, name) => (size = 18, cls = '', label = '') => icon(name, size, cls, label)
});
