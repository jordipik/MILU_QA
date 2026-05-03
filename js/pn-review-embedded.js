/**
 * pn-review-embedded.js
 * Vista embebida de PN Review para el panel derecho de Analista 02.
 * Se monta dentro del <aside class="a2-right"> cuando el tab "PN Review" está activo.
 */

/* ── helpers ─────────────────────────────────────────────────────────────── */

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
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dispVal(v) {
    if (emptyVal(v)) return '<span class="pre-empty">—</span>';
    return `<span class="pre-val">${esc(String(v))}</span>`;
}

/* ── conflict detection ──────────────────────────────────────────────────── */

/**
 * detectPnSourceConflicts(sourceRows) → { familiesToShow, cellStatus, summary }
 *
 * Families checked:
 *   pn         : pn_final, pn_pdf
 *   designation: designation_final, designation_gesa, designation_pdf
 *   measure    : measure_final, dimensions_gesa, measure_pdf
 *   weight     : weight_final, weight_gesa, weight_pdf
 *   sust       : sust_status, sust_hierarchie, pn_new (new part number)
 */
export function detectPnSourceConflicts(sourceRows) {
    const familiesToShow = [];
    const cellStatus = {};
    const summary = {};

    if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
        return { familiesToShow, cellStatus, summary };
    }

    const FAMILIES = [
        {
            key: 'pn',
            fields: ['pn_final', 'pn_pdf'],
            normalize: norm,
        },
        {
            key: 'designation',
            fields: ['designation_final', 'designation_gesa', 'designation_pdf'],
            normalize: norm,
        },
        {
            key: 'measure',
            fields: ['measure_final', 'dimensions_gesa', 'measure_pdf'],
            normalize: norm,
        },
        {
            key: 'weight',
            fields: ['weight_final', 'weight_gesa', 'weight_pdf'],
            normalize: normWeight,
        },
        {
            key: 'sust',
            fields: ['sust_status', 'sust_hierarchie', 'pn_new'],
            normalize: norm,
        },
    ];

    for (const family of FAMILIES) {
        // Collect unique non-empty values per field across all rows
        const fieldValues = {};
        for (const field of family.fields) {
            fieldValues[field] = new Set();
            for (const row of sourceRows) {
                const v = family.normalize(row[field]);
                if (v !== '') fieldValues[field].add(v);
            }
        }

        // Has any non-empty value at all?
        const hasData = family.fields.some(f => fieldValues[f].size > 0);
        if (!hasData) continue;

        // Is there disagreement across rows for any field?
        let familyStatus = null;
        for (const field of family.fields) {
            const vals = fieldValues[field];
            if (vals.size <= 1) continue; // 0 or 1 unique value → no conflict
            // Multiple distinct values → conflict
            familyStatus = 'conflict';
        }

        // Cross-field disagreement within the same row (e.g. designation_final ≠ designation_pdf)
        if (!familyStatus) {
            // Flatten all non-empty values to check if there are differences
            const allVals = new Set();
            for (const field of family.fields) {
                for (const v of fieldValues[field]) allVals.add(v);
            }
            if (allVals.size > 1) familyStatus = 'warning';
        }

        if (!familyStatus) continue;

        familiesToShow.push(family.key);
        summary[family.key] = familyStatus;

        // Per-cell status
        for (const row of sourceRows) {
            const rowId = String(row.ID ?? row._idx ?? Math.random());
            for (const field of family.fields) {
                const v = family.normalize(row[field]);
                if (v === '') continue;

                // Compare against the most common value for this field
                const vals = [...fieldValues[field]];
                const dominant = vals[0]; // simplistic: first unique value
                const statusKey = `${rowId}:${field}`;
                if (v !== dominant) {
                    cellStatus[statusKey] = familyStatus;
                }
            }
        }
    }

    return { familiesToShow, cellStatus, summary };
}

/* ── column definitions per family ──────────────────────────────────────── */

