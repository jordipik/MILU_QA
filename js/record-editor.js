/**
 * Record Editor — editor de ficha técnica para registros MILU.
 *
 * Abre un panel lateral o modal con todos los campos reales del registro,
 * agrupados por origen (BASE, EXCEL, PDF, GESA/SUST, FINAL), con edición
 * segura sobre los campos reales del JSON.
 *
 * USO:
 *   import { openRecordEditor } from './record-editor.js';
 *   openRecordEditor({ row, engineFile, onSaved });
 */

import { showToast } from './toast.js';

// ─── Configuración de fallbacks para columnas de display ─────────────────────
// Cuando una columna de la tabla muestra un valor compuesto por fallback,
// esta tabla indica qué campos reales alimentan ese valor visual.
export const DISPLAY_FIELD_SOURCES = {
    pn_display: ['pn_excel', 'PART NO.', 'pn_final'],
    designation_display: ['designation_excel', 'DESIGNATION', 'designation_final'],
    qty_display: ['qty_excel', 'QTY', 'qty_final'],
    pos_display: ['pos_excel', 'POS', 'pos_final'],
    weight_display: ['weight_excel', 'WEIGHT', 'weight_final'],
    measure_display: ['measure_excel', 'MEASUREMENT / STANDARD', 'measure_final'],
    model_type_display: ['model_type_excel', 'MODEL/TYPE', 'model_type_final'],
    units_display: ['units_excel', 'UNITS', 'units_final'],
    fn_display: ['fn_excel', 'FN', 'fn_final'],
};

// ─── Grupos de campos editables por origen ───────────────────────────────────
const FIELD_GROUPS = [
    {
        id: 'base',
        label: 'Campos BASE / Originales',
        fields: [
            { key: 'POS', label: 'POS' },
            { key: 'PART NO.', label: 'PART NO.' },
            { key: 'DESIGNATION', label: 'DESIGNATION' },
            { key: 'MODEL/TYPE', label: 'MODEL/TYPE' },
            { key: 'QTY', label: 'QTY' },
            { key: 'UNITS', label: 'UNITS' },
            { key: 'WEIGHT', label: 'WEIGHT' },
            { key: 'FN', label: 'FN' },
            { key: 'MEASUREMENT / STANDARD', label: 'MEASUREMENT / STANDARD' },
            { key: 'FG/FGS', label: 'FG/FGS' },
            { key: 'BOM-No.', label: 'BOM-No.' },
            { key: 'norma', label: 'NORMA' },
        ],
    },
    {
        id: 'excel',
        label: 'Campos EXCEL (_excel)',
        fields: [
            { key: 'pos_excel', label: 'pos_excel' },
            { key: 'pn_excel', label: 'pn_excel' },
            { key: 'designation_excel', label: 'designation_excel' },
            { key: 'model_type_excel', label: 'model_type_excel' },
            { key: 'qty_excel', label: 'qty_excel' },
            { key: 'qty_units_excel', label: 'qty_units_excel' },
            { key: 'weight_excel', label: 'weight_excel' },
            { key: 'fn_excel', label: 'fn_excel' },
            { key: 'measure_excel', label: 'measure_excel' },
            { key: 'fg_fgs_excel', label: 'fg_fgs_excel' },
            { key: 'bom_excel', label: 'bom_excel' },
        ],
    },
    {
        id: 'pdf',
        label: 'Campos PDF (_pdf)',
        fields: [
            { key: 'pos_pdf', label: 'pos_pdf' },
            { key: 'pn_pdf', label: 'pn_pdf' },
            { key: 'designation_pdf', label: 'designation_pdf' },
            { key: 'model_type_pdf', label: 'model_type_pdf' },
            { key: 'qty_pdf', label: 'qty_pdf' },
            { key: 'units_pdf', label: 'units_pdf' },
            { key: 'weight_pdf', label: 'weight_pdf' },
            { key: 'fn_pdf', label: 'fn_pdf' },
            { key: 'measure_pdf', label: 'measure_pdf' },
            { key: 'fg_fgs_pdf', label: 'fg_fgs_pdf' },
            { key: 'bom_pdf', label: 'bom_pdf' },
            { key: 'gesa_pdf', label: 'gesa_pdf' },
            { key: 'nsn_pdf', label: 'nsn_pdf' },
            { key: 'normalizado_pdf', label: 'normalizado_pdf' },
            { key: 'norma_pdf', label: 'norma_pdf' },
            { key: 'sust_status_pdf', label: 'sust_status_pdf' },
            { key: 'hierarchi_pdf', label: 'hierarchi_pdf' },
            { key: 'sust_new_part_number_pdf', label: 'sust_new_part_number_pdf' },
            { key: 'sust_superseded_list_pdf', label: 'sust_superseded_list_pdf' },
        ],
    },
    {
        id: 'gesa',
        label: 'Campos GESA / SUST',
        fields: [
            { key: 'gesa', label: 'gesa' },
            { key: 'nsn', label: 'nsn' },
            { key: 'normalizado', label: 'normalizado' },
            { key: 'designation_gesa', label: 'designation_gesa' },
            { key: 'weight_gesa', label: 'weight_gesa' },
            { key: 'dimensions_gesa', label: 'dimensions_gesa' },
            { key: 'sust_status', label: 'sust_status' },
            { key: 'sust_hierarchie', label: 'sust_hierarchie' },
            { key: 'sust_new_part_number', label: 'sust_new_part_number' },
            { key: 'sust_superseded_list', label: 'sust_superseded_list' },
        ],
    },
    {
        id: 'final',
        label: 'Campos FINAL (_final)',
        fields: [
            { key: 'pos_final', label: 'pos_final' },
            { key: 'pn_final', label: 'pn_final' },
            { key: 'designation_final', label: 'designation_final' },
            { key: 'model_type_final', label: 'model_type_final' },
            { key: 'qty_final', label: 'qty_final' },
            { key: 'units_final', label: 'units_final' },
            { key: 'weight_final', label: 'weight_final' },
            { key: 'fn_final', label: 'fn_final' },
            { key: 'measure_final', label: 'measure_final' },
            { key: 'fg_fgs_final', label: 'fg_fgs_final' },
            { key: 'bom_final', label: 'bom_final' },
            { key: 'gesa_final', label: 'gesa_final' },
            { key: 'nsn_final', label: 'nsn_final' },
            { key: 'normalizado_final', label: 'normalizado_final' },
            { key: 'norma_final', label: 'norma_final' },
            { key: 'sust_status_final', label: 'sust_status_final' },
            { key: 'hierarchie_final', label: 'hierarchie_final' },
            { key: 'new_pn_final', label: 'new_pn_final' },
            { key: 'subst_pnlist_final', label: 'subst_pnlist_final' },
        ],
    },
];

