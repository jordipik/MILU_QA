const ALL_BOOKS_VALUE = '__ALL_BOOKS__';

const refs = {
    bookSelect: document.getElementById('bookSelect'),
    idInput: document.getElementById('idInput'),
    scopeSummary: document.getElementById('scopeSummary'),
    status: document.getElementById('recomputeSimpleStatus'),
    logPanel: document.getElementById('recomputeSimpleLogPanel'),
    btnImportPdf: document.getElementById('btnImportPdf'),
    btnFinal: document.getElementById('btnFinal'),
    btnErrors: document.getElementById('btnErrors'),
    btnStatuses: document.getElementById('btnStatuses'),
    btnClearPdfFinal: document.getElementById('btnClearPdfFinal'),
    btnClearLog: document.getElementById('btnClearLog')
};

const engineFileByModel = new Map();
const actionButtons = [
    refs.btnImportPdf,
    refs.btnFinal,
    refs.btnErrors,
    refs.btnStatuses,
    refs.btnClearPdfFinal
].filter((node) => node instanceof HTMLButtonElement);

let logLines = [];

function normalizeText(value) {
    return String(value == null ? '' : value).trim();
}

function nowTag() {
    return new Date().toLocaleTimeString('es-ES', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function setStatus(message, level = '') {
    if (!(refs.status instanceof HTMLElement)) return;
    refs.status.classList.remove('is-ok', 'is-error', 'is-warning');
    if (level === 'ok') refs.status.classList.add('is-ok');
    if (level === 'error') refs.status.classList.add('is-error');
    if (level === 'warning') refs.status.classList.add('is-warning');
    refs.status.textContent = message;
}

function appendLog(message, extra = null) {
    const line = `[${nowTag()}] ${message}`;
    logLines.push(line);

    if (extra != null) {
        if (typeof extra === 'string') {
            logLines.push(extra);
        } else {
            try {
                logLines.push(JSON.stringify(extra, null, 2));
            } catch (_error) {
                logLines.push(String(extra));
            }
        }
    }

    if (logLines.length > 400) {
        logLines = logLines.slice(logLines.length - 400);
    }

    if (refs.logPanel instanceof HTMLElement) {
        refs.logPanel.textContent = logLines.join('\n');
        refs.logPanel.scrollTop = refs.logPanel.scrollHeight;
    }
}

function setBusy(isBusy) {
    actionButtons.forEach((button) => {
        button.disabled = Boolean(isBusy);
    });
}

function getScope() {
    const selected = refs.bookSelect instanceof HTMLSelectElement
        ? normalizeText(refs.bookSelect.value)
        : ALL_BOOKS_VALUE;
    const id = refs.idInput instanceof HTMLInputElement ? normalizeText(refs.idInput.value) : '';
    const isAll = !selected || selected === ALL_BOOKS_VALUE;
    const model = isAll ? '' : selected;
    const file = model ? (engineFileByModel.get(model) || `engine_${model}.json`) : '';

    return { isAll, model, file, id };
}

function renderScopeSummary() {
    if (!(refs.scopeSummary instanceof HTMLElement)) return;
    const scope = getScope();
    const scopeLabel = scope.isAll ? 'Todos los libros' : `Libro: ${scope.model}`;
    const idLabel = scope.id ? ` | ID: ${scope.id}` : ' | ID: (vacío)';
    refs.scopeSummary.textContent = `Alcance actual: ${scopeLabel}${idLabel}`;
}

function showIdIgnoredWarning(reason) {
    const message = `ID puntual no aplica para ${reason}. Se continúa por libro/todos.`;
    setStatus(message, 'warning');
    appendLog(`[AVISO] ${message}`);
}

function requestTypedConfirmation(message, expectedToken) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(8,14,24,0.6)',
            'z-index:13000',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:14px'
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
            'width:min(520px,96vw)',
            'background:#fff',
            'border-radius:12px',
            'border:1px solid #d3deea',
            'box-shadow:0 20px 60px rgba(8,25,40,0.28)',
            'padding:14px',
            'display:flex',
            'flex-direction:column',
            'gap:10px',
            'font-family:Manrope,sans-serif'
        ].join(';');

        const title = document.createElement('h3');
        title.textContent = 'Confirmación obligatoria';
        title.style.cssText = 'margin:0;font-size:18px;color:#12344f;';

        const body = document.createElement('p');
        body.textContent = message;
        body.style.cssText = 'margin:0;font-size:14px;line-height:1.45;color:#425f78;white-space:pre-wrap;';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Escribe ${expectedToken}`;
        input.setAttribute('data-confirm-input', 'true');
        input.style.cssText = [
            'height:38px',
            'border:1px solid #b7ccdf',
            'border-radius:10px',
            'padding:0 10px',
            'font-size:14px',
            'color:#18364f'
        ].join(';');

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancelar';
        cancelButton.style.cssText = [
            'height:34px',
            'border:1px solid #b8cadc',
            'border-radius:9px',
            'padding:0 12px',
            'font-size:12px',
            'font-weight:700',
            'cursor:pointer',
            'background:#fff',
            'color:#244864'
        ].join(';');

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.textContent = 'Confirmar';
        confirmButton.setAttribute('data-confirm-submit', 'true');
        confirmButton.style.cssText = [
            'height:34px',
            'border:1px solid #6b7280',
            'border-radius:9px',
            'padding:0 12px',
            'font-size:12px',
            'font-weight:700',
            'cursor:pointer',
            'background:linear-gradient(135deg,#9ca3af,#6b7280)',
            'color:#fff'
        ].join(';');

        const close = (ok) => {
            overlay.remove();
            resolve(ok);
        };

        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => {
            const entered = normalizeText(input.value).toUpperCase();
            close(entered === String(expectedToken || '').toUpperCase());
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const entered = normalizeText(input.value).toUpperCase();
                close(entered === String(expectedToken || '').toUpperCase());
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            }
        });

        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);
        panel.appendChild(title);
        panel.appendChild(body);
        panel.appendChild(input);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        input.focus();
    });
}

async function postJson(endpoint, payload) {
    appendLog(`POST ${endpoint}`, { payload });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch (_error) {
        data = { ok: false, error: raw || `HTTP ${response.status}` };
    }

    appendLog(`RESPONSE ${endpoint} [${response.status}]`, data);

    if (!response.ok || !data || data.ok !== true) {
        throw new Error(normalizeText(data?.error) || `HTTP ${response.status}`);
    }

    return data;
}

function populateBookSelector(engines) {
    if (!(refs.bookSelect instanceof HTMLSelectElement)) return;

    refs.bookSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = ALL_BOOKS_VALUE;
    allOption.textContent = 'Todos los libros';
    refs.bookSelect.appendChild(allOption);

    engineFileByModel.clear();

    const sorted = [...engines].sort((a, b) => {
        const modelA = normalizeText(a.engine_model);
        const modelB = normalizeText(b.engine_model);
        return modelA.localeCompare(modelB, 'es');
    });

    sorted.forEach((engine) => {
        const model = normalizeText(engine.engine_model);
        const file = normalizeText(engine.file);
        if (!model) return;
        engineFileByModel.set(model, file || `engine_${model}.json`);

        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        refs.bookSelect.appendChild(option);
    });

    renderScopeSummary();
}

async function loadEngines() {
    setStatus('Cargando catálogo de motores...', '');

    try {
        const response = await fetch('/engines', { method: 'GET' });
        const data = await response.json();
        if (!response.ok || data?.ok !== true || !Array.isArray(data.engines)) {
            throw new Error(normalizeText(data?.error) || 'Respuesta inválida de /engines');
        }

        populateBookSelector(data.engines);
        setStatus(`Motores cargados: ${data.engines.length}.`, 'ok');
        appendLog('GET /engines OK', { count: data.engines.length });
    } catch (error) {
        const fallback = [
            '12V4000M40A', '12V4000M53', '12V4000M70',
            '16V4000M61', '16V4000M73', '16V4000M73L',
            '16V4000M90', '20V4000M93', '20V4000M93L'
        ].map((model) => ({ engine_model: model, file: `engine_${model}.json` }));

        populateBookSelector(fallback);
        setStatus(`No se pudo leer /engines: ${String(error?.message || error)}. Usando lista local.`, 'warning');
        appendLog('[AVISO] Fallback local de motores', { error: String(error?.message || error) });
    }
}

async function runImportPdf() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('IMPORTAR PDF');

    const payload = scope.isAll ? {} : { engine: scope.model };

    setStatus(scope.isAll ? 'Importando PDF para todos los libros...' : `Importando PDF para ${scope.model}...`, '');
    await postJson('/api/pdf-preview/apply-to-engine', payload);
    setStatus('IMPORTAR PDF finalizado correctamente.', 'ok');
}

async function runFinalCalculation() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('CÁLCULO FINAL');

    const payload = scope.isAll ? { backup: true } : { file: scope.file, backup: true };

    setStatus(scope.isAll ? 'Ejecutando CÁLCULO FINAL para todos los libros...' : `Ejecutando CÁLCULO FINAL para ${scope.model}...`, '');
    await postJson('/copy-pdf-to-final-all-books', payload);
    setStatus('CÁLCULO FINAL finalizado correctamente.', 'ok');
}

async function runErrors() {
    const scope = getScope();
    let payload;

    if (scope.isAll) {
        if (scope.id) showIdIgnoredWarning('ERRORES con scope all');
        payload = {
            scope: 'all',
            dryRun: false,
            updateRevision: false,
            forceRevision: false,
            backup: true
        };
    } else if (scope.id) {
        payload = {
            scope: 'current',
            file: scope.file,
            id: scope.id,
            dryRun: false,
            updateRevision: false,
            forceRevision: false,
            backup: true
        };
    } else {
        payload = {
            scope: 'book',
            file: scope.file,
            dryRun: false,
            updateRevision: false,
            forceRevision: false,
            backup: true
        };
    }

    setStatus('Recalculando ERRORES...', '');
    await postJson('/recompute-qa-errors', payload);
    setStatus('ERRORES recalculados correctamente.', 'ok');
}

async function runStatuses() {
    const scope = getScope();
    if (!scope.isAll || scope.id) {
        appendLog('[AVISO] ESTADOS no soporta filtro por libro/ID actualmente en backend. Se ejecuta global.');
        setStatus('ESTADOS no soporta filtro por libro/ID. Se ejecuta para todos los libros.', 'warning');
    }

    setStatus('Recalculando ESTADOS para todos los libros...', '');
    await postJson('/recalculate-revision-status', {});
    setStatus('ESTADOS recalculados correctamente.', 'ok');
}

async function runClearPdfFinal() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('VACIAR _PDF Y _FINAL');

    const confirmed = await requestTypedConfirmation(
        'Acción destructiva. Se vaciarán campos *_pdf y *_final (excepto pn_pdf y pn_final).\n\nEscribe VACIAR para continuar.',
        'VACIAR'
    );
    if (!confirmed) {
        setStatus('Operación cancelada por confirmación incompleta.', 'warning');
        appendLog('[AVISO] Vaciado cancelado por usuario.');
        return;
    }

    const payload = scope.isAll
        ? { suffixes: ['_pdf', '_final'], exclude: ['pn_pdf', 'pn_final'] }
        : { files: [scope.file], suffixes: ['_pdf', '_final'], exclude: ['pn_pdf', 'pn_final'] };

    setStatus(scope.isAll ? 'Vaciando campos _pdf/_final en todos los libros...' : `Vaciando campos _pdf/_final en ${scope.model}...`, '');
    await postJson('/clear-engine-fields', payload);
    setStatus('VACIAR _PDF Y _FINAL finalizado correctamente.', 'ok');
}

async function runAction(action) {
    setBusy(true);
    try {
        await action();
    } catch (error) {
        const message = String(error?.message || error || 'Error desconocido');
        setStatus(message, 'error');
        appendLog(`[ERROR] ${message}`);
    } finally {
        setBusy(false);
        renderScopeSummary();
    }
}

function bindEvents() {
    if (refs.bookSelect instanceof HTMLSelectElement) {
        refs.bookSelect.addEventListener('change', renderScopeSummary);
    }

    if (refs.idInput instanceof HTMLInputElement) {
        refs.idInput.addEventListener('input', renderScopeSummary);
    }

    if (refs.btnImportPdf instanceof HTMLButtonElement) {
        refs.btnImportPdf.addEventListener('click', () => runAction(runImportPdf));
    }

    if (refs.btnFinal instanceof HTMLButtonElement) {
        refs.btnFinal.addEventListener('click', () => runAction(runFinalCalculation));
    }

    if (refs.btnErrors instanceof HTMLButtonElement) {
        refs.btnErrors.addEventListener('click', () => runAction(runErrors));
    }

    if (refs.btnStatuses instanceof HTMLButtonElement) {
        refs.btnStatuses.addEventListener('click', () => runAction(runStatuses));
    }

    if (refs.btnClearPdfFinal instanceof HTMLButtonElement) {
        refs.btnClearPdfFinal.addEventListener('click', () => runAction(runClearPdfFinal));
    }

    if (refs.btnClearLog instanceof HTMLButtonElement) {
        refs.btnClearLog.addEventListener('click', () => {
            logLines = [];
            appendLog('Log limpiado por usuario.');
        });
    }
}

async function init() {
    if (!refs.bookSelect || !refs.logPanel || !refs.status) {
        return;
    }

    bindEvents();
    appendLog('Inicializando recompute simple...');
    await loadEngines();
    renderScopeSummary();
    appendLog('Listo.');
}

init();