const FAMILY_COLUMNS = {
    pn: [
        { key: 'pn_final', label: 'PN final' },
        { key: 'pn_pdf', label: 'PN PDF' },
    ],
    designation: [
        { key: 'designation_final', label: 'Desig. final' },
        { key: 'designation_gesa', label: 'Desig. GESA' },
        { key: 'designation_pdf', label: 'Desig. PDF' },
    ],
    measure: [
        { key: 'measure_final', label: 'Medida final' },
        { key: 'dimensions_gesa', label: 'Medida GESA' },
        { key: 'measure_pdf', label: 'Medida PDF' },
    ],
    weight: [
        { key: 'weight_final', label: 'Peso final' },
        { key: 'weight_gesa', label: 'Peso GESA' },
        { key: 'weight_pdf', label: 'Peso PDF' },
    ],
    sust: [
        { key: 'sust_status', label: 'SUST status' },
        { key: 'sust_hierarchie', label: 'Jerarquía' },
        { key: 'pn_new', label: 'PN nuevo' },
    ],
};

/* ── module state ────────────────────────────────────────────────────────── */

let _container = null;      // HTMLElement where we render
let _currentSku = null;
let _detail = null;
let _sources = null;
let _showSources = false;
let _onDecisionApplied = null; // callback(sku, response)

/* ── public API ──────────────────────────────────────────────────────────── */

/**
 * init(container, { onDecisionApplied })
 * Call once when the embedded panel is created.
 */
export function init(container, { onDecisionApplied } = {}) {
    _container = container;
    _onDecisionApplied = onDecisionApplied || null;
    renderEmpty();
}

/**
 * onRecordChange(row)
 * Call every time a new row is selected in Analista 02.
 */
export async function onRecordChange(row) {
    if (!row) {
        _currentSku = null;
        _detail = null;
        _sources = null;
        renderEmpty();
        return;
    }

    const sku = String(row.pn_final || row['PART NO.'] || row.pn || '').trim();
    if (!sku) {
        _currentSku = null;
        renderNoSku();
        return;
    }

    if (sku === _currentSku && _detail) {
        // same PN already loaded; just re-render in case QA state changed
        renderPanel();
        return;
    }

    _currentSku = sku;
    _detail = null;
    _sources = null;
    renderLoading(sku);
    await fetchAndRender(sku);
}

/**
 * refresh()
 * Force-reload data for the current SKU.
 */
export async function refresh() {
    if (!_currentSku) return;
    _detail = null;
    _sources = null;
    renderLoading(_currentSku);
    await fetchAndRender(_currentSku);
}

/* ── data fetching ───────────────────────────────────────────────────────── */