// ─── Estado interno ────────────────────────────────────────────────────────
let _activeEditor = null;

function escHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getFieldValue(row, key) {
    if (row == null) return '';
    const val = row[key];
    return val == null ? '' : String(val);
}

// Resuelve el valor visible de display para una clave de display
function resolveDisplayValue(row, displayKey) {
    const sources = DISPLAY_FIELD_SOURCES[displayKey];
    if (!sources) return '';
    for (const src of sources) {
        const v = String(row?.[src] ?? '').trim();
        if (v) return v;
    }
    return '';
}

// ─── Construcción del HTML del modal ─────────────────────────────────────────
function buildModalHtml(row, engineFile, recordId) {
    const pn = String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn_excel ?? '').trim() || recordId;
    const engineModel = String(engineFile ?? '').replace(/^engine_/i, '').replace(/\.json$/i, '');

    let groupsHtml = '';
    for (const group of FIELD_GROUPS) {
        let fieldsHtml = '';

        for (const fieldDef of group.fields) {
            const currentVal = getFieldValue(row, fieldDef.key);
            const fieldId = `re-field-${fieldDef.key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            const hasValue = currentVal !== '';

            fieldsHtml += `
                <div class="re-field-row" data-field-key="${escHtml(fieldDef.key)}">
                    <label class="re-field-label" for="${fieldId}">${escHtml(fieldDef.label)}</label>
                    <div class="re-field-input-wrap">
                        <input
                            id="${fieldId}"
                            class="re-field-input${hasValue ? '' : ' is-empty'}"
                            type="text"
                            data-field-key="${escHtml(fieldDef.key)}"
                            data-original="${escHtml(currentVal)}"
                            value="${escHtml(currentVal)}"
                            autocomplete="off"
                            spellcheck="false"
                            aria-label="${escHtml(fieldDef.label)}"
                        />
                        <span class="re-field-dirty-mark" aria-hidden="true" title="Campo modificado"></span>
                    </div>
                </div>`;
        }

        groupsHtml += `
            <details class="re-group" open>
                <summary class="re-group-title">${escHtml(group.label)}</summary>
                <div class="re-group-fields">${fieldsHtml}</div>
            </details>`;
    }

    return `
        <div id="recordEditorModal" class="re-modal" role="dialog" aria-modal="true" aria-labelledby="reModalTitle" hidden>
            <div class="re-modal-backdrop"></div>
            <div class="re-modal-panel">
                <header class="re-modal-header">
                    <div class="re-modal-title-wrap">
                        <h2 id="reModalTitle" class="re-modal-title">Editor de registro</h2>
                        <div class="re-modal-meta">
                            <span class="re-modal-pn">${escHtml(pn)}</span>
                            <span class="re-modal-engine">${escHtml(engineModel)}</span>
                            <span class="re-modal-id">ID: ${escHtml(String(recordId))}</span>
                        </div>
                    </div>
                    <button id="reModalCloseBtn" class="re-modal-close" type="button" aria-label="Cerrar editor">&times;</button>
                </header>

                <div class="re-modal-status-bar">
                    <span id="reModalDirtyBadge" class="re-dirty-badge" hidden>Hay cambios sin guardar</span>
                    <span id="reModalStatusMsg" class="re-status-msg" aria-live="polite"></span>
                </div>

                <div class="re-modal-body">
                    <form id="reModalForm" novalidate autocomplete="off">
                        ${groupsHtml}
                    </form>
                </div>

                <footer class="re-modal-footer">
                    <button id="reModalCancelBtn" class="re-btn re-btn-cancel" type="button">Cancelar</button>
                    <button id="reModalResetBtn" class="re-btn re-btn-reset" type="button" title="Descartar cambios pendientes">Restablecer</button>
                    <button id="reModalSaveBtn" class="re-btn re-btn-save" type="submit" form="reModalForm">Guardar cambios</button>
                </footer>
            </div>
        </div>`;
}

// ─── Lógica del editor ────────────────────────────────────────────────────────
function getDirtyChanges(panel) {
    const changes = {};
    panel.querySelectorAll('.re-field-input').forEach((input) => {
        const key = input.dataset.fieldKey;
        const original = String(input.dataset.original ?? '');
        const current = String(input.value ?? '');
        if (current !== original) {
            changes[key] = current;
        }
    });
    return changes;
}

function markDirtyFields(panel) {
    let dirtyCount = 0;
    panel.querySelectorAll('.re-field-input').forEach((input) => {
        const key = input.dataset.fieldKey;
        if (!key) return;
        const original = String(input.dataset.original ?? '');
        const current = String(input.value ?? '');
        const isDirty = current !== original;
        const row = input.closest('.re-field-row');
        if (row) {
            row.classList.toggle('is-dirty', isDirty);
        }
        if (isDirty) dirtyCount += 1;
    });

    const dirtyBadge = panel.querySelector('#reModalDirtyBadge');
    if (dirtyBadge instanceof HTMLElement) {
        dirtyBadge.hidden = dirtyCount === 0;
    }
}

function setEditorStatus(panel, message, type = '') {
    const el = panel.querySelector('#reModalStatusMsg');
    if (!(el instanceof HTMLElement)) return;
    el.textContent = message;
    el.className = 're-status-msg';
    if (type) el.classList.add(`is-${type}`);
}

async function saveEditorChanges(panel, context) {
    const { engineFile, recordId, row, onSaved } = context;

    const changes = getDirtyChanges(panel);
    if (Object.keys(changes).length === 0) {
        setEditorStatus(panel, 'Sin cambios para guardar.', '');
        return;
    }

    const engineModel = String(engineFile ?? '')
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '');

    const saveBtn = panel.querySelector('#reModalSaveBtn');
    const cancelBtn = panel.querySelector('#reModalCancelBtn');
    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;

    setEditorStatus(panel, 'Guardando...', '');

    try {
        const response = await fetch('/api/record-editor/update-record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                engine: engineModel,
                id: String(recordId),
                changes,
            }),
        });

        const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));

        if (!data?.ok) {
            throw new Error(String(data?.error || `Error HTTP ${response.status}`));
        }

        // Aplicar cambios al objeto row en memoria
        for (const [key, value] of Object.entries(changes)) {
            row[key] = value;
        }

        // Actualizar originales en el formulario
        panel.querySelectorAll('.re-field-input').forEach((input) => {
            const key = input.dataset.fieldKey;
            if (key && Object.prototype.hasOwnProperty.call(changes, key)) {
                input.dataset.original = String(changes[key]);
                const fieldRow = input.closest('.re-field-row');
                if (fieldRow) fieldRow.classList.remove('is-dirty');
            }
        });

        const updatedCount = Number(data.updatedCount) || Object.keys(changes).length;
        const fieldNames = (data.updatedFields || []).map((f) => f.field).join(', ')
            || Object.keys(changes).join(', ');

        setEditorStatus(panel, `Guardado: ${updatedCount} campo(s) actualizado(s).`, 'ok');

        const dirtyBadge = panel.querySelector('#reModalDirtyBadge');
        if (dirtyBadge instanceof HTMLElement) dirtyBadge.hidden = true;

        showToast(`${updatedCount} campo(s) guardado(s): ${fieldNames}`, 'ok');

        if (typeof onSaved === 'function') {
            onSaved({ row, changes, updatedFields: data.updatedFields || [] });
        }

    } catch (error) {
        console.error('[record-editor] Error al guardar:', error);
        setEditorStatus(panel, `Error: ${error.message}`, 'error');
        showToast(`No se pudo guardar: ${error.message}`, 'error');
    } finally {
        if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
        if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
    }
}

function resetEditorFields(panel) {
    panel.querySelectorAll('.re-field-input').forEach((input) => {
        input.value = String(input.dataset.original ?? '');
        const fieldRow = input.closest('.re-field-row');
        if (fieldRow) fieldRow.classList.remove('is-dirty');
    });
    const dirtyBadge = panel.querySelector('#reModalDirtyBadge');
    if (dirtyBadge instanceof HTMLElement) dirtyBadge.hidden = true;
    setEditorStatus(panel, '', '');
}

function closeEditor(force = false) {
    if (!_activeEditor) return;

    const { panel } = _activeEditor;
    const dirtyCount = Object.keys(getDirtyChanges(panel)).length;

    if (!force && dirtyCount > 0) {
        const confirmed = window.confirm('Hay cambios sin guardar. ¿Deseas cerrar y descartarlos?');
        if (!confirmed) return;
    }

    panel.hidden = true;
    panel.remove();
    _activeEditor = null;
}

/**
 * Abre el editor de registro para el row dado.
 *
 * @param {object} options
 * @param {object} options.row - objeto completo del registro
 * @param {string} options.engineFile - nombre del archivo engine_*.json
 * @param {string} [options.recordId] - ID del registro (default: row.ID)
 * @param {Function} [options.onSaved] - callback({ row, changes, updatedFields })
 */
export function openRecordEditor({ row, engineFile, recordId, onSaved } = {}) {
    if (!row || typeof row !== 'object') {
        showToast('No hay registro seleccionado para editar.', 'error');
        return;
    }

    if (!engineFile) {
        showToast('No se pudo determinar el archivo engine para este registro.', 'error');
        return;
    }

    const id = String(recordId ?? row?.ID ?? '').trim();
    if (!id) {
        showToast('El registro no tiene ID válido.', 'error');
        return;
    }

    // Cerrar editor previo si hay uno abierto
    if (_activeEditor) closeEditor(true);

    // Crear e insertar el modal
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildModalHtml(row, engineFile, id);
    document.body.appendChild(wrapper.firstElementChild);

    const panel = document.getElementById('recordEditorModal');
    if (!(panel instanceof HTMLElement)) return;

    panel.hidden = false;

    _activeEditor = { panel, row, engineFile, recordId: id };

    const context = { engineFile, recordId: id, row, onSaved };

    // Escucha cambios para marcar dirty
    panel.querySelector('#reModalForm')?.addEventListener('input', () => {
        markDirtyFields(panel);
    });

    // Cerrar
    panel.querySelector('#reModalCloseBtn')?.addEventListener('click', () => closeEditor());
    panel.querySelector('#reModalCancelBtn')?.addEventListener('click', () => closeEditor());
    panel.querySelector('.re-modal-backdrop')?.addEventListener('click', () => closeEditor());

    // Restablecer
    panel.querySelector('#reModalResetBtn')?.addEventListener('click', () => resetEditorFields(panel));

    // Guardar (submit del form)
    panel.querySelector('#reModalForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEditorChanges(panel, context);
    });

    // Guardar (botón explícito, para cuando no hay submit por Enter)
    panel.querySelector('#reModalSaveBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await saveEditorChanges(panel, context);
    });

    // Escape para cerrar
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            closeEditor();
            document.removeEventListener('keydown', onKeyDown);
        }
    };
    document.addEventListener('keydown', onKeyDown);

    // Foco inicial en primer campo
    panel.querySelector('.re-field-input')?.focus();
}

/**
 * Cierra el editor si está abierto.
 * Útil para cerrar desde código externo (ej: al cambiar de registro).
 */
export function closeRecordEditor(force = false) {
    closeEditor(force);
}
