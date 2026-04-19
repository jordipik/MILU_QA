/**
 * Punto de entrada principal de qa_milu.
 */

import { state } from './state.js';
import { escapeHtml, getRowErrors, getRowErrorType, getRowValueForColumn, val } from './helpers.js';
import { checkSaveBackendConnection, fetchJsonSafe, loadPartitionedEngineData, saveCellToServer } from './data-loader.js';
import {
    applyImportedRevisionToEngineJson,
    applyRevisionDataToRows,
    assignRevisionKeys,
    createRevisionExportPayload,
    getRevisionKey,
    handleExportRevision,
    handleImportRevisionFile,
    loadRevisionData,
    setRowRevision,
    setRowRevisionNoSave,
    updateRevisionSelectVisual
} from './revision.js';
import {
    applyColumnView,
    initColumnResize,
    loadColumnViewPreference,
    loadColumnWidths,
    saveColumnViewPreference
} from './column-view.js';
import { isInlineEditableTarget, cancelInlineEdit } from './cell-editor.js';
import { initPdfZoomControls, loadPdfClear, loadPdfWithPage, renderPdfPage, setPdfSelection } from './pdf-viewer.js';
import { updateSchemasInline, renderSelectedRowPosPanel, renderSelectedRowPosTop } from './schemas.js';
import './bulk-revision-helper.js';
import { getEngineJsonForRow } from './helpers.js';
import {
    changePage,
    focusRevisionRowInMainTable,
    getRowsForBulkScope,
    jumpToPage,
    moveSelectionBy,
    refreshVisibleRowByRevisionKey,
    renderPagination,
    renderTable,
    syncAutoPageSize,
    refreshSelectedRowVisual
} from './qa-table.js';

const $ = (id) => document.getElementById(id);
let filterTimeout = null;
let resizeTimer = null;
let backendStatusTimer = null;

function queueColumnViewRefresh() {
    requestAnimationFrame(() => {
        applyColumnView();
        requestAnimationFrame(() => applyColumnView());
    });
}

const QA_CHECKS_STORAGE_KEY = 'milu:qa-active-error-checks:v2';
const MODAL_FIELD_KEYS = [
    'POS',
    'pn_final',
    'designation_final',
    'weight_final',
    'measurement_final',
    'norma',
    'MODEL/TYPE',
    'QTY',
    'UNITS',
    'FN',
    'gesa',
    'normalizado',
    'sust_hierarchie',
    'has_img',
    'EN_WEB',
    'engine_model',
    'Source Page'
];
const SYNTHETIC_NEW_EXPORT_COLUMNS = [
    'Id',
    'fecha_version',
    'POS',
    'designation',
    'engine',
    'model_type',
    'type',
    'pn',
    'nsn',
    'GESA_NORM',
    'GESA_NORMALIZADO',
    'fg_code',
    'fg_description',
    'fg_code_description',
    'weight',
    'weight_txt',
    'measurement',
    'TIPOARTICULO',
    'PAG',
    'BOM_no',
    'esquema_general',
    'exp_motor',
    'exp_categorias',
    'atributo',
    'SUST_TIPO',
    'new_pn_relacionado',
    'old_pn_relacionados',
    'EN_EXCEL_SUSTITUCION',
    'ruta_foto',
    'exp_imagenes'
];
const SYNTHETIC_SUPERSEDED_EXPORT_COLUMNS = [
    ...SYNTHETIC_NEW_EXPORT_COLUMNS,
    'vinculo'
];
const modalUiState = {
    tableScrollTop: 0,
    tableScrollLeft: 0,
    windowScrollX: 0,
    windowScrollY: 0
};
let activeMatchesModalRevisionKey = '';

function setRightPanelTab(tabName) {
    const resolvedTab = tabName === 'record' ? 'record' : 'pdf';
    state.rightPanelTab = resolvedTab;

    document.querySelectorAll('[data-pdf-tab]').forEach(btn => {
        const isActive = btn.dataset.pdfTab === resolvedTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('[data-pdf-panel]').forEach(panel => {
        const isActive = panel.dataset.pdfPanel === resolvedTab;
        panel.classList.toggle('is-active', isActive);
        panel.toggleAttribute('hidden', !isActive);
    });

    if (resolvedTab === 'pdf' && state.currentPdfSource && state.currentPdfPageNumber > 0) {
        renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber)
            .catch(error => console.error('Error reajustando PDF al cambiar de pestaña:', error));
    }
}

function setBackendStatusBadge(status, message) {
    const statusWrap = $('backendStatus');
    const statusText = $('backendStatusText');
    if (!statusWrap || !statusText) return;

    statusWrap.classList.remove('checking', 'online', 'offline');
    statusWrap.classList.add(status);
    statusText.textContent = message;
}

async function refreshBackendStatus() {
    setBackendStatusBadge('checking', 'Backend: comprobando...');
    const result = await checkSaveBackendConnection();
    if (result.ok) {
        setBackendStatusBadge('online', 'Backend: conectado');
        return;
    }
    setBackendStatusBadge('offline', 'Backend: sin conexion');
}

function initBackendStatusMonitor() {
    refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));

    if (backendStatusTimer) clearInterval(backendStatusTimer);
    backendStatusTimer = setInterval(() => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    }, 30000);

    window.addEventListener('focus', () => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    });
}

