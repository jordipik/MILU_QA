let styleInjected = false;
let modalNode = null;
let activeResolver = null;

function ensureStyles() {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
.cta-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 14, 24, 0.55);
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.cta-modal {
  width: min(560px, 96vw);
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #d9e1ea;
  box-shadow: 0 24px 64px rgba(10, 25, 40, 0.28);
  font-family: Manrope, sans-serif;
  color: #0f172a;
}
.cta-head {
  padding: 14px 16px 8px;
  border-bottom: 1px solid #e6edf5;
}
.cta-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.cta-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 3px 10px;
}
.cta-badge--high {
  background: #fee2e2;
  color: #b91c1c;
}
.cta-badge--medium {
  background: #fff4d6;
  color: #9a6700;
}
.cta-badge--low {
  background: #dcfce7;
  color: #166534;
}
.cta-body {
  padding: 14px 16px 8px;
}
.cta-message {
  margin: 0 0 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.cta-input-label {
  display: block;
  font-size: 0.9rem;
  margin-bottom: 6px;
  font-weight: 700;
}
.cta-input {
  width: 100%;
  border: 1px solid #c7d2e0;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}
.cta-input:focus {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
.cta-hint {
  margin: 8px 0 0;
  font-size: 0.84rem;
  color: #475569;
}
.cta-foot {
  border-top: 1px solid #e6edf5;
  padding: 12px 16px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.cta-btn {
  font: inherit;
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 110px;
  cursor: pointer;
}
.cta-btn--cancel {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
}
.cta-btn--confirm {
  border: 1px solid #b91c1c;
  background: #dc2626;
  color: #ffffff;
  font-weight: 700;
}
.cta-btn--confirm:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
`;
  document.head.appendChild(style);
  styleInjected = true;
}

function ensureModal() {
  if (modalNode) return modalNode;

  const root = document.createElement('div');
  root.className = 'cta-backdrop';
  root.hidden = true;
  root.innerHTML = `
<div class="cta-modal" role="dialog" aria-modal="true" aria-labelledby="ctaTitle" aria-describedby="ctaMessage">
  <div class="cta-head">
    <h3 id="ctaTitle" class="cta-title">Confirmar accion</h3>
    <span id="ctaBadge" class="cta-badge cta-badge--high">Accion critica</span>
  </div>
  <div class="cta-body">
    <p id="ctaMessage" class="cta-message"></p>
    <label id="ctaInputLabel" class="cta-input-label" for="ctaInput"></label>
    <input id="ctaInput" class="cta-input" type="text" autocomplete="off" spellcheck="false" />
    <p id="ctaHint" class="cta-hint"></p>
  </div>
  <div class="cta-foot">
    <button id="ctaCancel" type="button" class="cta-btn cta-btn--cancel">Cancelar</button>
    <button id="ctaConfirm" type="button" class="cta-btn cta-btn--confirm" disabled>Confirmar</button>
  </div>
</div>`;

  document.body.appendChild(root);
  modalNode = root;
  return root;
}

function setBackdropVisibility(root, visible) {
  if (!(root instanceof HTMLElement)) return;
  root.hidden = !visible;
  root.setAttribute('aria-hidden', visible ? 'false' : 'true');
  root.style.display = visible ? 'flex' : 'none';
  root.style.pointerEvents = visible ? 'auto' : 'none';
}

function dangerBadgeText(level) {
  if (level === 'low') return 'Accion delicada';
  if (level === 'medium') return 'Accion sensible';
  return 'Accion critica';
}

export function confirmTypedAction(options = {}) {
  if (activeResolver) {
    return Promise.resolve(false);
  }

  ensureStyles();
  const root = ensureModal();

  const title = String(options.title || 'Confirmar accion');
  const message = String(options.message || 'Esta accion requiere confirmacion tipada.');
  const expectedText = String(options.expectedText || 'CONFIRMAR').trim();
  const confirmLabel = String(options.confirmLabel || 'Confirmar');
  const cancelLabel = String(options.cancelLabel || 'Cancelar');
  const dangerLevel = String(options.dangerLevel || 'high').toLowerCase();

  const titleEl = root.querySelector('#ctaTitle');
  const messageEl = root.querySelector('#ctaMessage');
  const badgeEl = root.querySelector('#ctaBadge');
  const inputLabelEl = root.querySelector('#ctaInputLabel');
  const hintEl = root.querySelector('#ctaHint');
  const inputEl = root.querySelector('#ctaInput');
  const cancelBtn = root.querySelector('#ctaCancel');
  const confirmBtn = root.querySelector('#ctaConfirm');
  const focusable = () => [inputEl, cancelBtn, confirmBtn].filter(Boolean);

  titleEl.textContent = title;
  messageEl.textContent = message;
  badgeEl.textContent = dangerBadgeText(dangerLevel);
  badgeEl.className = `cta-badge cta-badge--${dangerLevel === 'low' || dangerLevel === 'medium' ? dangerLevel : 'high'}`;
  inputLabelEl.textContent = `Escribe exactamente: ${expectedText}`;
  hintEl.textContent = 'La accion solo se ejecutara cuando el texto coincida al 100%.';
  inputEl.value = '';
  confirmBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  confirmBtn.disabled = true;

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setBackdropVisibility(root, true);
  setTimeout(() => inputEl.focus(), 0);

  function updateConfirmState() {
    confirmBtn.disabled = inputEl.value.trim() !== expectedText;
  }

  function finish(result) {
    if (!activeResolver) return;
    const resolver = activeResolver;
    activeResolver = null;
    setBackdropVisibility(root, false);
    inputEl.removeEventListener('input', onInput);
    cancelBtn.removeEventListener('click', onCancel);
    confirmBtn.removeEventListener('click', onConfirm);
    root.removeEventListener('click', onRootClick);
    root.removeEventListener('click', onDelegatedClick, true);
    root.removeEventListener('pointerdown', onPointerDownCapture, true);
    root.removeEventListener('keydown', onKeyDown, true);
    try {
      if (previousActive) previousActive.focus();
    } catch (_focusError) {
      // Ignorar errores de foco si el nodo previo ya no existe.
    }
    resolver(result);
  }

  function onInput() {
    updateConfirmState();
  }

  function onCancel(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    finish(false);
  }

  function onConfirm(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (confirmBtn.disabled) return;
    finish(true);
  }

  function onRootClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === root) {
      finish(false);
    }
  }

  function onDelegatedClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#ctaCancel')) {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
      return;
    }
    if (target.closest('#ctaConfirm')) {
      if (confirmBtn.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    }
  }

  function onPointerDownCapture(event) {
    // Evita que el click se "cuele" al boton que disparo el modal al cerrarlo.
    event.stopPropagation();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === 'Enter' && event.target === inputEl) {
      if (!confirmBtn.disabled) {
        event.preventDefault();
        finish(true);
      }
      return;
    }
    if (event.key === 'Tab') {
      const nodes = focusable();
      if (!nodes.length) return;
      const idx = nodes.indexOf(document.activeElement);
      const next = event.shiftKey ? idx - 1 : idx + 1;
      if (idx === -1 || next < 0 || next >= nodes.length) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    }
  }

  inputEl.addEventListener('input', onInput);
  cancelBtn.addEventListener('click', onCancel);
  confirmBtn.addEventListener('click', onConfirm);
  root.addEventListener('click', onRootClick);
  root.addEventListener('click', onDelegatedClick, true);
  root.addEventListener('pointerdown', onPointerDownCapture, true);
  root.addEventListener('keydown', onKeyDown, true);

  return new Promise((resolve) => {
    activeResolver = resolve;
  });
}

if (typeof window !== 'undefined') {
  window.confirmTypedAction = confirmTypedAction;
}