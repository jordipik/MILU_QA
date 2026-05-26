let toastStylesInjected = false;
let toastContainer = null;
const activeToastKeys = new Map();

function ensureToastStyles() {
    if (toastStylesInjected || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
.milu-toast-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 12500;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(380px, calc(100vw - 24px));
  pointer-events: none;
}
.milu-toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: start;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
  border: 1px solid transparent;
  color: #0f172a;
  background: #f8fafc;
  font-family: Manrope, sans-serif;
  transform: translateY(-8px);
  opacity: 0;
  transition: opacity 160ms ease, transform 160ms ease;
}
.milu-toast--visible {
  transform: translateY(0);
  opacity: 1;
}
.milu-toast__text {
  margin: 0;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}
.milu-toast__close {
  border: 1px solid rgba(15, 23, 42, 0.18);
  background: transparent;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  color: inherit;
  font-weight: 700;
}
.milu-toast--success {
  background: #ecfdf3;
  border-color: #86efac;
  color: #14532d;
}
.milu-toast--error {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #7f1d1d;
}
.milu-toast--warning {
  background: #fffbeb;
  border-color: #fde68a;
  color: #78350f;
}
.milu-toast--info {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1e3a8a;
}
`;
    document.head.appendChild(style);
    toastStylesInjected = true;
}

function ensureContainer() {
    if (typeof document === 'undefined') return null;
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;

    ensureToastStyles();
    toastContainer = document.createElement('div');
    toastContainer.className = 'milu-toast-stack';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
    return toastContainer;
}

function normalizeType(type) {
    const allowed = new Set(['success', 'error', 'warning', 'info']);
    const normalized = String(type || 'info').trim().toLowerCase();
    return allowed.has(normalized) ? normalized : 'info';
}

export function showToast(message, type = 'info', options = {}) {
    const text = String(message ?? '').trim();
    if (!text) return;

    const container = ensureContainer();
    if (!container) {
        console.log(`[toast:${normalizeType(type)}] ${text}`);
        return;
    }

    const variant = normalizeType(type);
    const duration = Number.isFinite(options.duration) ? Math.max(1200, Number(options.duration)) : 4200;
    const dedupeWindowMs = Number.isFinite(options.dedupeWindowMs) ? Math.max(0, Number(options.dedupeWindowMs)) : 1800;
    const key = `${variant}::${text}`;
    const now = Date.now();
    const previousTs = activeToastKeys.get(key);
    if (previousTs && now - previousTs < dedupeWindowMs) {
        return;
    }
    activeToastKeys.set(key, now);

    const toast = document.createElement('div');
    toast.className = `milu-toast milu-toast--${variant}`;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');

    const textNode = document.createElement('p');
    textNode.className = 'milu-toast__text';
    textNode.textContent = text;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'milu-toast__close';
    closeButton.setAttribute('aria-label', 'Cerrar notificación');
    closeButton.textContent = 'x';

    toast.appendChild(textNode);
    toast.appendChild(closeButton);
    container.appendChild(toast);

    const removeToast = () => {
        toast.classList.remove('milu-toast--visible');
        setTimeout(() => {
            toast.remove();
            if (activeToastKeys.get(key) === now) {
                activeToastKeys.delete(key);
            }
        }, 180);
    };

    const timer = setTimeout(removeToast, duration);
    closeButton.addEventListener('click', () => {
        clearTimeout(timer);
        removeToast();
    });

    requestAnimationFrame(() => toast.classList.add('milu-toast--visible'));
}

if (typeof window !== 'undefined') {
    window.showToast = showToast;
}