async function fetchAndRender(sku) {
    try {
        const [detail, sourcesResp] = await Promise.all([
            apiFetch(`/pn-review/${encodeURIComponent(sku)}`),
            apiFetch(`/pn-review/${encodeURIComponent(sku)}/sources`),
        ]);
        _detail = detail;
        _sources = Array.isArray(sourcesResp?.sources) ? sourcesResp.sources : [];
        renderPanel();
    } catch (err) {
        renderError(sku, err);
    }
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(path, opts);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/* ── action handler ──────────────────────────────────────────────────────── */

async function applyDecision(action) {
    if (!_currentSku || !_detail) return;

    const exportRow = _detail.export_row || _detail;
    const sku = _currentSku;
    const occurrences = Number(exportRow.occurrences || _sources?.length || 0);
    const engines = Array.isArray(exportRow.engine_models)
        ? exportRow.engine_models
        : (Array.isArray(_detail.engine_models_all) ? _detail.engine_models_all : []);
    const enginesCount = engines.length;

    const ACTION_LABELS = {
        validar: 'OK / IMPORTAR',
        revisar: 'PENDIENTE / REVISAR',
        descartar: 'OK / ELIMINAR',
    };
    const label = ACTION_LABELS[action] || action;
    const msg = `Vas a marcar todas las apariciones del PN ${sku} como ${label}.\nAfectará a ${occurrences} registros en ${enginesCount} motores. ¿Continuar?`;

    const confirmed = await showConfirmDialog(`Confirmar: ${action}`, msg);
    if (!confirmed) return;

    try {
        setButtonsLoading(true);
        const response = await apiFetch(`/pn-review/${encodeURIComponent(sku)}/apply-decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });

        if (!response.ok) throw new Error(response.error || 'Error al aplicar decision');

        showToast(`PN actualizado: ${response.rows_updated} apariciones en ${(response.files_touched || []).length} motores.`, 'success');

        // Notify parent
        if (typeof _onDecisionApplied === 'function') {
            _onDecisionApplied(sku, response);
        }

        // Refresh own data
        _detail = null;
        _sources = null;
        await fetchAndRender(sku);
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        setButtonsLoading(false);
    }
}

/* ── rendering ───────────────────────────────────────────────────────────── */

function renderEmpty() {
    if (!_container) return;
    _container.innerHTML = `<div class="pre-empty-state">Selecciona un registro con PN válido para ver PN Review.</div>`;
}

function renderNoSku() {
    if (!_container) return;
    _container.innerHTML = `<div class="pre-empty-state">El registro seleccionado no tiene PN válido.</div>`;
}

function renderLoading(sku) {
    if (!_container) return;
    _container.innerHTML = `<div class="pre-loading">Cargando PN Review para <strong>${esc(sku)}</strong>…</div>`;
}

function renderError(sku, err) {
    if (!_container) return;
    _container.innerHTML = `<div class="pre-error">No se pudo cargar PN Review para <strong>${esc(sku)}</strong>: ${esc(err?.message || String(err))}</div>`;
}

function renderPanel() {
    if (!_container || !_detail) return;

    const exportRow = _detail.export_row || _detail;
    const sku = _currentSku;
    const designation = exportRow.designation_final || '';
    const decision = exportRow.decision || 'pending_review';
    const occurrences = Number(exportRow.occurrences || _sources?.length || 0);
    const engines = Array.isArray(exportRow.engine_models) ? exportRow.engine_models
        : (Array.isArray(_detail.engine_models_all) ? _detail.engine_models_all : []);

    const qaSummary = exportRow.qa_summary || _detail.qa_summary || {};

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

    // Conflict analysis
    const conflicts = detectPnSourceConflicts(_sources || []);

    const html = `
<div class="pre-panel">

  <!-- Header -->
  <div class="pre-header">
    <div class="pre-header-top">
      <span class="pre-sku">${esc(sku)}</span>
      <span class="pre-badge ${decisionClass}">${decisionLabel}</span>
      <span class="pre-occurrences">${occurrences} aparic.</span>
      <span class="pre-engines">${engines.map(e => `<span class="pre-engine-pill">${esc(e)}</span>`).join('')}</span>
    </div>
    ${designation ? `<div class="pre-designation">${esc(designation)}</div>` : ''}
    <div class="pre-global-note">Las acciones se aplican globalmente a todas las apariciones en todos los libros.</div>
  </div>

  <!-- Action buttons -->
  <div class="pre-actions" id="preActions">
    <button class="pre-btn pre-btn--validar" data-action="validar">✔ Validar PN</button>
    <button class="pre-btn pre-btn--revisar" data-action="revisar">⚠ Revisar PN</button>
    <button class="pre-btn pre-btn--descartar" data-action="descartar">✖ Descartar PN</button>
    <button class="pre-btn pre-btn--sources" id="preToggleSources">
      ${_showSources ? '▲ Ocultar apariciones' : '▼ Ver apariciones'}
    </button>
  </div>

  <!-- QA Summary -->
  <div class="pre-qa-summary">
    ${buildQaSummaryHtml(qaSummary)}
  </div>

  <!-- Conflict summary badges -->
  ${conflicts.familiesToShow.length ? `
  <div class="pre-conflict-badges">
    ${conflicts.familiesToShow.map(fam => `
      <span class="pre-conflict-badge pre-conflict-badge--${conflicts.summary[fam]}">${fam}</span>
    `).join('')}
  </div>` : ''}

  <!-- Sources table -->
  ${_showSources ? buildSourcesTableHtml(_sources || [], conflicts) : ''}

</div>

<!-- Confirm dialog -->
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

<!-- Toast container -->
<div id="preToastContainer" class="pre-toast-container" aria-live="polite"></div>
`;

    _container.innerHTML = html;
    bindActions();
}

function buildQaSummaryHtml(qa) {
    const items = [
        { label: 'Importar', val: qa.ok_importar ?? 0, cls: 'pre-qa--import' },
        { label: 'Eliminar', val: qa.ok_eliminar ?? 0, cls: 'pre-qa--discard' },
        { label: 'Revisar', val: qa.revisar ?? 0, cls: 'pre-qa--review' },
        { label: 'Pendiente', val: qa.pendiente ?? 0, cls: 'pre-qa--pending' },
    ];
    return `<div class="pre-qa-pills">${items.map(i =>
        `<span class="pre-qa-pill ${i.cls}"><strong>${i.val}</strong> ${i.label}</span>`
    ).join('')}</div>`;
}

function buildSourcesTableHtml(sources, conflicts) {
    if (!sources.length) return `<div class="pre-empty-state">Sin apariciones.</div>`;

    const { familiesToShow, cellStatus } = conflicts;

    // Fixed columns
    const fixedCols = [
        { key: 'engine_model', label: 'Motor' },
        { key: 'Source Page', label: 'Pág.' },
        { key: 'POS', label: 'POS' },
        { key: '_qa', label: 'QA Estado/Acción' },
    ];

    // Dynamic conflict columns
    const dynCols = [];
    for (const fam of familiesToShow) {
        for (const col of (FAMILY_COLUMNS[fam] || [])) {
            dynCols.push({ ...col, family: fam });
        }
    }

    const allCols = [...fixedCols, ...dynCols];

    const headerHtml = allCols.map(col =>
        `<th class="pre-th">${esc(col.label)}</th>`
    ).join('');

    const rowsHtml = sources.map((row, idx) => {
        const rowId = String(row.ID ?? idx);

        const qaEstado = row.qa_revision_estado || 'pendiente';
        const qaAccion = row.qa_revision_accion || '—';
        const qaClass = qaEstado === 'ok'
            ? (qaAccion === 'importar' ? 'pre-qa-cell--import' : 'pre-qa-cell--discard')
            : 'pre-qa-cell--pending';

        const cells = allCols.map(col => {
            if (col.key === '_qa') {
                return `<td class="pre-td pre-qa-cell ${qaClass}">${esc(qaEstado)} / ${esc(qaAccion)}</td>`;
            }
            const rawVal = row[col.key];
            const statusKey = `${rowId}:${col.key}`;
            const cellConflict = cellStatus[statusKey];
            const cellClass = cellConflict === 'conflict' ? 'pre-cell--conflict'
                : cellConflict === 'warning' ? 'pre-cell--warning' : '';
            return `<td class="pre-td ${cellClass}">${dispVal(rawVal)}</td>`;
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

/* ── event binding ───────────────────────────────────────────────────────── */

function bindActions() {
    // Action buttons
    _container.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            applyDecision(action).catch(err => showToast(`Error: ${err.message}`, 'error'));
        });
    });

    // Toggle sources
    const toggleBtn = _container.querySelector('#preToggleSources');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            _showSources = !_showSources;
            renderPanel();
        });
    }
}

function setButtonsLoading(loading) {
    _container.querySelectorAll('.pre-btn[data-action]').forEach(btn => {
        btn.disabled = loading;
        btn.style.opacity = loading ? '0.6' : '';
    });
}

/* ── confirm dialog ──────────────────────────────────────────────────────── */

function showConfirmDialog(title, msg) {
    return new Promise((resolve) => {
        const dlg = _container.querySelector('#preConfirmDialog');
        if (!dlg) { resolve(window.confirm(msg)); return; }

        _container.querySelector('#preConfirmTitle').textContent = title;
        _container.querySelector('#preConfirmMsg').textContent = msg;

        const okBtn = _container.querySelector('#preConfirmOk');
        const cancelBtn = _container.querySelector('#preConfirmCancel');
        okBtn.value = 'ok';
        cancelBtn.value = 'cancel';

        const onClose = () => {
            dlg.removeEventListener('close', onClose);
            resolve(dlg.returnValue === 'ok');
        };
        dlg.addEventListener('close', onClose);
        dlg.showModal();
    });
}

/* ── toast ───────────────────────────────────────────────────────────────── */

function showToast(msg, type = 'success') {
    // Try container inside panel first, fallback to global
    const container = _container?.querySelector('#preToastContainer')
        || document.getElementById('toastContainer');
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