function isRecordModalOpen() {
    const modal = $('qaRecordModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function isMatchesModalOpen() {
    const modal = $('qaMatchesModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function getBookEngineCode(row) {
    const sourceFile = String(row?.source_file ?? '').trim();
    if (sourceFile) return sourceFile.replace(/\.xlsx$/i, '');

    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';

    return engineModel
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '')
        .trim();
}


function getModalMatchesByPn(row) {
    const pn = normModalMatch(row?.['PART NO.'] ?? row?.pn ?? '');
    if (!pn) return [];
    return state.allData
        .filter(item => normModalMatch(item?.['PART NO.'] ?? item?.pn ?? '') === pn)
        .map(item => ({
            revisionKey: getRevisionKey(item),
            page: String(item?.['Source Page'] ?? ''),
            pos: String(item?.POS ?? ''),
            id: String(item?.ID ?? ''),
            partNumber: String(item?.['PART NO.'] ?? item?.pn ?? ''),
            estado: String(item?.qa_revision_estado ?? ''),
            designationFinal: String(item?.designation_final ?? item?.DESIGNATION ?? ''),
            weightFinal: String(item?.weight_final ?? ''),
            measurementFinal: String(item?.measurement_final ?? ''),
            fgsCodeDescription: String(item?.fgs_code_description ?? ''),
            accion: String(item?.qa_revision_accion ?? ''),
            book: getBookEngineCode(item)
        }));
}

function syncRecordModalBookFilter(row, matches, selectId = 'qaModalMatchesBookFilter') {
    const select = $(selectId);
    if (!(select instanceof HTMLSelectElement)) return;

    const currentBook = getBookEngineCode(row);
    const previousValue = String(select.value || '__current__');
    const books = [...new Set(matches.map(item => String(item.book || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

    const options = [
        { value: '__current__', label: currentBook ? `Libro actual (${currentBook})` : 'Libro actual' },
        { value: '__all__', label: 'Todos los libros' },
        ...books.map(book => ({ value: book, label: book }))
    ];

    select.innerHTML = options
        .map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
        .join('');

    const hasPrevious = options.some(opt => opt.value === previousValue);
    select.value = hasPrevious ? previousValue : '__current__';
}
function getRowByRevisionKey(revisionKey) {
    return state.allData.find(item => getRevisionKey(item) === revisionKey);
}

function normModalMatch(value) {
    return String(value ?? '').trim().toLowerCase();
}

function pageSortValue(page) {
    const raw = String(page ?? '').trim();
    const numeric = Number(raw.replace(/[^0-9]/g, ''));
    return Number.isFinite(numeric) && !Number.isNaN(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function formatModalExportValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }
    return String(value);
}

function normalizeComparisonValue(value) {
    return formatModalExportValue(value)
        .replace(/\s+/g, ' ')
        .trim();
}

function formatExportVersionStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}.${hour}${minute}`;
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeModelTypeForExport(row) {
    const rawModel = String(row?.model ?? '').trim();
    if (rawModel) return rawModel;

    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';
    return engineModel.replace('4000', '').trim();
}

function normalizePageLabelForExport(row) {
    const book = String(row?.engine_model ?? '').trim();
    const pageRaw = String(row?.['Source Page'] ?? '').trim();
    if (!book || !pageRaw) return '';
    const digits = pageRaw.replace(/[^0-9]/g, '');
    const page = digits ? digits.padStart(4, '0') : pageRaw;
    return `${book}-${page}`;
}

function getPreferredRowsForPn(row) {
    const currentPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    if (!currentPn) return [];
    const normalizedPn = normModalMatch(currentPn);
    return state.allData.filter(item => normModalMatch(item?.['PART NO.'] ?? item?.pn ?? '') === normalizedPn);
}

function getMiluNewRowForPn(row) {
    const currentPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    if (!currentPn || !Array.isArray(state.miluNewData) || !state.miluNewData.length) return null;
    const normalizedPn = normModalMatch(currentPn);
    return state.miluNewData.find(item => normModalMatch(item?.pn ?? '') === normalizedPn) || null;
}

function isSupersededArticle(row) {
    const hierarchy = String(row?.sust_hierarchie ?? '').trim().toUpperCase();
    return hierarchy.includes('SUPERSEDED');
}

function uniqueSortedValues(values, compareAsNumeric = false) {
    const unique = [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
    return unique.sort((a, b) => {
        if (compareAsNumeric) {
            return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
        }
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
}

function parseWeightNumber(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const normalized = text.replace(/\s+/g, ' ');
    const match = normalized.match(/(\d+[\d.,]*)\s*(KGM|KG|G)\b/i);
    if (!match) return null;

    let numericText = match[1].replace(/\s/g, '');
    if (numericText.includes(',') && numericText.includes('.')) {
        numericText = numericText.replace(/\./g, '').replace(',', '.');
    } else if (numericText.includes(',')) {
        numericText = numericText.replace(',', '.');
    }

    const parsed = Number(numericText);
    if (!Number.isFinite(parsed)) return null;

    const unit = match[2].toUpperCase();
    if (unit === 'G') return parsed / 1000;
    return parsed;
}

function resolveWeightForExport(row) {
    const gesaWeight = Number(row?.weight_gesa);
    if (Number.isFinite(gesaWeight)) return gesaWeight;

    const finalWeight = parseWeightNumber(getRowValueForColumn(row, 'weight_final', ''));
    if (Number.isFinite(finalWeight)) return finalWeight;

    return parseWeightNumber(row?.WEIGHT);
}

function formatWeightTextForExport(row, weightValue) {
    if (!Number.isFinite(weightValue)) {
        return String(getRowValueForColumn(row, 'weight_final', '') || row?.WEIGHT || '').trim();
    }
    const unit = String(row?.units || 'KGM').trim() || 'KGM';
    return `${weightValue.toFixed(3)} ${unit}`;
}

function resolveMeasurementForExport(row) {
    const gesaMeasurement = String(row?.dimensions_gesa ?? '').trim().replace(/\s{2,}/g, ' ');
    if (gesaMeasurement) return gesaMeasurement;

    let rawMeasurement = String(row?.['MEASUREMENT / STANDARD'] ?? '').trim().replace(/\s{2,}/g, ' ');
    const norma = String(row?.norma ?? '').trim();
    if (rawMeasurement && norma) {
        rawMeasurement = rawMeasurement.replace(new RegExp(`\\b${escapeRegExp(norma)}\\b`, 'ig'), '').trim();
    }
    if (rawMeasurement) return rawMeasurement;

    return String(row?.measurement_final ?? '').trim().replace(/\s{2,}/g, ' ');
}

function firstNonEmptyValue(rows, getter) {
    for (const row of rows) {
        const value = getter(row);
        if (value != null && String(value).trim() !== '') return value;
    }
    return null;
}

function mergeImageValues(primaryValue, secondaryValue) {
    const merged = [];
    const seen = new Set();

    const addValue = (value) => {
        const parts = String(value ?? '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
        for (const part of parts) {
            const key = normModalMatch(part);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(part);
        }
    };

    addValue(primaryValue);
    addValue(secondaryValue);
    return merged.join(', ');
}

function buildSyntheticNewExportRow(row) {
    const matches = getPreferredRowsForPn(row);
    if (!matches.length) return null;
    if (isSupersededArticle(row)) return null;

    const weightValue = resolveWeightForExport(row);
    const pageLabels = uniqueSortedValues(matches.map(item => normalizePageLabelForExport(item)), true);
    const modelTypes = uniqueSortedValues(matches.map(item => normalizeModelTypeForExport(item)), true);
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || item?.ruta_foto || '');
    const routeFotoValue = firstNonEmptyValue([row, ...matches], item => item?.ruta_foto || '');
    const exportImagesValue = mergeImageValues(routeFotoValue, imageValue);
    const normalizedPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const supersededList = String(row?.sust_superseded_list ?? '').trim();
    const hasSubstitution = hierarchy !== '' || supersededList !== '' || String(row?.sust_new_part_number ?? '').trim() !== '';

    return {
        Id: String(row?.ID ?? '').trim(),
        fecha_version: formatExportVersionStamp(),
        POS: String(row?.POS ?? '').trim(),
        designation: String(getRowValueForColumn(row, 'designation_final', '')).trim(),
        engine: String(row?.engine ?? '').trim() || '4000',
        model_type: modelTypes.join(', '),
        type: '',
        pn: normalizedPn,
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: Number.isFinite(weightValue) ? Number(weightValue.toFixed(3)) : '',
        weight_txt: formatWeightTextForExport(row, weightValue),
        measurement: resolveMeasurementForExport(row),
        TIPOARTICULO: String(row?.TIPOARTICULO ?? '').trim() || 'piezas',
        PAG: pageLabels.join(', '),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || null,
        new_pn_relacionado: hierarchy === 'New'
            ? normalizedPn
            : (String(row?.sust_new_part_number ?? '').trim() || null),
        old_pn_relacionados: supersededList || null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: routeFotoValue,
        exp_imagenes: exportImagesValue
    };
}

function buildSyntheticSupersededExportRow(row) {
    const matches = getPreferredRowsForPn(row);
    if (!matches.length) return null;
    if (!isSupersededArticle(row)) return null;

    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const relatedNewPn = String(row?.sust_new_part_number ?? '').trim()
        || String(row?.['New Part Number'] ?? '').trim();
    if (!relatedNewPn && hierarchy !== 'Superseded') return null;

    const weightValue = resolveWeightForExport(row);
    const pageLabels = uniqueSortedValues(matches.map(item => normalizePageLabelForExport(item)), true);
    const modelTypes = uniqueSortedValues(matches.map(item => normalizeModelTypeForExport(item)), true);
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || item?.ruta_foto || '');
    const routeFotoValue = firstNonEmptyValue([row, ...matches], item => item?.ruta_foto || '');
    const exportImagesValue = mergeImageValues(routeFotoValue, imageValue);
    const normalizedPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const resolvedRelatedPn = relatedNewPn || normalizedPn;
    const hasSubstitution = hierarchy === 'Superseded' || resolvedRelatedPn !== '';

    return {
        Id: String(row?.ID ?? '').trim(),
        fecha_version: formatExportVersionStamp(),
        POS: String(row?.POS ?? '').trim(),
        designation: String(getRowValueForColumn(row, 'designation_final', '')).trim(),
        engine: String(row?.engine ?? '').trim() || '4000',
        model_type: modelTypes.join(', '),
        type: '',
        pn: normalizedPn,
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: Number.isFinite(weightValue) ? Number(weightValue.toFixed(3)) : '',
        weight_txt: formatWeightTextForExport(row, weightValue),
        measurement: resolveMeasurementForExport(row),
        TIPOARTICULO: String(row?.TIPOARTICULO ?? '').trim() || 'piezas',
        PAG: pageLabels.join(', '),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || 'Superseded',
        new_pn_relacionado: resolvedRelatedPn || null,
        old_pn_relacionados: null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: routeFotoValue,
        exp_imagenes: exportImagesValue,
        vinculo: resolvedRelatedPn ? `milu-naval.mystagingwebsite.com/producto/${resolvedRelatedPn}` : ''
    };
}

function setModalSectionVisibility(tableBodyElement, visible) {
    const section = tableBodyElement?.closest('section.qa-modal-related');
    if (section instanceof HTMLElement) {
        section.hidden = false;
    }
}

function getModalExportColumns(matches) {
    const columns = [];
    const seen = new Set();
    for (const item of matches) {
        for (const key of Object.keys(item || {})) {
            if (seen.has(key)) continue;
            seen.add(key);
            columns.push(key);
        }
    }
    return columns;
}

function renderRecordModalExport(row, options = {}) {
    const {
        headRowId = 'qaModalExportHeadRow',
        bodyId = 'qaModalExportBody',
        countId = 'qaModalExportCount'
    } = options;
    const headRow = $(headRowId);
    const body = $(bodyId);
    const count = $(countId);
    if (!(headRow instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    const syntheticRow = buildSyntheticNewExportRow(row);
    if (!syntheticRow) {
        headRow.innerHTML = '<th>Sin datos</th>';
        body.innerHTML = '<tr><td>No se pudo determinar el codigo PN del registro.</td></tr>';
        if (count) count.textContent = '0 registros';
        setModalSectionVisibility(body, false);
        return;
    }

    const sourceMatches = getPreferredRowsForPn(row);
    const miluNewRow = getMiluNewRowForPn(row);
    const matches = [
        ...(miluNewRow ? [{ origen: 'MILU_New_v506', ...miluNewRow }] : []),
        { origen: 'Synthetic', ...syntheticRow }
    ];
    const columns = ['origen', ...SYNTHETIC_NEW_EXPORT_COLUMNS];
    const diffColumns = new Set();
    const volatileComparisonColumns = new Set(['Id', 'fecha_version']);
    const warningComparisonColumns = new Set(['exp_categorias', 'atributo']);
    if (matches.length >= 2) {
        const firstRow = matches[0];
        const lastRow = matches[matches.length - 1];
        columns.forEach(col => {
            if (col === 'origen') return;
            if (volatileComparisonColumns.has(col)) return;
            const firstValue = normalizeComparisonValue(firstRow?.[col]);
            const lastValue = normalizeComparisonValue(lastRow?.[col]);
            if (firstValue !== lastValue) diffColumns.add(col);
        });
    }
    const hasWarningMismatch = [...diffColumns].some(col => warningComparisonColumns.has(col));
    const hasCriticalMismatch = [...diffColumns].some(col => !warningComparisonColumns.has(col));
    headRow.innerHTML = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('');

    body.innerHTML = matches.map((item, rowIndex) => '<tr>'
        + columns.map(col => {
            const rawValue = formatModalExportValue(item?.[col]);
            const displayValue = rawValue || '-';
            const isComparedEdgeRow = rowIndex === 0 || rowIndex === matches.length - 1;
            const isFieldMismatch = isComparedEdgeRow && diffColumns.has(col);
            const isWarningFieldMismatch = isFieldMismatch && warningComparisonColumns.has(col);
            const isCriticalFieldMismatch = isFieldMismatch && !warningComparisonColumns.has(col);
            const isOriginCriticalFlag = isComparedEdgeRow && col === 'origen' && hasCriticalMismatch;
            const isOriginWarningFlag = isComparedEdgeRow && col === 'origen' && !hasCriticalMismatch && hasWarningMismatch;
            const tdClasses = [
                isCriticalFieldMismatch ? 'qa-modal-cell-diff' : '',
                isWarningFieldMismatch ? 'qa-modal-cell-diff-warn' : '',
                isOriginCriticalFlag ? 'qa-modal-cell-diff-origin' : '',
                isOriginWarningFlag ? 'qa-modal-cell-diff-origin-warn' : ''
            ].filter(Boolean).join(' ');
            return `<td class="${tdClasses}" title="${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</td>`;
        }).join('')
        + '</tr>').join('');

    if (count) {
        const comparedRows = matches.length;
        const comparedLabel = miluNewRow ? '2 registros comparados (v506 + synthetic)' : '1 registro (solo synthetic; sin match en v506)';
        count.textContent = `${comparedLabel} · ${sourceMatches.length} aparicion${sourceMatches.length === 1 ? '' : 'es'}`;
    }
    setModalSectionVisibility(body, true);
}

