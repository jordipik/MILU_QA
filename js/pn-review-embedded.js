/**
 * pn-review-embedded.js
 * Vista embebida de PN Review para el panel derecho de Analista 02.
 */

function emptyVal(v) {
    const s = String(v ?? '').trim();
    return s === '' || s === '-' || s === 'null' || s === 'undefined';
}

function norm(v) {
    if (emptyVal(v)) return '';
    return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}

function normWeight(v) {
    if (emptyVal(v)) return '';
    return String(v).trim().toLowerCase()
        .replace(',', '.')
        .replace(/\s+/g, ' ')
        .replace(/ kg$/i, 'kg')
        .replace(/ g$/i, 'g');
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function dispVal(v) {
    if (emptyVal(v)) return '<span class="pre-empty">-</span>';
    return `<span class="pre-val">${esc(String(v))}</span>`;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (!emptyVal(value)) return String(value).trim();
    }
    return '';
}

function buildSourceRow(row = {}, idx = 0) {
    const sourceFile = String(row.source_file || row.__engine_file || '').trim();
    const engineModel = String(row.engine_model || row.__engine_model || row.model || row.engine || '').trim();
    return {
        _idx: idx,
        ID: String(row.ID ?? '').trim(),
        source_file: sourceFile,
        engine_model: engineModel,
        'Source Page': String(row['Source Page'] ?? '').trim(),
        POS: firstNonEmpty(row.POS, row.pos_final),
        'PART NO.': firstNonEmpty(row['PART NO.'], row.pn_final, row.pn),
        designation_final: firstNonEmpty(row.designation_final, row.DESIGNATION, row.designation_gesa, row.designation_pdf),
        measure_final: firstNonEmpty(row.measure_final, row.measurement_final, row['MEASUREMENT / STANDARD'], row.dimensions_gesa, row.measure_pdf),
        weight_final: firstNonEmpty(row.weight_final, row.WEIGHT, row.weight_gesa, row.weight_pdf),
        sust_status: firstNonEmpty(row.sust_status),
        sust_hierarchie: firstNonEmpty(row.sust_hierarchie),
        new_part_number: firstNonEmpty(row.sust_new_part_number, row.pn_new, row.new_part_number),
        qa_revision_estado: firstNonEmpty(row.qa_revision_estado, 'pendiente'),
        qa_revision_accion: firstNonEmpty(row.qa_revision_accion, '-'),
    };
}

function deriveDecisionFromQa(row) {
    const estado = String(row?.qa_revision_estado || '').trim().toLowerCase();
    const accion = String(row?.qa_revision_accion || '').trim().toLowerCase();
    if (estado === 'ok' && accion === 'importar') return 'import';
    if (estado === 'ok' && accion === 'eliminar') return 'discard';
    return 'pending_review';
}

function detectTableCellStatus(rows) {
    const cellStatus = {};
    if (!Array.isArray(rows) || rows.length === 0) return cellStatus;

    const conflictKeys = new Set(['PART NO.', 'designation_final', 'measure_final', 'weight_final', 'new_part_number']);
    const warningKeys = new Set(['POS', 'Source Page', 'sust_status', 'sust_hierarchie']);
    const columns = [...conflictKeys, ...warningKeys];

    for (const key of columns) {
        const counts = new Map();
        for (const row of rows) {
            const raw = row?.[key];
            const normalized = key === 'weight_final' ? normWeight(raw) : norm(raw);
            if (!normalized) continue;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        }

        if (counts.size <= 1) continue;

        let majorityKey = '';
        let majorityCount = 0;
        for (const [value, count] of counts.entries()) {
            if (count > majorityCount) {
                majorityKey = value;
                majorityCount = count;
            }
        }

        if (!majorityKey) continue;

        const status = conflictKeys.has(key) ? 'conflict' : 'warning';
        for (const row of rows) {
            const rowId = String(row.ID || row._idx);
            const raw = row?.[key];
            const normalized = key === 'weight_final' ? normWeight(raw) : norm(raw);
            if (!normalized || normalized === majorityKey) continue;
            cellStatus[`${rowId}:${key}`] = status;
        }
    }
    return cellStatus;
}

