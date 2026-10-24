// Shared UI helpers: HTML escaping, toasts, confirm dialog.
// Every dynamic string interpolated into innerHTML MUST go through esc().

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export const isUuid = v =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function toast(message, type = 'ok') {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 4000);
}

// Accessible confirmation using native <dialog> (focus trap + Esc handled by the browser).
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `
      <h2 id="dlg-title" style="font-size:1.25rem"></h2>
      <p class="dlg-msg"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-r="0">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : ''}" data-r="1"></button>
      </div>`;
    dlg.querySelector('#dlg-title').textContent = title;
    dlg.querySelector('.dlg-msg').textContent = message;
    dlg.querySelector('[data-r="1"]').textContent = confirmLabel;
    dlg.addEventListener('click', e => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r !== undefined) dlg.close(r);
    });
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === '1'); dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export const stateLoading = (label = 'Loading…') =>
  `<div class="state" role="status"><div class="spinner" aria-hidden="true"></div>${esc(label)}</div>`;
export const stateEmpty = msg => `<div class="state">${esc(msg)}</div>`;
export const stateError = msg => `<div class="state state-error" role="alert">${esc(msg)}</div>`;

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