function renderRecordModalSuperseded(row, options = {}) {
    const {
        headRowId = 'qaModalSupersededHeadRow',
        bodyId = 'qaModalSupersededBody',
        countId = 'qaModalSupersededCount'
    } = options;
    const headRow = $(headRowId);
    const body = $(bodyId);
    const count = $(countId);
    if (!(headRow instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    const syntheticRow = buildSyntheticSupersededExportRow(row);
    if (!syntheticRow) {
        headRow.innerHTML = '<th>Sin datos</th>';
        body.innerHTML = '<tr><td>El registro no tiene datos suficientes para reconstruir MILU_Superseded.</td></tr>';
        if (count) count.textContent = '0 registros';
        setModalSectionVisibility(body, false);
        return;
    }

    const sourceMatches = getPreferredRowsForPn(row);
    const matches = [syntheticRow];
    const columns = SYNTHETIC_SUPERSEDED_EXPORT_COLUMNS.filter(col => Object.prototype.hasOwnProperty.call(syntheticRow, col));
    headRow.innerHTML = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('');

    body.innerHTML = matches.map(item => '<tr>'
        + columns.map(col => {
            const rawValue = formatModalExportValue(item?.[col]);
            const displayValue = rawValue || '-';
            return `<td title="${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</td>`;
        }).join('')
        + '</tr>').join('');

    if (count) count.textContent = `1 registro reconstruido · ${sourceMatches.length} aparicion${sourceMatches.length === 1 ? '' : 'es'}`;
    setModalSectionVisibility(body, true);
}

function renderRecordModalMatches(row, currentRevisionKey, options = {}) {
    const {
        bodyId = 'qaModalMatchesBody',
        countId = 'qaModalMatchesCount',
        bookFilterId = 'qaModalMatchesBookFilter',
        showAction = true
    } = options;
    const body = $(bodyId);
    const count = $(countId);
    if (!(body instanceof HTMLElement)) return;

    const matchesByPn = getModalMatchesByPn(row);
    const currentBook = normModalMatch(getBookEngineCode(row));

    const emptyColspan = 5;

    if (!matchesByPn.length) {
        body.innerHTML = `<tr><td colspan="${emptyColspan}">No se pudo determinar PN/libro del registro.</td></tr>`;
        if (count) count.textContent = '0 coincidencias';
        setModalSectionVisibility(body, false);
        return;
    }

    syncRecordModalBookFilter(row, matchesByPn, bookFilterId);
    const selectedBookFilter = String($(bookFilterId)?.value || '__current__');

    const filteredMatches = matchesByPn.filter(item => {
        const itemBook = normModalMatch(item.book);
        if (selectedBookFilter === '__all__') return true;
        if (selectedBookFilter === '__current__') return !!currentBook && itemBook === currentBook;
        return itemBook === normModalMatch(selectedBookFilter);
    });

    const matches = filteredMatches
        .sort((a, b) => {
            const byBook = String(a.book || '').localeCompare(String(b.book || ''), 'es', { numeric: true, sensitivity: 'base' });
            if (byBook !== 0) return byBook;
            const byPage = pageSortValue(a.page) - pageSortValue(b.page);
            if (byPage !== 0) return byPage;
            const byPos = a.pos.localeCompare(b.pos, 'es', { numeric: true, sensitivity: 'base' });
            if (byPos !== 0) return byPos;
            return a.id.localeCompare(b.id, 'es', { numeric: true, sensitivity: 'base' });
        });

    if (!matches.length) {
        body.innerHTML = `<tr><td colspan="${emptyColspan}">Sin coincidencias para el filtro seleccionado.</td></tr>`;
        if (count) count.textContent = '0 coincidencias';
        setModalSectionVisibility(body, false);
        return;
    }

    body.innerHTML = matches.map(item => {
        const isCurrent = item.revisionKey === currentRevisionKey;
        const revisionKeyAttr = escapeHtml(String(item.revisionKey || ''));
        const normalizedEstado = normModalMatch(item.estado);
        const isOkStatus = normalizedEstado === 'revisado' || normalizedEstado === 'ok';
        const sideStatusClass = isOkStatus ? 'ok' : 'ko';
        const sideStatusLabel = isOkStatus ? 'OK' : 'KO';
        return `<tr class="${isCurrent ? 'qa-modal-related-current' : ''}" data-revision-key="${revisionKeyAttr}" title="Doble click para ir al registro en tabla principal">`
            + `<td>${escapeHtml(item.book || '-')}</td>`
            + `<td>${escapeHtml(item.page || '-')}</td>`
            + `<td>${escapeHtml(item.pos || '-')}</td>`
            + (showAction
                ? `<td>${escapeHtml(item.designationFinal || '-')}</td><td>${escapeHtml(item.accion || '-')}</td>`
                : `<td class="qa-side-match-part-number">${escapeHtml(item.partNumber || '-')}</td><td><span class="qa-side-match-st ${sideStatusClass}">${sideStatusLabel}</span></td>`)
            + '</tr>';
    }).join('');

    if (count) count.textContent = `${matches.length} coincidencias`;
    setModalSectionVisibility(body, true);
}

function getQaErrorDefinitionMap() {
    return new Map((state.qaErrorCheckDefinitions || [])
        .map(def => [String(def?.code || '').trim(), String(def?.label || def?.code || '').trim()])
        .filter(([code]) => code));
}

function getQaActiveSignature(activeCodes) {
    return [...new Set((activeCodes || []).map(code => String(code || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

function buildRowActiveQaErrors(row, activeCodes) {
    const activeSet = new Set((activeCodes || []).map(code => String(code || '').trim()).filter(Boolean));
    const source = row?.qa_errors;
    if (!source || typeof source !== 'object') {
        return {
            version: 1,
            severity: 'none',
            codes: [],
            fields: {},
            issues: [],
            signature: getQaActiveSignature(activeCodes),
            updated_at: new Date().toISOString()
        };
    }

    const codes = Array.isArray(source.codes) ? source.codes.filter(code => activeSet.has(String(code || '').trim())) : [];
    const issues = Array.isArray(source.issues)
        ? source.issues.filter(issue => activeSet.has(String(issue?.code || '').trim()))
        : [];
    const fields = {};
    issues.forEach(issue => {
        (Array.isArray(issue?.fields) ? issue.fields : []).forEach(field => {
            const normalizedField = String(field || '').trim();
            const normalizedCode = String(issue?.code || '').trim();
            if (!normalizedField || !normalizedCode) return;
            if (!fields[normalizedField]) fields[normalizedField] = [];
            if (!fields[normalizedField].includes(normalizedCode)) fields[normalizedField].push(normalizedCode);
        });
    });

    const severity = issues.length > 0 ? 'critical' : 'none';

    return {
        version: Number(source.version || 1),
        severity,
        codes,
        fields,
        issues,
        signature: getQaActiveSignature(activeCodes),
        updated_at: String(source.updated_at || new Date().toISOString())
    };
}

function applyActiveQaErrorsToClientRows(activeCodes) {
    state.allData.forEach(row => {
        row.qa_errors_active = buildRowActiveQaErrors(row, activeCodes);
    });
}

function applyActiveQaErrorsToSubset(activeCodes, rows) {
    (rows || []).forEach(row => {
        row.qa_errors_active = buildRowActiveQaErrors(row, activeCodes);
    });
}

function applyQaRowsFromServer(updates) {
    if (!Array.isArray(updates) || updates.length === 0) return;

    const byRevisionKey = new Map(state.allData.map(row => [String(getRevisionKey(row) || ''), row]));
    updates.forEach((entry) => {
        const key = String(entry?.revisionKey || '').trim();
        if (!key) return;
        const row = byRevisionKey.get(key);
        if (!row) return;

        if (entry?.qa_errors && typeof entry.qa_errors === 'object') {
            row.qa_errors = entry.qa_errors;
        }
        if (entry?.qa_errors_active && typeof entry.qa_errors_active === 'object') {
            row.qa_errors_active = entry.qa_errors_active;
        }
    });
}

function buildQaStatsFromRows(rows, activeCodes) {
    const activeSet = new Set((activeCodes || []).map(code => String(code || '').trim()).filter(Boolean));
    const totals = {
        totalRows: 0,
        rowsWithErrors: 0,
        rowsOk: 0,
        severityCount: { critical: 0, warning: 0, none: 0 },
        codeCount: {}
    };

    (rows || []).forEach(row => {
        totals.totalRows += 1;
        const activeErrors = buildRowActiveQaErrors(row, activeSet);
        const hasErrors = Array.isArray(activeErrors?.codes) && activeErrors.codes.length > 0;
        if (hasErrors) totals.rowsWithErrors += 1;
        else totals.rowsOk += 1;

        if (hasErrors) totals.severityCount.critical += 1;
        else totals.severityCount.none += 1;

        (activeErrors.codes || []).forEach(code => {
            const normalizedCode = String(code || '').trim();
            if (!normalizedCode) return;
            totals.codeCount[normalizedCode] = Number(totals.codeCount[normalizedCode] || 0) + 1;
        });
    });

    return totals;
}

function renderRecordQaErrors(row, options = {}) {
    const summaryId = options.summaryId || 'qaModalErrorsSummary';
    const listId = options.listId || 'qaModalErrorsList';
    const summary = $(summaryId);
    const list = $(listId);
    if (!(summary instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

    const activeCodes = state.activeQaErrorChecks instanceof Set ? state.activeQaErrorChecks : new Set();
    const type = getRowErrorType(row, { activeCodes }) || 'none';
    const definitionMap = getQaErrorDefinitionMap();
    const sourceErrors = row?.qa_errors_active && row.qa_errors_active.signature === getQaActiveSignature([...activeCodes])
        ? row.qa_errors_active
        : row?.qa_errors;
    const rawIssues = Array.isArray(sourceErrors?.issues) ? sourceErrors.issues : [];
    const filteredIssues = rawIssues.filter(issue => {
        const code = String(issue?.code || '').trim();
        return code && activeCodes.has(code);
    });

    const fallbackCodes = getRowErrors(row, { activeCodes });
    const issueItems = filteredIssues.length > 0
        ? filteredIssues.map(issue => {
            const code = String(issue?.code || '').trim();
            const fields = Array.isArray(issue?.fields) ? issue.fields.filter(Boolean).join(', ') : '';
            const label = definitionMap.get(code) || code;
            const message = String(issue?.message || '').trim() || label;
            const severity = type === 'critical' ? 'critical' : String(issue?.severity || type || 'warning').trim();
            const fieldHtml = fields ? `<span class="qa-record-errors-fields">${escapeHtml(fields)}</span>` : '';
            return `<li class="qa-record-errors-item is-${escapeHtml(severity)}">
                <div class="qa-record-errors-item-main">
                    <span class="qa-record-errors-code">${escapeHtml(label)}</span>
                    ${fieldHtml}
                </div>
                <span class="qa-record-errors-message">${escapeHtml(message)}</span>
            </li>`;
        })
        : fallbackCodes.map(code => {
            const label = definitionMap.get(code) || code;
            return `<li class="qa-record-errors-item is-${escapeHtml(type === 'critical' ? 'critical' : 'warning')}">
                <div class="qa-record-errors-item-main">
                    <span class="qa-record-errors-code">${escapeHtml(label)}</span>
                </div>
                <span class="qa-record-errors-message">Error activo en este registro.</span>
            </li>`;
        });

    if (issueItems.length === 0) {
        summary.innerHTML = '<span class="qa-record-errors-pill is-ok">Sin errores activos</span>';
        list.innerHTML = '<li class="qa-record-errors-empty">Este registro no tiene errores para las comprobaciones activas.</li>';
        return;
    }

    const severityLabel = type === 'critical' ? 'Criticos' : 'Avisos';
    summary.innerHTML = `<span class="qa-record-errors-pill is-${escapeHtml(type)}">${issueItems.length} ${escapeHtml(severityLabel)}</span>`;
    list.innerHTML = issueItems.join('');
}

function fillRecordModal(row, revisionKey) {
    const form = $('qaRecordModalForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = revisionKey;
    $('qaModalId').value = String(row?.ID ?? '');
    $('qaModalPn').value = String(row?.['PART NO.'] ?? row?.pn ?? '');
    $('qaModalBook').value = String(row?.engine_model ?? '');
    $('qaModalPage').value = String(row?.['Source Page'] ?? '');
    $('qaModalPos').value = String(row?.POS ?? '');
    $('qaModalGesa').value = String(row?.gesa ?? '');
    $('qaModalNormalizado').value = String(row?.normalizado ?? '');
    $('qaModalSustHierarchie').value = String(row?.sust_hierarchie ?? '');
    $('qaModalHasImg').value = String(row?.has_img ?? '');
    $('qaModalEnWeb').value = String(row?.EN_WEB ?? '');

    $('qaModalRevisionEstado').value = String(row?.qa_revision_estado || '');
    $('qaModalRevisionAccion').value = String(row?.qa_revision_accion || '');
    $('qaModalPnFinal').value = String(row?.pn_final ?? '');
    $('qaModalDesignationFinal').value = String(row?.designation_final ?? '');
    $('qaModalModelType').value = String(row?.['MODEL/TYPE'] ?? '');
    $('qaModalQty').value = String(row?.QTY ?? '');
    $('qaModalUnits').value = String(row?.UNITS ?? '');
    $('qaModalWeightFinal').value = String(row?.weight_final ?? '');
    $('qaModalFn').value = String(row?.FN ?? '');
    $('qaModalMeasurementFinal').value = String(row?.measurement_final ?? '');
    $('qaModalNorma').value = String(row?.norma ?? '');

    renderRecordQaErrors(row);
    renderRecordModalMatches(row, revisionKey);
    renderRecordModalExport(row);
    renderRecordModalSuperseded(row);

    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

function fillSideRecordForm(row, revisionKey) {
    const form = $('qaSideRecordForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = revisionKey;
    $('qaSideId').value = String(row?.ID ?? '');
    $('qaSidePn').value = String(row?.['PART NO.'] ?? row?.pn ?? '');
    $('qaSideBook').value = String(row?.engine_model ?? '');
    $('qaSidePage').value = String(row?.['Source Page'] ?? '');
    $('qaSidePos').value = String(row?.POS ?? '');
    $('qaSideGesa').value = String(row?.gesa ?? '');
    $('qaSideNormalizado').value = String(row?.normalizado ?? '');
    $('qaSideSustHierarchie').value = String(row?.sust_hierarchie ?? '');
    $('qaSideHasImg').value = String(row?.has_img ?? '');
    $('qaSideEnWeb').value = String(row?.EN_WEB ?? '');

    $('qaSideRevisionEstado').value = String(row?.qa_revision_estado || '');
    $('qaSideRevisionAccion').value = String(row?.qa_revision_accion || '');
    $('qaSidePnFinal').value = String(row?.pn_final ?? '');
    $('qaSideDesignationFinal').value = String(row?.designation_final ?? '');
    $('qaSideModelType').value = String(row?.['MODEL/TYPE'] ?? '');
    $('qaSideQty').value = String(row?.QTY ?? '');
    $('qaSideUnits').value = String(row?.UNITS ?? '');
    $('qaSideWeightFinal').value = String(row?.weight_final ?? '');
    $('qaSideFn').value = String(row?.FN ?? '');
    $('qaSideMeasurementFinal').value = String(row?.measurement_final ?? '');
    $('qaSideNorma').value = String(row?.norma ?? '');

    const sideLabel = $('qaSideLabel');
    if (sideLabel) {
        sideLabel.textContent = `${String(row?.engine_model ?? '-')} • pág ${String(row?.['Source Page'] ?? '-')} • ID ${String(row?.ID ?? '-')}`;
    }

    renderRecordQaErrors(row, {
        summaryId: 'qaSideErrorsSummary',
        listId: 'qaSideErrorsList'
    });
    renderRecordModalMatches(row, revisionKey, {
        bodyId: 'qaSideMatchesBody',
        countId: 'qaSideMatchesCount',
        bookFilterId: 'qaSideMatchesBookFilter',
        showAction: false
    });
    renderRecordModalExport(row, {
        headRowId: 'qaSideExportHeadRow',
        bodyId: 'qaSideExportBody',
        countId: 'qaSideExportCount'
    });
    renderRecordModalSuperseded(row, {
        headRowId: 'qaSideSupersededHeadRow',
        bodyId: 'qaSideSupersededBody',
        countId: 'qaSideSupersededCount'
    });

    const status = $('qaSideStatus');
    if (status) status.textContent = '';
}

function getRecordFormValues(scope) {
    const prefix = scope === 'side' ? 'qaSide' : 'qaModal';
    return {
        POS: String($(`${prefix}Pos`)?.value || ''),
        pn_final: String($(`${prefix}PnFinal`)?.value || ''),
        designation_final: String($(`${prefix}DesignationFinal`)?.value || ''),
        weight_final: String($(`${prefix}WeightFinal`)?.value || ''),
        measurement_final: String($(`${prefix}MeasurementFinal`)?.value || ''),
        norma: String($(`${prefix}Norma`)?.value || ''),
        'MODEL/TYPE': String($(`${prefix}ModelType`)?.value || ''),
        QTY: String($(`${prefix}Qty`)?.value || ''),
        UNITS: String($(`${prefix}Units`)?.value || ''),
        FN: String($(`${prefix}Fn`)?.value || ''),
        gesa: String($(`${prefix}Gesa`)?.value || ''),
        normalizado: String($(`${prefix}Normalizado`)?.value || ''),
        sust_hierarchie: String($(`${prefix}SustHierarchie`)?.value || ''),
        has_img: String($(`${prefix}HasImg`)?.value || ''),
        EN_WEB: String($(`${prefix}EnWeb`)?.value || ''),
        engine_model: String($(`${prefix}Book`)?.value || ''),
        'Source Page': String($(`${prefix}Page`)?.value || '')
    };
}

function clearSideRecordForm() {
    const form = $('qaSideRecordForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = '';
    form.querySelectorAll('input').forEach(input => { input.value = ''; });
    form.querySelectorAll('select').forEach(select => {
        if (select.id === 'qaSideMatchesBookFilter') select.value = '__current__';
        else select.value = '';
    });

    const sideLabel = $('qaSideLabel');
    if (sideLabel) sideLabel.textContent = 'Selecciona una fila para cargar la ficha';

    $('qaSideMatchesBody').innerHTML = '<tr><td colspan="5">Sin seleccion</td></tr>';
    $('qaSideExportHeadRow').innerHTML = '<th>Sin datos</th>';
    $('qaSideExportBody').innerHTML = '<tr><td>Sin seleccion.</td></tr>';
    $('qaSideSupersededHeadRow').innerHTML = '<th>Sin datos</th>';
    $('qaSideSupersededBody').innerHTML = '<tr><td>Sin seleccion.</td></tr>';
    $('qaSideErrorsSummary').innerHTML = '<span class="qa-record-errors-pill is-empty">Sin seleccion</span>';
    $('qaSideErrorsList').innerHTML = '<li class="qa-record-errors-empty">Selecciona una fila para ver sus errores.</li>';
    const status = $('qaSideStatus');
    if (status) status.textContent = 'Selecciona una fila para editarla aqui.';
    if (isMatchesModalOpen()) closeMatchesModal();
}

function syncSideRecordFormWithSelection() {
    const revisionKey = String(state.selectedRevisionRowKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row || !revisionKey) {
        clearSideRecordForm();
        return;
    }
    fillSideRecordForm(row, revisionKey);
    if (isMatchesModalOpen()) {
        activeMatchesModalRevisionKey = revisionKey;
        renderMatchesLargeModal(revisionKey);
    }
}

function captureModalUiState() {
    const tableWrap = $('mainTableWrap');
    if (tableWrap instanceof HTMLElement) {
        modalUiState.tableScrollTop = tableWrap.scrollTop;
        modalUiState.tableScrollLeft = tableWrap.scrollLeft;
    }
    modalUiState.windowScrollX = window.scrollX || 0;
    modalUiState.windowScrollY = window.scrollY || 0;
}

function restoreModalUiState(revisionKey) {
    const tableWrap = $('mainTableWrap');
    if (tableWrap instanceof HTMLElement) {
        tableWrap.scrollTop = modalUiState.tableScrollTop;
        tableWrap.scrollLeft = modalUiState.tableScrollLeft;
    }
    window.scrollTo(modalUiState.windowScrollX, modalUiState.windowScrollY);

    const safeKey = String(revisionKey || '').replace(/"/g, '\\"');
    if (!safeKey) return;
    const targetRow = document.querySelector(`#tbody tr[data-revision-key="${safeKey}"]`);
    if (!(targetRow instanceof HTMLTableRowElement)) return;
    const editBtn = targetRow.querySelector('button[data-open-record-modal="true"]');
    if (editBtn instanceof HTMLButtonElement) {
        editBtn.focus({ preventScroll: true });
        return;
    }
    targetRow.scrollIntoView({ block: 'nearest' });
}

function openRecordModal(revisionKey) {
    const row = getRowByRevisionKey(revisionKey);
    const modal = $('qaRecordModal');
    if (!row || !modal) return;
    captureModalUiState();
    fillRecordModal(row, revisionKey);
    modal.removeAttribute('hidden');
    const firstInput = $('qaModalRevisionEstado');
    if (firstInput instanceof HTMLElement) firstInput.focus();
}

function closeRecordModal() {
    const modal = $('qaRecordModal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

function renderMatchesLargeModal(revisionKey = activeMatchesModalRevisionKey) {
    const body = $('qaMatchesModalBody');
    const count = $('qaMatchesModalCount');
    const pnLabel = $('qaMatchesModalPn');
    const currentLabel = $('qaMatchesModalCurrent');
    const row = getRowByRevisionKey(revisionKey);

    if (!(body instanceof HTMLElement) || !row || !revisionKey) {
        if (body instanceof HTMLElement) {
            body.innerHTML = '<tr><td colspan="8">Selecciona un registro en la ficha para ver apariciones.</td></tr>';
        }
        if (count) count.textContent = '0';
        if (pnLabel) pnLabel.textContent = '-';
        if (currentLabel) currentLabel.textContent = '-';
        return;
    }

    const currentBook = normModalMatch(getBookEngineCode(row));
    const matchesByPn = getModalMatchesByPn(row);
    const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim() || '-';
    if (pnLabel) pnLabel.textContent = pn;
    if (currentLabel) {
        currentLabel.textContent = `${String(row?.engine_model || '-')} · pag ${String(row?.['Source Page'] || '-')} · pos ${String(row?.POS || '-')}`;
    }

    if (!matchesByPn.length) {
        body.innerHTML = '<tr><td colspan="8">No se pudo determinar PN/libro del registro.</td></tr>';
        if (count) count.textContent = '0';
        return;
    }

    syncRecordModalBookFilter(row, matchesByPn, 'qaMatchesModalBookFilter');

    const selectedBookFilter = String($('qaMatchesModalBookFilter')?.value || '__current__');
    const pageFilter = normModalMatch($('qaMatchesModalPageFilter')?.value || '');
    const posFilter = normModalMatch($('qaMatchesModalPosFilter')?.value || '');
    const idFilter = normModalMatch($('qaMatchesModalIdFilter')?.value || '');
    const textFilter = normModalMatch($('qaMatchesModalTextFilter')?.value || '');

    const filteredMatches = matchesByPn.filter(item => {
        const itemBook = normModalMatch(item.book);
        if (selectedBookFilter === '__all__') {
            // No aplicar filtro de libro.
        } else if (selectedBookFilter === '__current__') {
            if (!currentBook || itemBook !== currentBook) return false;
        } else if (itemBook !== normModalMatch(selectedBookFilter)) {
            return false;
        }

        if (pageFilter && !normModalMatch(item.page).includes(pageFilter)) return false;
        if (posFilter && !normModalMatch(item.pos).includes(posFilter)) return false;
        if (idFilter && !normModalMatch(item.id).includes(idFilter)) return false;

        if (textFilter) {
            const haystack = [
                item.id,
                item.designationFinal,
                item.weightFinal,
                item.measurementFinal,
                item.fgsCodeDescription,
                item.book,
                item.page,
                item.pos
            ].map(value => normModalMatch(value)).join(' ');
            if (!haystack.includes(textFilter)) return false;
        }

        return true;
    });

    const matches = filteredMatches
        .sort((a, b) => {
            const byBook = String(a.book || '').localeCompare(String(b.book || ''), 'es', { numeric: true, sensitivity: 'base' });
            if (byBook !== 0) return byBook;
            const byPage = pageSortValue(a.page) - pageSortValue(b.page);
            if (byPage !== 0) return byPage;
            const byPos = a.pos.localeCompare(b.pos, 'es', { numeric: true, sensitivity: 'base' });
            if (byPos !== 0) return byPos;
            return a.id.localeCompare(b.id, 'es', { numeric: true, sensitivity: 'base' });
        });

    if (!matches.length) {
        body.innerHTML = '<tr><td colspan="8">Sin coincidencias para los filtros seleccionados.</td></tr>';
        if (count) count.textContent = `0 / ${matchesByPn.length}`;
        return;
    }

    body.innerHTML = matches.map(item => {
        const isCurrent = item.revisionKey === revisionKey;
        const revisionKeyAttr = escapeHtml(String(item.revisionKey || ''));
        return `<tr class="${isCurrent ? 'qa-modal-related-current' : ''}" data-revision-key="${revisionKeyAttr}" title="Doble click para ir al registro en tabla principal">`
            + `<td>${escapeHtml(item.book || '-')}</td>`
            + `<td>${escapeHtml(item.page || '-')}</td>`
            + `<td>${escapeHtml(item.pos || '-')}</td>`
            + `<td>${escapeHtml(item.id || '-')}</td>`
            + `<td>${escapeHtml(item.designationFinal || '-')}</td>`
            + `<td>${escapeHtml(item.weightFinal || '-')}</td>`
            + `<td>${escapeHtml(item.measurementFinal || '-')}</td>`
            + `<td>${escapeHtml(item.fgsCodeDescription || '-')}</td>`
            + '</tr>';
    }).join('');

    if (count) count.textContent = `${matches.length} / ${matchesByPn.length}`;
}

function openMatchesModal(revisionKey) {
    const modal = $('qaMatchesModal');
    const row = getRowByRevisionKey(revisionKey);
    if (!modal || !row) return;

    if (activeMatchesModalRevisionKey !== revisionKey) {
        const pageFilter = $('qaMatchesModalPageFilter');
        const posFilter = $('qaMatchesModalPosFilter');
        const idFilter = $('qaMatchesModalIdFilter');
        const textFilter = $('qaMatchesModalTextFilter');
        if (pageFilter instanceof HTMLInputElement) pageFilter.value = '';
        if (posFilter instanceof HTMLInputElement) posFilter.value = '';
        if (idFilter instanceof HTMLInputElement) idFilter.value = '';
        if (textFilter instanceof HTMLInputElement) textFilter.value = '';
    }

    activeMatchesModalRevisionKey = revisionKey;
    modal.removeAttribute('hidden');
    renderMatchesLargeModal(revisionKey);
}

function closeMatchesModal() {
    const modal = $('qaMatchesModal');
    if (!modal) return;

    modal.setAttribute('hidden', '');
    activeMatchesModalRevisionKey = '';
}

async function handleRecordModalSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const revisionKey = String(form.dataset.revisionKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row) {
        alert('No se encontro el registro seleccionado para guardar.');
        closeRecordModal();
        return;
    }

    const saveBtn = $('qaRecordModalSaveBtn');
    const status = $('qaRecordModalStatus');
    if (saveBtn) saveBtn.disabled = true;
    if (status) status.textContent = 'Guardando cambios...';

    const nextEstado = String($('qaModalRevisionEstado')?.value || '').trim();
    const nextAccion = String($('qaModalRevisionAccion')?.value || '').trim();
    const nextValues = getRecordFormValues('modal');

    try {
        const changedFields = MODAL_FIELD_KEYS.filter(key => String(row?.[key] ?? '') !== String(nextValues[key] ?? ''));
        if (changedFields.length > 0) {
            const engineFile = getEngineJsonForRow(row);
            if (!engineFile) throw new Error('No se pudo determinar el archivo engine_*.json del registro.');
            for (const fieldKey of changedFields) {
                await saveCellToServer(engineFile, row.ID, fieldKey, nextValues[fieldKey]);
                row[fieldKey] = nextValues[fieldKey];
            }
        }

        setRowRevision(row, nextEstado, nextAccion);
        state.selectedRevisionRowKey = revisionKey;
        const updatedVisibleRow = refreshVisibleRowByRevisionKey(revisionKey);
        if (!updatedVisibleRow) renderTable();
        renderPagination();
        syncSideRecordFormWithSelection();
        closeRecordModal();
        restoreModalUiState(revisionKey);
    } catch (error) {
        console.error('Error guardando formulario modal:', error);
        if (status) status.textContent = `No se pudo guardar: ${error.message}`;
        alert(`No se pudo guardar el registro: ${error.message}`);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function handleSideRecordSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const revisionKey = String(form.dataset.revisionKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row) {
        alert('Selecciona un registro de la tabla para editar la ficha lateral.');
        return;
    }

    const saveBtn = $('qaSideSaveBtn');
    const status = $('qaSideStatus');
    if (saveBtn) saveBtn.disabled = true;
    if (status) status.textContent = 'Guardando cambios...';

    const nextEstado = String($('qaSideRevisionEstado')?.value || '').trim();
    const nextAccion = String($('qaSideRevisionAccion')?.value || '').trim();
    const nextValues = getRecordFormValues('side');

    try {
        const changedFields = MODAL_FIELD_KEYS.filter(key => String(row?.[key] ?? '') !== String(nextValues[key] ?? ''));
        if (changedFields.length > 0) {
            const engineFile = getEngineJsonForRow(row);
            if (!engineFile) throw new Error('No se pudo determinar el archivo engine_*.json del registro.');
            for (const fieldKey of changedFields) {
                await saveCellToServer(engineFile, row.ID, fieldKey, nextValues[fieldKey]);
                row[fieldKey] = nextValues[fieldKey];
            }
        }

        setRowRevision(row, nextEstado, nextAccion);
        state.selectedRevisionRowKey = revisionKey;
        const updatedVisibleRow = refreshVisibleRowByRevisionKey(revisionKey);
        if (!updatedVisibleRow) renderTable();
        renderPagination();

        const modalForm = $('qaRecordModalForm');
        if (modalForm instanceof HTMLFormElement && String(modalForm.dataset.revisionKey || '') === revisionKey) {
            fillRecordModal(row, revisionKey);
        }

        fillSideRecordForm(row, revisionKey);
        if (status) status.textContent = 'Cambios guardados.';
    } catch (error) {
        console.error('Error guardando ficha lateral:', error);
        if (status) status.textContent = `No se pudo guardar: ${error.message}`;
        alert(`No se pudo guardar el registro: ${error.message}`);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function tryLoadFirstJson(candidates) {
    for (const candidate of candidates) {
        try {
            return await fetchJsonSafe(candidate);
        } catch (_) {
            // Continue with next candidate.
        }
    }
    return null;
}

function getBookPages(book) {
    const bookFilter = String(book || state.filters.book || '').toLowerCase();
    return [...new Set(state.allData
        .filter(row => !bookFilter || val(row, 'engine_model', '').toString().toLowerCase().includes(bookFilter))
        .map(row => {
            const n = Number(String(val(row, 'Source Page', '')).replace(/[^0-9]/g, ''));
            return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
        })
        .filter(n => n != null))].sort((a, b) => a - b);
}

function populatePageFilterOptions(bookValue, selectedPage = '') {
    const pageSelect = $('pageFilterSelect');
    if (!(pageSelect instanceof HTMLSelectElement)) return '';

    const normalizedBook = String(bookValue || '').trim();
    const pages = normalizedBook ? getBookPages(normalizedBook) : [];
    const normalizedSelectedPage = normalizePageNumber(selectedPage);
    const selectedPageNumber = Number(normalizedSelectedPage);
    const hasSelectedPage = normalizedSelectedPage !== '' && pages.includes(selectedPageNumber);
    const resolvedPage = hasSelectedPage ? normalizedSelectedPage : '';

    pageSelect.innerHTML = '<option value="">Todas las páginas</option>'
        + pages.map(page => `<option value="${page}">${page}</option>`).join('');
    pageSelect.value = resolvedPage;

    return resolvedPage;
}

function applyBookSelection(bookValue, options = {}) {
    const {
        pageValue = null,
        fallbackToFirstAvailablePage = true,
        render = true,
        updatePdf = true
    } = options;

    const normalizedBook = String(bookValue || '').trim();
    const bookFilterSelect = $('bookFilterSelect');

    if (bookFilterSelect) bookFilterSelect.value = normalizedBook;
    if (normalizedBook) state.filters.book = normalizedBook;
    else delete state.filters.book;

    const pages = getBookPages(normalizedBook);
    const requestedPage = String(pageValue ?? '').trim();
    const requestedPageNumber = Number(requestedPage.replace(/[^0-9]/g, ''));
    const hasRequestedPage = requestedPage !== '' && pages.includes(requestedPageNumber);
    const resolvedPage = hasRequestedPage
        ? String(requestedPageNumber)
        : (fallbackToFirstAvailablePage && pages.length > 0 ? String(pages[0]) : '');

    const selectedPage = populatePageFilterOptions(normalizedBook, resolvedPage);

    if (selectedPage) state.filters.page = selectedPage;
    else delete state.filters.page;

    if (render) {
        state.currentPage = 1;
        renderTable();
        renderPagination();
    }

    if (updatePdf) {
        if (normalizedBook && selectedPage) loadPdfWithPage(normalizedBook, selectedPage);
        else loadPdfClear();
    }

    updateSchemasInline(normalizedBook, selectedPage);
}

function setPageFilterValue(pageValue) {
    const selectedBook = $('bookFilterSelect')?.value || '';
    const normalizedPage = normalizePageNumber(pageValue);
    const selectedPage = populatePageFilterOptions(selectedBook, normalizedPage);
    if (!selectedPage) delete state.filters.page;
    else state.filters.page = selectedPage;

    state.currentPage = 1;
    renderTable();
    renderPagination();

    if (selectedBook && selectedPage) loadPdfWithPage(selectedBook, selectedPage);
    else loadPdfClear();

    updateSchemasInline(selectedBook, selectedPage);
}

function syncPdfWithSelectedRow(revisionKey) {
    const normalizedKey = String(revisionKey || '').trim();
    if (!normalizedKey) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    const selectedRow = state.allData.find(item => getRevisionKey(item) === normalizedKey);
    if (!selectedRow) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    setPdfSelection(selectedRow);
    const book = String(val(selectedRow, 'engine_model', '') || '').trim();
    const page = String(val(selectedRow, 'Source Page', '') || '').trim();
    if (book && page) {
        loadPdfWithPage(book, page);
        return;
    }

    loadPdfClear();
}

function normalizePageNumber(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    const parsed = Number(digits);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? String(parsed) : '';
}

function resolveBookValue(rawBook) {
    const candidate = String(rawBook || '').trim();
    if (!candidate) return '';
    const normalizedCandidate = candidate.toLowerCase();

    const books = [...new Set(state.allData
        .map(item => String(item?.engine_model ?? '').trim())
        .filter(Boolean))];

    const exact = books.find(book => book.toLowerCase() === normalizedCandidate);
    if (exact) return exact;

    const partial = books.find(book => book.toLowerCase().includes(normalizedCandidate));
    return partial || candidate;
}

function setSideSearchStatus(message, kind = '') {
    const status = $('qaSideSearchStatus');
    if (!(status instanceof HTMLElement)) return;
    status.classList.remove('ok', 'error');
    if (kind) status.classList.add(kind);
    status.textContent = String(message || '');
}

function findRowByArticleToken(rows, token) {
    const normalizedToken = String(token || '').trim().toLowerCase();
    if (!normalizedToken) return null;

    const byIdExact = rows.find(item => String(item?.ID ?? '').trim().toLowerCase() === normalizedToken);
    if (byIdExact) return byIdExact;

    const byPnExact = rows.find(item => {
        const pn = String(item?.['PART NO.'] ?? item?.pn ?? '').trim().toLowerCase();
        return pn === normalizedToken;
    });
    if (byPnExact) return byPnExact;

    const byContains = rows.find(item => {
        const id = String(item?.ID ?? '').trim().toLowerCase();
        const pn = String(item?.['PART NO.'] ?? item?.pn ?? '').trim().toLowerCase();
        const designation = String(getRowValueForColumn(item, 'designation_final', '')).trim().toLowerCase();
        return id.includes(normalizedToken) || pn.includes(normalizedToken) || designation.includes(normalizedToken);
    });
    return byContains || null;
}

function runSideQuickSearch() {
    const rawArticle = String($('qaSideSearchArticle')?.value || '').trim();

    if (!rawArticle) {
        setSideSearchStatus('Escribe un articulo o part number para buscar.', 'error');
        return;
    }

    const targetRow = findRowByArticleToken(state.allData, rawArticle);
    if (!targetRow) {
        setSideSearchStatus('No se encontro ese articulo.', 'error');
        return;
    }

    const targetBook = String(targetRow?.engine_model ?? '').trim();
    const targetPage = normalizePageNumber(targetRow?.['Source Page']);
    applyBookSelection(targetBook, {
        pageValue: targetPage,
        fallbackToFirstAvailablePage: true,
        render: true,
        updatePdf: true
    });

    const revisionKey = getRevisionKey(targetRow);
    const moved = focusRevisionRowInMainTable(revisionKey);
    if (!moved) {
        setSideSearchStatus('Se encontro el articulo, pero no se pudo enfocar en la tabla principal.', 'error');
        return;
    }

    setSideSearchStatus(`Articulo encontrado: ID ${String(targetRow?.ID ?? '-')}, libro ${targetBook || '-'}, pagina ${targetPage || '-'}.`, 'ok');
}

function goToNextBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    if (!book) return;
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterSelect')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = (currentIndex === -1 || currentIndex === pages.length - 1) ? pages[0] : pages[currentIndex + 1];
    setPageFilterValue(targetPage);
}

function goToPrevBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    if (!book) return;
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterSelect')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = currentIndex <= 0 ? pages[pages.length - 1] : pages[currentIndex - 1];
    setPageFilterValue(targetPage);
}

function getAllQaCheckCodes() {
    return (state.qaErrorCheckDefinitions || [])
        .map(def => String(def?.code || '').trim())
        .filter(Boolean);
}

function persistActiveQaChecks() {
    try {
        const payload = JSON.stringify([...state.activeQaErrorChecks]);
        localStorage.setItem(QA_CHECKS_STORAGE_KEY, payload);
    } catch (_) {
        // Ignore localStorage errors.
    }
}

function ensureQaChecksState() {
    const allCodes = getAllQaCheckCodes();
    if (!allCodes.length) {
        state.activeQaErrorChecks = new Set();
        return;
    }

    let restored = [];
    let hasStoredValue = false;
    try {
        const raw = localStorage.getItem(QA_CHECKS_STORAGE_KEY);
        hasStoredValue = raw !== null;
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) restored = parsed;
    } catch (_) {
        restored = [];
        hasStoredValue = false;
    }

    const restoredSet = new Set(restored.map(code => String(code || '').trim()).filter(Boolean));
    const active = hasStoredValue
        ? allCodes.filter(code => restoredSet.has(code))
        : allCodes;

    state.activeQaErrorChecks = new Set(active);
}

function updateQaChecksSummary() {
    const badge = $('qaChecksSummaryBadge');
    if (!(badge instanceof HTMLElement)) return;
    const total = getAllQaCheckCodes().length;
    const active = state.activeQaErrorChecks.size;
    badge.textContent = `${active}/${total}`;
}

function showQaChecksProgress() {
    const area = $('qaChecksProgressArea');
    if (!(area instanceof HTMLElement)) return;
    area.style.display = 'flex';
}

function hideQaChecksProgress() {
    const area = $('qaChecksProgressArea');
    if (!(area instanceof HTMLElement)) return;
    area.style.display = 'none';
}

function buildFoundErrorRows(rows, activeCodes, maxItems = 300) {
    const definitionMap = getQaErrorDefinitionMap();
    const output = [];

    for (const row of (rows || [])) {
        const activeErrors = buildRowActiveQaErrors(row, activeCodes);
        if (!Array.isArray(activeErrors?.codes) || activeErrors.codes.length === 0) continue;

        output.push({
            id: String(row?.ID ?? '').trim(),
            book: String(row?.engine_model ?? '').trim(),
            page: String(row?.['Source Page'] ?? '').trim(),
            pos: String(row?.POS ?? '').trim(),
            pn: String(row?.['PART NO.'] ?? row?.pn ?? '').trim(),
            errors: activeErrors.codes.map(code => definitionMap.get(code) || code)
        });

        if (output.length >= maxItems) break;
    }

    return output;
}

function renderQaChecksFoundRows(foundRows, totalFound) {
    const body = $('qaChecksFoundRows');
    const count = $('qaChecksFoundCount');

    if (count instanceof HTMLElement) {
        count.textContent = String(Number(totalFound || 0));
    }

    if (!(body instanceof HTMLElement)) return;

    if (!Array.isArray(foundRows) || foundRows.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="qa-checks-found-empty">No se han encontrado registros con error para las comprobaciones activas.</td></tr>';
        return;
    }

    body.innerHTML = foundRows.map(item => `
        <tr>
            <td>${escapeHtml(item.id || '-')}</td>
            <td>${escapeHtml(item.book || '-')}</td>
            <td>${escapeHtml(item.page || '-')}</td>
            <td>${escapeHtml(item.pos || '-')}</td>
            <td>${escapeHtml(item.pn || '-')}</td>
            <td>${escapeHtml((item.errors || []).join(' | ') || '-')}</td>
        </tr>
    `).join('');
}

function showQaChecksStats(stats, scopeLabel = '') {
    const statsArea = $('qaChecksStatsArea');
    if (!(statsArea instanceof HTMLElement)) return;

    const globalStats = stats?.stats;
    if (!globalStats) {
        statsArea.style.display = 'none';
        return;
    }

    const scopeElem = $('qaChecksStatsScope');
    if (scopeElem instanceof HTMLElement) {
        scopeElem.textContent = scopeLabel || 'Todos los articulos';
    }

    const totalElem = $('qaChecksStat_total');
    if (totalElem) totalElem.textContent = String(globalStats.totalRows || 0);

    const errorsElem = $('qaChecksStat_errors');
    if (errorsElem) errorsElem.textContent = String(globalStats.rowsWithErrors || 0);

    const okElem = $('qaChecksStat_ok');
    if (okElem) okElem.textContent = String(globalStats.rowsOk || 0);

    const criticalElem = $('qaChecksStat_critical');
    if (criticalElem) criticalElem.textContent = String(globalStats.severityCount?.critical || 0);

    const definitionMap = getQaErrorDefinitionMap();
    const codesList = $('qaChecksStatCodes');
    if (codesList instanceof HTMLElement) {
        const entries = Object.entries(globalStats.codeCount || {})
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || String(a[0]).localeCompare(String(b[0])));

        if (!entries.length) {
            codesList.innerHTML = '<li class="qa-checks-stat-codes-empty">No hay errores para las comprobaciones activas.</li>';
        } else {
            codesList.innerHTML = entries.map(([code, count]) => {
                const label = definitionMap.get(code) || code;
                return `<li class="qa-checks-stat-code-item">
                    <span class="qa-checks-stat-code-label">${escapeHtml(label)}</span>
                    <span class="qa-checks-stat-code-count">${escapeHtml(String(count))}</span>
                </li>`;
            }).join('');
        }
    }

    statsArea.style.display = 'block';
}

async function applyQaChecksFilter(scope = 'all') {
    const activeCodes = Array.from(state.activeQaErrorChecks);
    const isVisibleScope = scope === 'visible';

    showQaChecksProgress();
    hideQaChecksStats();

    try {
        if (isVisibleScope) {
            const targetRows = getRowsForBulkScope('visible');
            if (!targetRows.length) {
                hideQaChecksProgress();
                alert('No hay articulos visibles para aplicar el filtro en esta pagina.');
                return;
            }

            const revisionKeys = targetRows
                .map(row => String(getRevisionKey(row) || '').trim())
                .filter(key => /^idx=\d+$/.test(key));
            if (!revisionKeys.length) {
                hideQaChecksProgress();
                alert('No se pudo determinar la clave de revisión para guardar los visibles.');
                return;
            }

            const response = await fetch('http://localhost:3000/apply-qa-checks-filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activeCodes,
                    scope: 'visible',
                    revisionKeys
                })
            });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}`);
            }

            const result = await response.json();
            const backendVisibleScope = String(result?.scope || '').trim().toLowerCase() === 'visible';

            if (!backendVisibleScope) {
                console.warn('El backend activo no devolvió scope=visible. Es probable que el servidor no se haya reiniciado tras cambios recientes.');
                alert('El backend activo no soporta todavía "Aplicar solo visibles". Reinicia node server.js o Ejecutar localhost.bat para persistir este modo.');
            }

            if (backendVisibleScope && Array.isArray(result?.rows) && result.rows.length > 0) {
                applyQaRowsFromServer(result.rows);
            } else {
                applyActiveQaErrorsToSubset(activeCodes, targetRows);
            }
            state.qaChecksScopedRows = new Set(targetRows);
            persistActiveQaChecks();

            const visibleStats = backendVisibleScope
                ? (result?.stats || buildQaStatsFromRows(targetRows, activeCodes))
                : buildQaStatsFromRows(targetRows, activeCodes);
            showQaChecksStats({ stats: visibleStats }, 'Solo visibles en pantalla');

            const foundRows = buildFoundErrorRows(targetRows, activeCodes, 300);
            renderQaChecksFoundRows(foundRows, visibleStats.rowsWithErrors || foundRows.length);

            renderTable();
            renderPagination();
            hideQaChecksProgress();
            return;
        }

        const response = await fetch('http://localhost:3000/apply-qa-checks-filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeCodes })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }

        const result = await response.json();

        hideQaChecksProgress();
        showQaChecksStats(result, 'Todos los articulos');
        persistActiveQaChecks();
        applyActiveQaErrorsToClientRows(activeCodes);
        state.qaChecksScopedRows = null;

        const foundRows = buildFoundErrorRows(state.allData, activeCodes, 500);
        renderQaChecksFoundRows(foundRows, result?.stats?.rowsWithErrors || foundRows.length);

        // Actualizar tabla después del éxito
        state.currentPage = 1;
        renderTable();
        renderPagination();

    } catch (err) {
        console.error('Error applying QA checks filter:', err);
        hideQaChecksProgress();
        alert('Error al procesar el filtro. Revisa la consola.');
    }
}

function hideQaChecksStats() {
    const statsArea = $('qaChecksStatsArea');
    if (!(statsArea instanceof HTMLElement)) return;
    statsArea.style.display = 'none';

    const codesList = $('qaChecksStatCodes');
    if (codesList instanceof HTMLElement) {
        codesList.innerHTML = '<li class="qa-checks-stat-codes-empty">Aplica el cálculo para ver el detalle.</li>';
    }

    renderQaChecksFoundRows([], 0);
}

function openQaChecksModal() {
    const overlay = $('qaChecksModalOverlay');
    if (!(overlay instanceof HTMLElement)) return;
    renderQaChecksPanel();
    overlay.style.display = 'flex';
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

function closeQaChecksModal() {
    const overlay = $('qaChecksModalOverlay');
    if (!(overlay instanceof HTMLElement)) return;
    overlay.style.display = 'none';
    // Restore body scroll
    document.body.style.overflow = '';
}

function renderQaChecksPanel() {
    ensureQaChecksState();

    const container = $('qaChecksList');
    if (!(container instanceof HTMLElement)) return;

    const items = state.qaErrorCheckDefinitions || [];
    container.innerHTML = items.map(def => {
        const code = String(def?.code || '').trim();
        const label = String(def?.label || code);
        const checked = state.activeQaErrorChecks.has(code) ? 'checked' : '';
        return `<label class="qa-check-item" title="${escapeHtml(code)}">
            <input type="checkbox" data-qa-check-code="${escapeHtml(code)}" ${checked}>
            <span>${escapeHtml(label)}</span>
        </label>`;
    }).join('');

    updateQaChecksSummary();
}

function clearFilters() {
    document.querySelectorAll('.filter-input[data-filter]').forEach(input => { input.value = ''; });
    document.querySelectorAll('.filter-select[data-filter]').forEach(select => { select.value = ''; });
    state.filters = {};
    populatePageFilterOptions('', '');
    state.currentPage = 1;
    renderTable();
    renderPagination();
    loadPdfClear();
    updateSchemasInline('', '');
}

function handleFilter(event) {
    const input = event.target;
    const filterKey = input.dataset.filter;
    if (!filterKey) return;
    const filterValue = input.value.trim();
    if (filterValue === '') delete state.filters[filterKey];
    else state.filters[filterKey] = filterValue;

    if (filterTimeout) clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        state.currentPage = 1;
        renderTable();
        renderPagination();
    }, 120);
}

function handleSort(event) {
    const th = event.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortAsc = !state.sortAsc;
    else {
        state.sortKey = key;
        state.sortAsc = true;
    }
    state.currentPage = 1;
    renderTable();
    renderPagination();
}

function isTypingContext(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}

function updatePaginationToggleLabel() {
    const btn = $('togglePaginationBtn');
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.textContent = state.paginationEnabled ? 'Paginación: ON' : 'Paginación: OFF';
}

async function applyBulkQuickMode(quickMode) {
    const scopeSelect = $('bulkScopeSelect');
    if (!scopeSelect) return;

    const quickMap = {
        revok: { estado: 'revisado', accion: null, label: 'revisión OK' },
        revempty: { estado: '', accion: null, label: 'revisión vacía' },
        validate: { estado: null, accion: 'mantener', label: 'acción Import' },
        review: { estado: null, accion: 'revisar', label: 'acción Revisar' },
        discard: { estado: null, accion: 'eliminar', label: 'acción Eliminar' },
        clear: { estado: '', accion: '', label: 'vaciado' }
    };

    const targetValues = quickMap[quickMode];
    if (!targetValues) return;

    const scope = scopeSelect.value;
    const targetRows = getRowsForBulkScope(scope);
    if (!targetRows.length) {
        alert('No hay registros para aplicar el cambio masivo con el ámbito seleccionado.');
        return;
    }

    const scopeText = scope === 'visible' ? 'registros visibles en pantalla' : 'registros filtrados';
    const confirmed = window.confirm(`Se aplicará ${targetValues.label} masiva a ${targetRows.length} ${scopeText}. ¿Continuar?`);
    if (!confirmed) return;

    targetRows.forEach(row => {
        const nextEstado = targetValues.estado === null ? String(row.qa_revision_estado || '') : targetValues.estado;
        const nextAccion = targetValues.accion === null ? String(row.qa_revision_accion || '') : targetValues.accion;
        setRowRevisionNoSave(row, nextEstado, nextAccion);
    });

    try {
        await applyImportedRevisionToEngineJson(createRevisionExportPayload());
    } catch (error) {
        alert(`No se pudo persistir el cambio masivo en los JSON: ${error.message}`);
    }

    renderTable();
    renderPagination();
}

async function loadData() {
    try {
        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) {
            const columns = 53;
            $('tbody').innerHTML = `<tr><td colspan="${columns}" class="error">Estás abriendo el archivo directamente (file://). Intenta con servidor local.</td></tr>` +
                `<tr><td colspan="${columns}" class="error">Ejecuta un servidor local o usa Ejecutar localhost.bat para que fetch() cargue los engine_*.json.</td></tr>`;
        }

        $('stats').innerHTML = '<span class="stat">Cargando datos...</span>';
        $('pagination').style.display = 'none';

        state.allData = await loadPartitionedEngineData();
        if (!Array.isArray(state.allData)) throw new Error('Los datos no son un array');

        const newData = await tryLoadFirstJson(['MILU_New_v506.json', 'MILU_New_v507.json']);
        if (Array.isArray(newData)) {
            state.newPnSet = new Set(newData.map(item => item.pn));
            state.miluNewData = newData;
        } else {
            state.miluNewData = [];
        }

        const supersededData = await tryLoadFirstJson(['MILU_Superseded_v506.json', 'MILU_Superseded_v507.json']);
        if (Array.isArray(supersededData)) {
            state.supersededPnSet = new Set(supersededData.map(item => item.pn));
            state.miluSupersededData = supersededData;
        } else {
            state.miluSupersededData = [];
        }

        state.publishedMap = new Map();

        const productExportData = await tryLoadFirstJson(['product-export-2026-03-29-11-07.json', 'product_export_v507.json']);
        if (Array.isArray(productExportData)) state.productExportPnSet = new Set(productExportData.map(item => item.pn));

        state.currentPage = 1;
        state.sortKey = 'book_page_pos';
        state.sortAsc = true;
        state.paginationEnabled = true;
        state.tableMode = 'qa';
        state.filters = {};
        state.qaChecksScopedRows = null;

        const columnViewSelect = $('columnViewSelect');
        if (columnViewSelect instanceof HTMLSelectElement) {
            columnViewSelect.value = state.tableMode === 'errors' ? 'errors' : state.columnView;
        }

        assignRevisionKeys(state.allData);
        await loadRevisionData();
        applyRevisionDataToRows(state.allData);
        loadColumnWidths();

        const allBooks = [...new Set(state.allData
            .map(item => val(item, 'engine_model', '').toString().trim())
            .filter(b => b && b !== '—'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const bookFilterSelect = $('bookFilterSelect');
        if (bookFilterSelect) {
            bookFilterSelect.innerHTML = '<option value="">Todos los libros</option>' + allBooks.map(book => `<option value="${escapeHtml(book)}">${escapeHtml(book)}</option>`).join('');
            if (allBooks.length > 0) {
                applyBookSelection(allBooks[0], { fallbackToFirstAvailablePage: true, render: false, updatePdf: true });
            }
        }

        if (!state.allData.length) {
            $('tbody').innerHTML = '<tr><td colspan="53" class="error">No se encontró información en los archivos engine_*.json</td></tr>';
            $('stats').innerHTML = '<span class="stat">0 total</span>';
            $('pagination').style.display = 'none';
            return;
        }

        state.filteredData = [...state.allData];
        renderTable();
        renderPagination();
        updatePaginationToggleLabel();
        syncSideRecordFormWithSelection();
        queueColumnViewRefresh();

        if (syncAutoPageSize()) {
            state.currentPage = 1;
            renderTable();
            renderPagination();
            queueColumnViewRefresh();
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        $('tbody').innerHTML = `<tr><td colspan="53" class="error">Error cargando datos: ${escapeHtml(error.message)}</td></tr>`;
        $('stats').innerHTML = '<span class="stat bad">Error cargando datos</span>';
    }
}

function attachGlobalEvents() {
    document.addEventListener('qa:selected-row-changed', (event) => {
        syncPdfWithSelectedRow(event?.detail?.revisionKey || state.selectedRevisionRowKey);
        syncSideRecordFormWithSelection();
    });

    $('firstBtn')?.addEventListener('click', () => jumpToPage(1));
    $('prevBtn')?.addEventListener('click', () => changePage(-1));
    $('nextBtn')?.addEventListener('click', () => changePage(1));
    $('lastBtn')?.addEventListener('click', () => jumpToPage(Number.MAX_SAFE_INTEGER));
    document.querySelector('thead')?.addEventListener('click', handleSort);

    document.querySelectorAll('.filter-input[data-filter], .filter-select[data-filter]').forEach(elem => {
        if (elem.id === 'bookFilterSelect' || elem.id === 'pageFilterSelect') return;
        elem.addEventListener('input', handleFilter);
        elem.addEventListener('change', handleFilter);
    });

    $('nextBookPageBtn')?.addEventListener('click', goToNextBookPage);
    $('prevBookPageBtn')?.addEventListener('click', goToPrevBookPage);
    $('clearFiltersBtn')?.addEventListener('click', clearFilters);
    $('togglePaginationBtn')?.addEventListener('click', () => {
        state.paginationEnabled = !state.paginationEnabled;
        state.currentPage = 1;
        renderTable();
        renderPagination();
        updatePaginationToggleLabel();
    });

    // QA Checks Modal
    $('openQaChecksModalBtn')?.addEventListener('click', openQaChecksModal);
    $('closeQaChecksModalBtn')?.addEventListener('click', closeQaChecksModal);
    $('applyQaChecksAllBtn')?.addEventListener('click', async () => {
        await applyQaChecksFilter('all');
        // No cerrar modal aún, para que usuario vea estadísticas
    });

    $('applyQaChecksVisibleBtn')?.addEventListener('click', async () => {
        await applyQaChecksFilter('visible');
        // No cerrar modal aún, para que usuario vea estadísticas
    });

    // Close modal on overlay click
    $('qaChecksModalOverlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'qaChecksModalOverlay') closeQaChecksModal();
    });

    // QA Checks list changes - use event delegation with 'input' (bubbles)
    const qaChecksList = $('qaChecksList');
    if (qaChecksList instanceof HTMLElement) {
        qaChecksList.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
            const code = String(target.dataset.qaCheckCode || '').trim();
            if (!code) return;

            if (target.checked) state.activeQaErrorChecks.add(code);
            else state.activeQaErrorChecks.delete(code);

            // Solo actualizar badge, NO renderizar tabla
            updateQaChecksSummary();
        });
    }

    $('qaChecksAllBtn')?.addEventListener('click', () => {
        state.activeQaErrorChecks = new Set(getAllQaCheckCodes());
        renderQaChecksPanel();
    });

    $('qaChecksNoneBtn')?.addEventListener('click', () => {
        state.activeQaErrorChecks = new Set();
        renderQaChecksPanel();
    });

    $('sortBookPagePosBtn')?.addEventListener('click', () => {
        if (state.sortKey === 'book_page_pos') state.sortAsc = !state.sortAsc;
        else { state.sortKey = 'book_page_pos'; state.sortAsc = true; }
        state.currentPage = 1;
        renderTable();
        renderPagination();
    });

    $('columnViewSelect')?.addEventListener('change', (event) => {
        const selectedView = String(event.target.value || 'qa');
        if (selectedView === 'errors') {
            state.tableMode = 'errors';
        } else {
            state.tableMode = 'qa';
            state.columnView = ['qa', 'focus', 'pdf'].includes(selectedView) ? selectedView : 'qa';
            saveColumnViewPreference();
        }

        if (event.target instanceof HTMLSelectElement) {
            event.target.value = state.tableMode === 'errors' ? 'errors' : state.columnView;
        }

        state.currentPage = 1;
        renderTable();
        renderPagination();
        queueColumnViewRefresh();
    });

    $('bookFilterSelect')?.addEventListener('change', () => {
        applyBookSelection($('bookFilterSelect')?.value || '', {
            fallbackToFirstAvailablePage: false,
            render: true,
            updatePdf: true
        });
    });

    $('pageFilterSelect')?.addEventListener('change', () => {
        setPageFilterValue($('pageFilterSelect')?.value || '');
    });

    $('exportRevisionBtn')?.addEventListener('click', handleExportRevision);

    const revisionFileInput = $('revisionFileInput');
    $('importRevisionBtn')?.addEventListener('click', () => revisionFileInput?.click());
    revisionFileInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const importedPayload = await handleImportRevisionFile(file);
            const backendApply = await applyImportedRevisionToEngineJson(importedPayload);
            applyRevisionDataToRows(state.allData);
            state.currentPage = 1;
            renderTable();
            renderPagination();
            const appliedCount = Number(backendApply?.totalApplied || 0);
            alert(`Revision importada y aplicada a JSON de libros. Filas actualizadas: ${appliedCount}.`);
        } catch (error) {
            alert(`Error importando revisión: ${error.message}`);
        } finally {
            revisionFileInput.value = '';
        }
    });

    $('bulkRevOkBtn')?.addEventListener('click', () => applyBulkQuickMode('revok'));
    $('bulkRevEmptyBtn')?.addEventListener('click', () => applyBulkQuickMode('revempty'));
    $('bulkValidateBtn')?.addEventListener('click', () => applyBulkQuickMode('validate'));
    $('bulkReviewBtn')?.addEventListener('click', () => applyBulkQuickMode('review'));
    $('bulkDiscardBtn')?.addEventListener('click', () => applyBulkQuickMode('discard'));
    $('bulkClearBtn')?.addEventListener('click', () => applyBulkQuickMode('clear'));

    document.querySelectorAll('[data-pdf-tab]').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => setRightPanelTab(tabBtn.dataset.pdfTab || 'pdf'));
    });

    $('qaSideOpenModalBtn')?.addEventListener('click', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        if (!revisionKey) {
            alert('Selecciona un registro para abrir el modal.');
            return;
        }
        openRecordModal(revisionKey);
    });

    $('qaSideOpenMatchesModalBtn')?.addEventListener('click', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        if (!revisionKey) {
            alert('Selecciona un registro para abrir las apariciones en modal.');
            return;
        }
        openMatchesModal(revisionKey);
    });

    $('qaSideApplyToMatches')?.addEventListener('click', () => {
        window.qaRevisionBulk?.applySelectedToMatches();
    });

    $('qaSideMatchesBookFilter')?.addEventListener('change', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalMatches(row, revisionKey, {
            bodyId: 'qaSideMatchesBody',
            countId: 'qaSideMatchesCount',
            bookFilterId: 'qaSideMatchesBookFilter',
            showAction: false
        });
    });

    $('qaSideMatchesBody')?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = String(tr?.getAttribute('data-revision-key') || '').trim();
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();

        const moved = focusRevisionRowInMainTable(revisionKey);
        if (!moved) {
            alert('No se pudo navegar al registro en la tabla principal. Puede estar fuera de los filtros activos.');
        }
    });

    $('qaMatchesModalCloseBtn')?.addEventListener('click', closeMatchesModal);
    $('qaMatchesModal')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.matchesModalClose === 'true') closeMatchesModal();
    });

    ['qaMatchesModalBookFilter'].forEach(id => {
        $(id)?.addEventListener('change', () => renderMatchesLargeModal());
    });
    ['qaMatchesModalPageFilter', 'qaMatchesModalPosFilter', 'qaMatchesModalIdFilter', 'qaMatchesModalTextFilter'].forEach(id => {
        $(id)?.addEventListener('input', () => renderMatchesLargeModal());
    });

    $('qaMatchesModalBody')?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = String(tr?.getAttribute('data-revision-key') || '').trim();
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();

        const moved = focusRevisionRowInMainTable(revisionKey);
        if (!moved) {
            alert('No se pudo navegar al registro en la tabla principal. Puede estar fuera de los filtros activos.');
            return;
        }
        closeMatchesModal();
    });

    $('qaSideSearchBtn')?.addEventListener('click', runSideQuickSearch);
    ['qaSideSearchArticle'].forEach(id => {
        $(id)?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runSideQuickSearch();
        });
    });

    $('qaSideResetBtn')?.addEventListener('click', syncSideRecordFormWithSelection);
    $('qaSideRecordForm')?.addEventListener('submit', handleSideRecordSubmit);

    document.addEventListener('keydown', (event) => {
        if (isMatchesModalOpen()) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMatchesModal();
            }
            return;
        }

        if (isRecordModalOpen()) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeRecordModal();
            }
            return;
        }

        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.repeat || isTypingContext(event.target)) return;

        if (event.key.toLowerCase() === 'v') {
            event.preventDefault();
            const scopeSelect = $('bulkScopeSelect');
            if (scopeSelect) scopeSelect.value = 'filtered';
            applyBulkQuickMode('revok');
            return;
        }

        if (event.key === 'ArrowRight') { event.preventDefault(); goToNextBookPage(); return; }
        if (event.key === 'ArrowLeft') { event.preventDefault(); goToPrevBookPage(); return; }
        if (event.key === 'ArrowDown') { event.preventDefault(); moveSelectionBy(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveSelectionBy(-1); return; }
        if (event.key === 'Escape') cancelInlineEdit();
    });

    const tbody = $('tbody');
    tbody?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const openModalBtn = target.closest('button[data-open-record-modal="true"]');
        if (openModalBtn) {
            const revisionKey = openModalBtn.dataset.revisionKey;
            if (!revisionKey) return;
            openRecordModal(revisionKey);
            return;
        }

        const quickBtn = target.closest('button[data-quick-mode]');
        if (quickBtn) {
            const revisionKey = quickBtn.dataset.revisionKey;
            const quickMode = quickBtn.dataset.quickMode;
            if (!revisionKey) return;
            const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
            if (!row) return;
            const quickMap = {
                revok: { estado: 'revisado', accion: null },
                revempty: { estado: '', accion: null },
                validate: { estado: null, accion: 'mantener' },
                review: { estado: null, accion: 'revisar' },
                discard: { estado: null, accion: 'eliminar' }
            };
            const targetValues = quickMap[quickMode];
            if (!targetValues) return;
            const nextEstado = targetValues.estado === null ? String(row.qa_revision_estado || '') : targetValues.estado;
            const nextAccion = targetValues.accion === null ? String(row.qa_revision_accion || '') : targetValues.accion;
            setRowRevision(row, nextEstado, nextAccion);
            const tr = quickBtn.closest('tr');
            const estadoSelect = tr?.querySelector('select[data-revision-field="estado"]');
            const accionSelect = tr?.querySelector('select[data-revision-field="accion"]');
            if (estadoSelect instanceof HTMLSelectElement) { estadoSelect.value = nextEstado; updateRevisionSelectVisual(estadoSelect); }
            if (accionSelect instanceof HTMLSelectElement) { accionSelect.value = nextAccion; updateRevisionSelectVisual(accionSelect); }
            syncSideRecordFormWithSelection();
            return;
        }

        if (target.closest('select') || target.closest('a') || isInlineEditableTarget(target)) return;

        const tr = target.closest('tr[data-revision-key]');
        if (!tr) return;
        const rowKey = tr.getAttribute('data-revision-key') || '';
        const row = state.allData.find(item => getRevisionKey(item) === rowKey);
        if (!row) return;
        state.selectedRevisionRowKey = rowKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(row);
        renderSelectedRowPosTop(row);
        document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
            detail: { revisionKey: rowKey }
        }));
    });

    tbody?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('button') || target.closest('select') || target.closest('a') || target.closest('input') || target.closest('textarea')) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = tr?.getAttribute('data-revision-key') || '';
        if (!revisionKey) return;
        event.preventDefault();
        event.stopPropagation();
        openRecordModal(revisionKey);
    });

    tbody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const revisionField = target.dataset.revisionField;
        const revisionKey = target.dataset.revisionKey;
        if (!revisionField || !revisionKey) return;
        const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
        if (!row) return;
        const estado = revisionField === 'estado' ? target.value : String(row.qa_revision_estado || '');
        const accion = revisionField === 'accion' ? target.value : String(row.qa_revision_accion || '');
        setRowRevision(row, estado, accion);
        updateRevisionSelectVisual(target);
        syncSideRecordFormWithSelection();
    });

    const errorViewTbody = $('errorViewTbody');
    errorViewTbody?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select')) return;

        const tr = target.closest('tr[data-revision-key]');
        if (!tr) return;
        const rowKey = tr.getAttribute('data-revision-key') || '';
        const row = state.allData.find(item => getRevisionKey(item) === rowKey);
        if (!row) return;

        state.selectedRevisionRowKey = rowKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(row);
        renderSelectedRowPosTop(row);
        document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
            detail: { revisionKey: rowKey }
        }));
    });

    errorViewTbody?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;

        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = tr?.getAttribute('data-revision-key') || '';
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();
        openRecordModal(revisionKey);
    });

    errorViewTbody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const revisionField = target.dataset.revisionField;
        const revisionKey = target.dataset.revisionKey;
        if (!revisionField || !revisionKey) return;
        const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
        if (!row) return;
        const estado = revisionField === 'estado' ? target.value : String(row.qa_revision_estado || '');
        const accion = revisionField === 'accion' ? target.value : String(row.qa_revision_accion || '');
        setRowRevision(row, estado, accion);
        updateRevisionSelectVisual(target);
        syncSideRecordFormWithSelection();
    });

    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.rightPanelTab === 'pdf' && state.currentPdfSource && state.currentPdfPageNumber > 0) {
                renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber).catch(error => console.error('Error reajustando PDF:', error));
            }
            if (!state.allData.length || state.groupedVisible) return;
            if (!syncAutoPageSize()) return;
            const totalPages = Math.max(1, Math.ceil(state.filteredData.length / state.pageSize));
            if (state.currentPage > totalPages) state.currentPage = totalPages;
            renderTable();
            renderPagination();
        }, 120);
    });

    $('qaRecordModalCloseBtn')?.addEventListener('click', closeRecordModal);
    $('qaRecordModalCancelBtn')?.addEventListener('click', closeRecordModal);
    $('qaRecordModal')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.modalClose === 'true') closeRecordModal();
    });

    $('qaModalMatchesBookFilter')?.addEventListener('change', () => {
        const form = $('qaRecordModalForm');
        if (!(form instanceof HTMLFormElement)) return;
        const revisionKey = String(form.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalMatches(row, revisionKey);
    });

    $('qaRecordModalForm')?.addEventListener('submit', handleRecordModalSubmit);
    $('backendStatusRetryBtn')?.addEventListener('click', () => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    });
}

function init() {
    initColumnResize();
    loadColumnViewPreference();
    initPdfZoomControls();
    initBackendStatusMonitor();
    ensureQaChecksState();
    updateQaChecksSummary();
    attachGlobalEvents();
    setRightPanelTab(state.rightPanelTab);
    clearSideRecordForm();
    loadData();
}

init();