let _container = null;
let _onDecisionApplied = null;
let _onValuesApplied = null;
let _currentRow = null;
let _currentSku = '';
let _currentId = '';
let _isNoPnMode = false;
let _detail = null;
let _sources = [];
let _loadError = '';

export function init(container, { onDecisionApplied, onValuesApplied } = {}) {
    _container = container;
    _onDecisionApplied = onDecisionApplied || null;
    _onValuesApplied = onValuesApplied || null;
    renderPanel();
}

function buildPropagationFieldsFromCurrentRow() {
    return {
        pn_final: firstNonEmpty(_currentRow?.pn_final, _currentRow?.['PART NO.'], _currentRow?.pn),
        designation_final: firstNonEmpty(_currentRow?.designation_final, _currentRow?.DESIGNATION, _currentRow?.designation_gesa, _currentRow?.designation_pdf),
        measure_final: firstNonEmpty(_currentRow?.measure_final, _currentRow?.measurement_final, _currentRow?.['MEASUREMENT / STANDARD'], _currentRow?.dimensions_gesa, _currentRow?.measure_pdf),
        weight_final: firstNonEmpty(_currentRow?.weight_final, _currentRow?.WEIGHT, _currentRow?.weight_gesa, _currentRow?.weight_pdf),
        sust_status: firstNonEmpty(_currentRow?.sust_status),
        sust_hierarchie: firstNonEmpty(_currentRow?.sust_hierarchie),
        sust_new_part_number: firstNonEmpty(_currentRow?.sust_new_part_number),
        sust_superseded_list: firstNonEmpty(_currentRow?.sust_superseded_list)
    };
}

export async function onRecordChange(row, options = {}) {
    const forceRefresh = Boolean(options?.force);
    _currentRow = row || null;
    _currentId = String(row?.ID || '').trim();
    _loadError = '';

    if (!row) {
        _currentSku = '';
        _isNoPnMode = false;
        _detail = null;
        _sources = [];
        renderPanel();
        return;
    }

    const sku = String(row.pn_final || row['PART NO.'] || row.pn || '').trim();
    if (!sku) {
        _currentSku = '';
        _isNoPnMode = true;
        _detail = buildNoPnDetail(row);
        _sources = [buildSourceRow(row, 0)];
        console.info('[PN Review Embedded] modo sin PN', { id: _currentId, engine_model: row?.engine_model || '' });
        console.info('[PN Review Embedded] numero de apariciones', { count: _sources.length, mode: 'no-pn' });
        renderPanel();
        return;
    }

    _isNoPnMode = false;
    if (!forceRefresh && sku === _currentSku && _detail) {
        _sources = ensureSourcesFallback(_sources, row);
        console.info('[PN Review Embedded] PN cargado (cache)', { sku: _currentSku });
        console.info('[PN Review Embedded] numero de apariciones', { count: _sources.length, mode: 'pn' });
        renderPanel();
        return;
    }

    _currentSku = sku;
    _detail = null;
    _sources = [];
    renderLoading(sku);
    await fetchPnModeAndRender(sku, row);
}

export async function refresh() {
    if (!_currentRow) return;
    await onRecordChange(_currentRow, { force: true });
}

export function showBusy(message = '') {
    if (!_container) return;
    const target = String(_currentSku || '').trim() || String(_currentId || '').trim() || '-';
    const text = String(message || '').trim() || `Actualizando PN Review para ${target}...`;
    _container.innerHTML = `<div class="pre-loading">${esc(text)}</div>`;
}

function buildNoPnDetail(row) {
    const source = buildSourceRow(row, 0);
    return {
        ok: true,
        sku: '',
        export_row: {
            sku: '',
            designation_final: source.designation_final,
            decision: deriveDecisionFromQa(row),
            occurrences: 1,
            engine_models: source.engine_model ? [source.engine_model] : []
        },
        qa_summary: {
            ok_importar: String(source.qa_revision_estado).toLowerCase() === 'ok' && String(source.qa_revision_accion).toLowerCase() === 'importar' ? 1 : 0,
            ok_eliminar: String(source.qa_revision_estado).toLowerCase() === 'ok' && String(source.qa_revision_accion).toLowerCase() === 'eliminar' ? 1 : 0,
            revisar: String(source.qa_revision_accion).toLowerCase() === 'revisar' ? 1 : 0,
            pendiente: String(source.qa_revision_estado).toLowerCase() === 'pendiente' ? 1 : 0,
            total_rows: 1
        },
        engine_models_all: source.engine_model ? [source.engine_model] : []
    };
}

function ensureSourcesFallback(sources, row) {
    const normalized = Array.isArray(sources)
        ? sources.map((src, idx) => buildSourceRow(src, idx))
        : [];
    if (normalized.length > 0) return normalized;
    if (!row) return [];
    return [buildSourceRow(row, 0)];
}

async function fetchPnModeAndRender(sku, rowForFallback) {
    try {
        const [detail, sourcesResp] = await Promise.all([
            apiFetch(`/pn-review/${encodeURIComponent(sku)}`),
            apiFetch(`/pn-review/${encodeURIComponent(sku)}/sources`),
        ]);

        _detail = detail;
        const incomingSources = Array.isArray(sourcesResp?.rows)
            ? sourcesResp.rows
            : (Array.isArray(sourcesResp?.sources) ? sourcesResp.sources : []);
        _sources = ensureSourcesFallback(incomingSources, rowForFallback);

        console.info('[PN Review Embedded] PN cargado', { sku });
        console.info('[PN Review Embedded] numero de apariciones', { count: _sources.length, mode: 'pn' });
        renderPanel();
    } catch (err) {
        _detail = buildNoPnDetail(rowForFallback || {});
        _sources = ensureSourcesFallback([], rowForFallback);
        _loadError = String(err?.message || err);
        renderPanel();
    }
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(path, opts);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error = new Error(body?.error || `HTTP ${res.status}`);
        error.status = res.status;
        error.body = body;
        throw error;
    }
    return res.json();
}

function buildByIdPayload(action) {
    return {
        action,
        engine_model: String(_currentRow?.engine_model || '').trim(),
        source_file: String(_currentRow?.source_file || _currentRow?.__engine_file || '').trim(),
        source_page: String(_currentRow?.['Source Page'] || '').trim(),
        pos: String(_currentRow?.POS || '').trim(),
        part_no: String(_currentRow?.['PART NO.'] || _currentRow?.pn_final || _currentRow?.pn || '').trim(),
    };
}

async function applyDecision(action) {
    if (!_currentRow) return;

    const actionLabel = {
        validar: 'OK / IMPORTAR',
        revisar: 'PENDIENTE / REVISAR',
        descartar: 'OK / ELIMINAR',
    }[action] || action;

    const inPnMode = !_isNoPnMode && Boolean(_currentSku);
    const targetLabel = inPnMode
        ? `PN ${_currentSku}`
        : `registro ID ${_currentId || '-'}`;
    const occurrences = inPnMode ? (_sources.length || Number(_detail?.export_row?.occurrences || 0)) : 1;
    const msg = `Vas a marcar ${targetLabel} como ${actionLabel}.\nAfectara a ${occurrences} registro(s). ¿Continuar?`;

    const expectedText = action === 'descartar' ? 'DESCARTAR' : 'APLICAR';
    const confirmed = await showConfirmDialog(`Confirmar: ${action}`, msg, { expectedText });
    if (!confirmed) return;

    try {
        setButtonsLoading(true);

        let response;
        if (inPnMode) {
            try {
                response = await apiFetch(`/pn-review/${encodeURIComponent(_currentSku)}/apply-decision`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action }),
                });
            } catch (error) {
                // Defensive fallback: if SKU path cannot find rows but we have a concrete ID,
                // retry by ID to avoid hard-blocking the analyst action.
                if (error?.status === 404 && _currentId) {
                    console.warn('[PN Review Embedded] 404 por SKU, reintentando por ID', {
                        sku: _currentSku,
                        id: _currentId,
                    });
                    response = await apiFetch(`/pn-review/by-id/${encodeURIComponent(_currentId)}/apply-decision`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(buildByIdPayload(action)),
                    });
                } else {
                    throw error;
                }
            }
        } else {
            if (!_currentId) throw new Error('El registro actual no tiene ID para modo sin PN.');
            response = await apiFetch(`/pn-review/by-id/${encodeURIComponent(_currentId)}/apply-decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildByIdPayload(action)),
            });
        }

        if (!response.ok) throw new Error(response.error || 'Error al aplicar decision');

        showToast(`Decision aplicada: ${response.rows_updated} registro(s), ${(response.files_touched || []).length} archivo(s).`, 'success');
        console.info('[PN Review Embedded] decision aplicada', { action, mode: inPnMode ? 'pn' : 'no-pn' });
        console.info('[PN Review Embedded] rows_updated', { rows_updated: response.rows_updated });
        console.info('[PN Review Embedded] files_touched', { files_touched: response.files_touched || [] });

        if (typeof _onDecisionApplied === 'function') {
            _onDecisionApplied(inPnMode ? _currentSku : _currentId, response, {
                mode: inPnMode ? 'pn' : 'no-pn',
                currentRow: _currentRow,
            });
        }

        if (!inPnMode && response?.target) {
            _currentRow.qa_revision_estado = response.target.qa_revision_estado;
            _currentRow.qa_revision_accion = response.target.qa_revision_accion;
        }

        await refresh();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        setButtonsLoading(false);
    }
}

async function applyCurrentValuesToAppearances() {
    if (!_currentRow) return;

    try {
        setButtonsLoading(true);
        showBusy('Recargando PN Review...');
        await refresh();
        showToast('PN Review actualizado.', 'success');
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        setButtonsLoading(false);
    }
}

function renderPanel() {
    if (!_container) return;

    const exportRow = _detail?.export_row || {};
    const sku = _currentSku;
    const designation = exportRow.designation_final || firstNonEmpty(_currentRow?.designation_final, _currentRow?.DESIGNATION);
    const decision = exportRow.decision || deriveDecisionFromQa(_currentRow || {});
    const engines = Array.isArray(exportRow.engine_models)
        ? exportRow.engine_models
        : (Array.isArray(_detail?.engine_models_all) ? _detail.engine_models_all : []);
    const qaSummary = _detail?.qa_summary || {};
    const sources = ensureSourcesFallback(_sources, _currentRow);
    const cellStatus = detectTableCellStatus(sources);

    const decisionClass = {
        import: 'pre-badge--import',
        discard: 'pre-badge--discard',
        pending_review: 'pre-badge--pending',
    }[decision] || 'pre-badge--pending';

    const decisionLabel = {
        import: 'Import',
        discard: 'Discard',
        pending_review: 'Pending',
    }[decision] || decision;

    const titleSku = _isNoPnMode ? 'SIN PN' : (sku || '-');
    const modeNote = _isNoPnMode
        ? `Modo sin PN por ID ${esc(_currentId || '-')}: puedes recargar la tabla para ver el estado actual.`
        : 'Usa Actualizar apariciones para recargar la tabla PN Review con los datos mas recientes.';

    const html = `
<div class="pre-panel">
  <div class="pre-header">
    <div class="pre-header-top">
      <span class="pre-sku">${esc(titleSku)}</span>
      <span class="pre-badge ${decisionClass}">${decisionLabel}</span>
      <span class="pre-occurrences">${sources.length} aparic.</span>
      <span class="pre-engines">${engines.map(e => `<span class="pre-engine-pill">${esc(e)}</span>`).join('')}</span>
    </div>
    ${designation ? `<div class="pre-designation">${esc(designation)}</div>` : ''}
    <div class="pre-global-note">${modeNote}</div>
    ${_loadError ? `<div class="pre-error-inline">No se pudo cargar el detalle PN: ${esc(_loadError)}</div>` : ''}
  </div>

  <div class="pre-actions" id="preActions">
        <button class="pre-btn pre-btn--sync" data-command="apply-values">Actualizar apariciones</button>
  </div>

    <div class="pre-qa-summary">
        ${buildQaSummaryHtml(qaSummary, sources)}
  </div>

  ${buildSourcesTableHtml(sources, cellStatus)}
</div>

<dialog id="preConfirmDialog" class="pre-confirm-dialog">
  <form method="dialog" class="pre-confirm-shell">
    <header class="pre-confirm-head">
      <h3 id="preConfirmTitle">Confirmar</h3>
    </header>
    <p id="preConfirmMsg" class="pre-confirm-msg"></p>
    <footer class="pre-confirm-foot">
      <button type="submit" id="preConfirmOk" value="ok" class="pre-confirm-ok">Confirmar</button>
      <button type="submit" id="preConfirmCancel" value="cancel" class="pre-confirm-cancel">Cancelar</button>
    </footer>
  </form>
</dialog>

<div id="preToastContainer" class="pre-toast-container" aria-live="polite"></div>
`;

    _container.innerHTML = html;
    bindActions();
    setButtonsLoading(!_currentRow);
}

function renderLoading(sku) {
    if (!_container) return;
    _container.innerHTML = `<div class="pre-loading">Cargando PN Review para <strong>${esc(sku)}</strong>...</div>`;
}

function buildQaSummaryHtml(qa, sources = []) {
    const copyFromSources = Array.isArray(sources)
        ? sources.filter((row) => {
            const estado = String(row?.qa_revision_estado || '').trim().toLowerCase();
            const accion = String(row?.qa_revision_accion || '').trim().toLowerCase();
            return estado === 'ok' && accion === 'copia';
        }).length
        : 0;

    const copyCount = Number.isFinite(Number(qa?.ok_copia))
        ? Number(qa.ok_copia)
        : copyFromSources;

    const items = [
        { label: 'Importar', val: qa.ok_importar ?? 0, cls: 'pre-qa--import' },
        { label: 'Eliminar', val: qa.ok_eliminar ?? 0, cls: 'pre-qa--discard' },
        { label: 'Copia', val: copyCount, cls: 'pre-qa--copy' },
        { label: 'Revisar', val: qa.revisar ?? 0, cls: 'pre-qa--review' },
        { label: 'Pendiente', val: qa.pendiente ?? 0, cls: 'pre-qa--pending' },
    ];
    return `<div class="pre-qa-pills">${items.map(i =>
        `<span class="pre-qa-pill ${i.cls}"><strong>${i.val}</strong> ${i.label}</span>`
    ).join('')}</div>`;
}

function buildSourcesTableHtml(sources, cellStatus) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return `<div class="pre-empty-state">Sin apariciones; selecciona un registro para mostrar fallback local.</div>`;
    }

    const hasSust = sources.some((row) => !emptyVal(row.sust_status) || !emptyVal(row.sust_hierarchie) || !emptyVal(row.new_part_number));
    const columns = [
        { key: '_qa', label: 'estado / accion' },
        { key: 'engine_model', label: 'motor / libro' },
        { key: 'Source Page', label: 'pagina' },
        { key: 'POS', label: 'POS' },
        { key: 'PART NO.', label: 'PART NO.' },
        { key: 'designation_final', label: 'designation_final' },
        { key: 'measure_final', label: 'measure_final' },
        { key: 'weight_final', label: 'weight_final' },
    ];

    if (hasSust) {
        columns.push(
            { key: 'sust_status', label: 'sust_status' },
            { key: 'sust_hierarchie', label: 'hierarchie' },
            { key: 'new_part_number', label: 'new_part_number' }
        );
    }

    const headerHtml = columns.map((col) => `<th class="pre-th">${esc(col.label)}</th>`).join('');
    const rowsHtml = sources.map((row) => {
        const rowId = String(row.ID || row._idx);
        const qaEstado = row.qa_revision_estado || 'pendiente';
        const qaAccion = row.qa_revision_accion || '-';
        const qaClass = String(qaEstado).toLowerCase() === 'ok'
            ? (String(qaAccion).toLowerCase() === 'importar' ? 'pre-qa-cell--import' : 'pre-qa-cell--discard')
            : 'pre-qa-cell--pending';

        const cells = columns.map((col) => {
            if (col.key === '_qa') {
                return `<td class="pre-td pre-qa-cell ${qaClass}">${esc(qaEstado)} / ${esc(qaAccion)}</td>`;
            }
            const key = `${rowId}:${col.key}`;
            const status = cellStatus[key];
            const cls = status === 'conflict'
                ? 'pre-cell--conflict'
                : (status === 'warning' ? 'pre-cell--warning' : '');
            return `<td class="pre-td ${cls}">${dispVal(row[col.key])}</td>`;
        }).join('');

        return `<tr class="pre-tr">${cells}</tr>`;
    }).join('');

    return `
<div class="pre-sources-wrap">
  <table class="pre-sources-table">
    <thead><tr class="pre-tr-head">${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>`;
}

function bindActions() {
    _container.querySelectorAll('[data-command="apply-values"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            applyCurrentValuesToAppearances().catch((err) => showToast(`Error: ${err.message}`, 'error'));
        });
    });
}

function setButtonsLoading(loading) {
    _container.querySelectorAll('.pre-btn[data-action], .pre-btn[data-command]').forEach((btn) => {
        const keepDisabled = btn.dataset.command === 'apply-values' && _isNoPnMode;
        btn.disabled = loading || keepDisabled;
        btn.style.opacity = loading ? '0.6' : '';
    });
}

function showConfirmDialog(title, msg, opts = {}) {
    return new Promise((resolve) => {
        const dlg = _container.querySelector('#preConfirmDialog');
        const expectedText = String(opts.expectedText || '').trim();
        if (!dlg) {
            if (!expectedText) {
                resolve(window.confirm(msg));
                return;
            }
            const typed = window.prompt(`${msg}\n\nEscribe exactamente: ${expectedText}`, '');
            resolve(String(typed || '').trim() === expectedText);
            return;
        }

        _container.querySelector('#preConfirmTitle').textContent = title;
        const msgNode = _container.querySelector('#preConfirmMsg');
        msgNode.textContent = '';
        const textNode = document.createElement('p');
        textNode.textContent = msg;
        textNode.style.margin = '0 0 10px';
        msgNode.appendChild(textNode);

        const okBtn = _container.querySelector('#preConfirmOk');
        const cancelBtn = _container.querySelector('#preConfirmCancel');
        okBtn.value = 'ok';
        cancelBtn.value = 'cancel';

        let typedInput = null;
        if (expectedText) {
            const label = document.createElement('label');
            label.textContent = `Escribe exactamente: ${expectedText}`;
            label.style.display = 'block';
            label.style.fontWeight = '700';
            label.style.marginBottom = '6px';

            typedInput = document.createElement('input');
            typedInput.type = 'text';
            typedInput.autocomplete = 'off';
            typedInput.spellcheck = false;
            typedInput.style.width = '100%';
            typedInput.style.padding = '8px 10px';
            typedInput.style.borderRadius = '8px';
            typedInput.style.border = '1px solid #cbd5e1';

            msgNode.appendChild(label);
            msgNode.appendChild(typedInput);
            okBtn.disabled = true;

            typedInput.addEventListener('input', () => {
                okBtn.disabled = String(typedInput.value || '').trim() !== expectedText;
            });
        } else {
            okBtn.disabled = false;
        }

        const onClose = () => {
            dlg.removeEventListener('close', onClose);
            resolve(dlg.returnValue === 'ok');
        };

        dlg.addEventListener('close', onClose);
        dlg.showModal();
        if (typedInput) typedInput.focus();
    });
}

function showToast(msg, type = 'success') {
    const container = _container?.querySelector('#preToastContainer') || document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pre-toast pre-toast--${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('pre-toast--visible'));
    setTimeout(() => {
        toast.classList.remove('pre-toast--visible');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
