const ALL_BOOKS_VALUE = '__ALL_BOOKS__';

const refs = {
    bookSelect: document.getElementById('bookSelect'),
    idInput: document.getElementById('idInput'),
    scopeSummary: document.getElementById('scopeSummary'),
    status: document.getElementById('recomputeSimpleStatus'),
    resultPanel: document.getElementById('recomputeSimpleResultPanel'),
    resultTitle: document.getElementById('recomputeSimpleResultTitle'),
    resultMeta: document.getElementById('recomputeSimpleResultMeta'),
    resultBody: document.getElementById('recomputeSimpleResultBody'),
    logPanel: document.getElementById('recomputeSimpleLogPanel'),
    btnImportPdf: document.getElementById('btnImportPdf'),
    btnSust: document.getElementById('btnSust'),
    btnAssets: document.getElementById('btnAssets'),
    btnHermanos: document.getElementById('btnHermanos'),
    btnEsquemaPosMissing: document.getElementById('btnEsquemaPosMissing'),
    btnFinal: document.getElementById('btnFinal'),
    btnErrors: document.getElementById('btnErrors'),
    btnStatuses: document.getElementById('btnStatuses'),
    btnClearPdfFinal: document.getElementById('btnClearPdfFinal'),
    btnClearLog: document.getElementById('btnClearLog')
};

const engineFileByModel = new Map();
const actionButtons = [
    refs.btnImportPdf,
    refs.btnSust,
    refs.btnAssets,
    refs.btnHermanos,
    refs.btnEsquemaPosMissing,
    refs.btnFinal,
    refs.btnErrors,
    refs.btnStatuses,
    refs.btnClearPdfFinal
].filter((node) => node instanceof HTMLButtonElement);

let logLines = [];

function normalizeText(value) {
    return String(value == null ? '' : value).trim();
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function currentScopeLabel() {
    const scope = getScope();
    if (scope.isAll) return scope.id ? 'TODOS (ID ignorado)' : 'TODOS';
    return scope.id ? `LIBRO ${scope.model} · ID ${scope.id}` : `LIBRO ${scope.model}`;
}

function renderResultEmpty(message) {
    if (!(refs.resultPanel instanceof HTMLElement)
        || !(refs.resultTitle instanceof HTMLElement)
        || !(refs.resultMeta instanceof HTMLElement)
        || !(refs.resultBody instanceof HTMLElement)) {
        return;
    }

    refs.resultPanel.hidden = false;
    refs.resultTitle.textContent = 'Resumen de ejecución';
    refs.resultMeta.textContent = currentScopeLabel();
    refs.resultBody.innerHTML = `<p class="recompute-result-empty">${escapeHtml(message)}</p>`;
}

function renderCards(cards) {
    const safeCards = Array.isArray(cards) ? cards : [];
    return `<div class="recompute-result-summary">${safeCards.map((card) => `
        <div class="recompute-result-kpi">
            <div class="recompute-result-kpi-label">${escapeHtml(card?.label || '')}</div>
            <div class="recompute-result-kpi-value">${escapeHtml(card?.value || '')}</div>
        </div>
    `).join('')}</div>`;
}

function renderTable(headers, rows) {
    if (!Array.isArray(headers) || !headers.length || !Array.isArray(rows) || !rows.length) {
        return '';
    }

    const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const rowHtml = rows.map((row) => {
        const cols = Array.isArray(row) ? row : [];
        return `<tr>${cols.map((col) => `<td>${escapeHtml(col)}</td>`).join('')}</tr>`;
    }).join('');

    return `<div class="recompute-result-table-wrap">
        <table class="recompute-result-table">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowHtml}</tbody>
        </table>
    </div>`;
}

function renderImportNotFoundInteractive(rowsInput) {
    if (!(refs.resultBody instanceof HTMLElement)) return;

    const rows = Array.isArray(rowsInput) ? rowsInput : [];
    if (!rows.length) {
        refs.resultBody.insertAdjacentHTML('beforeend', '<p class="recompute-result-empty">No hay filas no encontradas para mostrar.</p>');
        return;
    }

    const pageSize = 50;
    const reasons = [...new Set(rows.map((item) => normalizeText(item?.reason)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

    const controlsHtml = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#35516c;">
                <span>Motivo</span>
                <select data-rs-notfound-filter style="height:30px;border:1px solid #c6d7e8;border-radius:8px;padding:0 8px;background:#fff;color:#1a3851;font-size:12px;">
                    <option value="__ALL__">Todos</option>
                    ${reasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('')}
                </select>
            </label>
            <div data-rs-notfound-meta style="font-size:11px;color:#5a738b;font-family:'IBM Plex Mono',Consolas,monospace;"></div>
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
                <button type="button" data-rs-notfound-prev style="height:30px;border:1px solid #c6d7e8;border-radius:8px;padding:0 10px;background:#fff;color:#244864;font-size:11px;font-weight:700;cursor:pointer;">Anterior</button>
                <span data-rs-notfound-page style="font-size:11px;color:#5a738b;font-family:'IBM Plex Mono',Consolas,monospace;"></span>
                <button type="button" data-rs-notfound-next style="height:30px;border:1px solid #c6d7e8;border-radius:8px;padding:0 10px;background:#fff;color:#244864;font-size:11px;font-weight:700;cursor:pointer;">Siguiente</button>
            </div>
        </div>
        <div class="recompute-result-table-wrap" style="max-height:420px;">
            <table class="recompute-result-table">
                <thead>
                    <tr>
                        <th>Libro</th>
                        <th>Página</th>
                        <th>Row</th>
                        <th>POS PDF</th>
                        <th>PN PDF</th>
                        <th>Designation PDF</th>
                        <th>Motivo</th>
                    </tr>
                </thead>
                <tbody data-rs-notfound-body></tbody>
            </table>
        </div>
    `;

    refs.resultBody.insertAdjacentHTML('beforeend', controlsHtml);

    const filterEl = refs.resultBody.querySelector('[data-rs-notfound-filter]');
    const metaEl = refs.resultBody.querySelector('[data-rs-notfound-meta]');
    const pageEl = refs.resultBody.querySelector('[data-rs-notfound-page]');
    const prevEl = refs.resultBody.querySelector('[data-rs-notfound-prev]');
    const nextEl = refs.resultBody.querySelector('[data-rs-notfound-next]');
    const bodyEl = refs.resultBody.querySelector('[data-rs-notfound-body]');

    if (!(filterEl instanceof HTMLSelectElement)
        || !(metaEl instanceof HTMLElement)
        || !(pageEl instanceof HTMLElement)
        || !(prevEl instanceof HTMLButtonElement)
        || !(nextEl instanceof HTMLButtonElement)
        || !(bodyEl instanceof HTMLElement)) {
        return;
    }

    let currentPage = 1;

    const applyView = () => {
        const selectedReason = normalizeText(filterEl.value);
        const filtered = selectedReason && selectedReason !== '__ALL__'
            ? rows.filter((row) => normalizeText(row?.reason) === selectedReason)
            : rows;

        const totalRows = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const from = (currentPage - 1) * pageSize;
        const to = Math.min(totalRows, from + pageSize);
        const pageRows = filtered.slice(from, to);

        bodyEl.innerHTML = pageRows.map((row) => `
            <tr>
                <td>${escapeHtml(row.book)}</td>
                <td>${escapeHtml(row.page)}</td>
                <td>${escapeHtml(row.row_index)}</td>
                <td>${escapeHtml(row.pos_pdf)}</td>
                <td>${escapeHtml(row.pn_pdf)}</td>
                <td>${escapeHtml(row.designation_pdf)}</td>
                <td>${escapeHtml(row.reason)}</td>
            </tr>
        `).join('');

        pageEl.textContent = `Página ${currentPage}/${totalPages}`;
        metaEl.textContent = `Mostrando ${totalRows ? from + 1 : 0}-${to} de ${totalRows}`;
        prevEl.disabled = currentPage <= 1;
        nextEl.disabled = currentPage >= totalPages;
    };

    filterEl.addEventListener('change', () => {
        currentPage = 1;
        applyView();
    });

    prevEl.addEventListener('click', () => {
        currentPage -= 1;
        applyView();
    });

    nextEl.addEventListener('click', () => {
        currentPage += 1;
        applyView();
    });

    applyView();
}

function renderImportConflictTable(conflictsInput) {
    if (!(refs.resultBody instanceof HTMLElement)) return;
    const conflicts = Array.isArray(conflictsInput) ? conflictsInput : [];
    if (!conflicts.length) return;

    const tableHeaders = [
        'Opción',
        'ID',
        'Source Page',
        'POS',
        'PART NO.',
        'pn_pdf',
        'pn_final',
        'pn_excel',
        'DESIGNATION',
        'designation_pdf',
        'designation_final',
        'MODEL/TYPE',
        'QTY',
        'UNITS',
        'WEIGHT',
        'FN',
        'MEASUREMENT / STANDARD',
        'FG/FGS',
        'BOM-No.',
        'total_error',
        'has_error',
        'qa_revision_estado',
        'qa_revision_accion'
    ];

    const sectionsHtml = conflicts.map((conflict, conflictIndex) => {
        const candidates = Array.isArray(conflict?.candidates) ? conflict.candidates : [];
        const conflictKey = normalizeText(conflict?.conflict_key) || buildConflictKey(conflict);
        const diff = Array.isArray(conflict?.differing_fields) ? conflict.differing_fields.join(', ') : '(sin detalle)';

        const rows = candidates.map((candidate, index) => {
            const optionNumber = String(index + 1);
            return [
                optionNumber,
                pickCandidateValue(candidate, ['ID', 'id']),
                pickCandidateValue(candidate, ['source_page', 'sourcePage', 'SOURCE PAGE', 'page', 'PAGE']),
                pickCandidateValue(candidate, ['POS', 'pos', 'pos_final', 'pos_pdf']),
                pickCandidateValue(candidate, ['PART NO.', 'part_no', 'pn', 'pn_final', 'pn_pdf']),
                pickCandidateValue(candidate, ['pn_pdf']),
                pickCandidateValue(candidate, ['pn_final']),
                pickCandidateValue(candidate, ['pn_excel']),
                pickCandidateValue(candidate, ['DESIGNATION', 'designation', 'designation_final', 'designation_pdf']),
                pickCandidateValue(candidate, ['designation_pdf']),
                pickCandidateValue(candidate, ['designation_final']),
                pickCandidateValue(candidate, ['MODEL/TYPE', 'model_type', 'model_type_final', 'model_type_pdf']),
                pickCandidateValue(candidate, ['QTY', 'qty', 'qty_final', 'qty_pdf']),
                pickCandidateValue(candidate, ['UNITS', 'units', 'units_final', 'units_pdf']),
                pickCandidateValue(candidate, ['WEIGHT', 'weight', 'weight_final', 'weight_pdf']),
                pickCandidateValue(candidate, ['FN', 'fn', 'fn_final', 'fn_pdf']),
                pickCandidateValue(candidate, ['MEASUREMENT / STANDARD', 'measurement', 'measurement_final', 'measure_final', 'measure_pdf']),
                pickCandidateValue(candidate, ['FG/FGS', 'fg_fgs', 'fg_fgs_final', 'fg_fgs_pdf']),
                pickCandidateValue(candidate, ['BOM-No.', 'bom_no', 'bom_final', 'bom_pdf']),
                pickCandidateValue(candidate, ['total_error']),
                pickCandidateValue(candidate, ['has_error']),
                pickCandidateValue(candidate, ['qa_revision_estado']),
                pickCandidateValue(candidate, ['qa_revision_accion'])
            ];
        });

        return `
            <section style="margin:12px 0 16px;padding:10px;border:1px solid #d3deea;border-radius:10px;background:#f8fbff;">
                <p style="margin:0 0 8px;font-size:12px;color:#21445f;font-family:'IBM Plex Mono',Consolas,monospace;">
                    Conflicto ${conflictIndex + 1} | conflict_key: ${escapeHtml(conflictKey)} | Página ${escapeHtml(conflict?.page ?? '-')} | POS ${escapeHtml(conflict?.pos ?? '-')} | PN ${escapeHtml(conflict?.pn_pdf ?? '-')}<br>
                    Motivo: ${escapeHtml(conflict?.reason ?? '-')} | Campos que difieren: ${escapeHtml(diff)} | Numeración estable por conflicto (1..N).
                </p>
                ${renderTable(tableHeaders, rows)}
            </section>
        `;
    }).join('');

    refs.resultBody.insertAdjacentHTML('beforeend', `
        <h4 style="margin:12px 0 8px;font-size:13px;color:#12344f;">Conflictos con acción manual (selección por opción)</h4>
        ${sectionsHtml}
    `);
}

function pickCandidateValue(candidate, keys) {
    const source = candidate && typeof candidate === 'object' ? candidate : {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
        if (!key) continue;
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const value = source[key];
            if (value == null) continue;
            const normalized = normalizeText(value);
            if (!normalized) continue;
            if (typeof value === 'boolean') return value ? 'true' : 'false';
            return normalized;
        }
    }
    return '-';
}

function buildConflictCandidateOptions(conflict) {
    const candidates = Array.isArray(conflict?.candidates) ? conflict.candidates : [];
    return candidates
        .map((candidate, index) => {
            const id = pickCandidateValue(candidate, ['ID', 'id']);
            const hasValidId = id && id !== '-';
            if (!hasValidId) return null;
            return {
                optionNumber: index + 1,
                id,
                candidate,
                summary: [
                    `ID ${id}`,
                    `PAGE ${pickCandidateValue(candidate, ['source_page', 'sourcePage', 'SOURCE PAGE', 'page', 'PAGE'])}`,
                    `POS ${pickCandidateValue(candidate, ['POS', 'pos', 'pos_final', 'pos_pdf'])}`,
                    `PN ${pickCandidateValue(candidate, ['PART NO.', 'part_no', 'pn', 'pn_final', 'pn_pdf'])}`,
                    `DESIGNATION ${pickCandidateValue(candidate, ['DESIGNATION', 'designation', 'designation_final', 'designation_pdf'])}`,
                    `MODEL/TYPE ${pickCandidateValue(candidate, ['MODEL/TYPE', 'model_type', 'model_type_final', 'model_type_pdf'])}`,
                    `QTY ${pickCandidateValue(candidate, ['QTY', 'qty', 'qty_final', 'qty_pdf'])}`,
                    `UNITS ${pickCandidateValue(candidate, ['UNITS', 'units', 'units_final', 'units_pdf'])}`,
                    `WEIGHT ${pickCandidateValue(candidate, ['WEIGHT', 'weight', 'weight_final', 'weight_pdf'])}`,
                    `FN ${pickCandidateValue(candidate, ['FN', 'fn', 'fn_final', 'fn_pdf'])}`,
                    `MEAS ${pickCandidateValue(candidate, ['MEASUREMENT / STANDARD', 'measurement', 'measurement_final', 'measure_final', 'measure_pdf'])}`,
                    `FG/FGS ${pickCandidateValue(candidate, ['FG/FGS', 'fg_fgs', 'fg_fgs_final', 'fg_fgs_pdf'])}`,
                    `BOM ${pickCandidateValue(candidate, ['BOM-No.', 'bom_no', 'bom_final', 'bom_pdf'])}`,
                    `total_error ${pickCandidateValue(candidate, ['total_error'])}`,
                    `has_error ${pickCandidateValue(candidate, ['has_error'])}`,
                    `estado ${pickCandidateValue(candidate, ['qa_revision_estado'])}`,
                    `accion ${pickCandidateValue(candidate, ['qa_revision_accion'])}`
                ].join(' | ')
            };
        })
        .filter(Boolean);
}

function buildConflictKey(conflict) {
    return `${Number(conflict?.page || 0)}|${normalizeText(conflict?.pos)}|${normalizeText(conflict?.pn_pdf)}`;
}

async function requestImportConflictDecisions(conflictsInput) {
    const conflicts = Array.isArray(conflictsInput) ? conflictsInput : [];
    const decisions = {};

    for (const conflict of conflicts) {
        const options = buildConflictCandidateOptions(conflict);
        if (!options.length) continue;

        const key = normalizeText(conflict?.conflict_key) || buildConflictKey(conflict);
        const candidateLines = options
            .map((option) => `${option.optionNumber} - ${option.summary}`)
            .join('\n');

        const differing = Array.isArray(conflict?.differing_fields) ? conflict.differing_fields.join(', ') : '(sin detalle)';
        while (true) {
            const promptText = [
                `Conflicto en página ${conflict?.page ?? '-'} POS ${conflict?.pos ?? '-'} PN ${conflict?.pn_pdf ?? '-'}`,
                `conflict_key: ${key}`,
                `Campos distintos: ${differing}`,
                '',
                'Opciones disponibles (numeración estable dentro del conflicto):',
                candidateLines,
                '',
                'Escribe una acción:',
                '  skip      -> omitir este conflicto',
                '  <número>  -> aplicar la opción (1, 2, 3...)',
                '  cancel    -> cancelar el proceso'
            ].join('\n');

            const answerRaw = window.prompt(promptText, 'skip');
            const answer = normalizeText(answerRaw).toLowerCase();

            if (!answer || answer === 'skip') {
                decisions[key] = { action: 'skip' };
                appendLog('[IMPORTAR PDF][CONFLICT DECISION]', {
                    conflict_key: key,
                    optionNumber: null,
                    resolvedId: null,
                    action: 'skip'
                });
                break;
            }
            if (answer === 'cancel') return { cancelled: true, decisions: {} };

            if (/^\d+$/.test(answer)) {
                const optionNumber = Number(answer);
                const selected = options.find((entry) => entry.optionNumber === optionNumber);
                if (!selected) {
                    window.alert(`Número de opción inválido: ${answer}. Debe estar entre 1 y ${options.length} para este conflicto.`);
                    continue;
                }

                decisions[key] = { action: 'apply-id', target_id: selected.id };
                appendLog('[IMPORTAR PDF][CONFLICT DECISION]', {
                    conflict_key: key,
                    optionNumber,
                    resolvedId: selected.id,
                    action: 'apply-id'
                });
                break;
            }

            window.alert('Acción no válida. Escribe skip, cancel o un número de opción válido.');
        }
    }

    return { cancelled: false, decisions };
}

function renderResultPanel(title, endpoint, cards, headers = [], rows = [], note = '') {
    if (!(refs.resultPanel instanceof HTMLElement)
        || !(refs.resultTitle instanceof HTMLElement)
        || !(refs.resultMeta instanceof HTMLElement)
        || !(refs.resultBody instanceof HTMLElement)) {
        return;
    }

    refs.resultPanel.hidden = false;
    refs.resultTitle.textContent = title;
    refs.resultMeta.textContent = `${endpoint} | ${currentScopeLabel()}`;
    refs.resultBody.innerHTML = `${renderCards(cards)}${renderTable(headers, rows)}${note ? `<p class="recompute-result-empty">${escapeHtml(note)}</p>` : ''}`;
}

function renderResponseSummary(actionLabel, endpoint, responseData) {
    const data = responseData || {};
    const result = data?.result || {};

    if (endpoint === '/copy-pdf-to-final-all-books') {
        const totals = result?.totals || {};
        const perFile = Array.isArray(result?.perFile) ? result.perFile : [];
        const cards = [
            { label: 'Libros procesados', value: String(Number(totals.filesProcessed) || 0) },
            { label: 'Libros escritos', value: String(Number(totals.filesWritten) || 0) },
            { label: 'Registros escaneados', value: String(Number(totals.scannedRows) || 0) },
            { label: 'Registros cambiados', value: String(Number(totals.changedRows) || 0) },
            { label: 'Campos actualizados', value: String(Number(totals.updatedFields) || 0) }
        ];
        const rows = perFile.map((item) => [
            String(item?.file || ''),
            String(Number(item?.scannedRows) || 0),
            String(Number(item?.changedRows) || 0),
            String(Number(item?.updatedFields) || 0),
            item?.wroteFile ? 'si' : 'no'
        ]);
        renderResultPanel(actionLabel, endpoint, cards, ['Libro', 'Escaneados', 'Cambiados', 'Campos', 'Escrito'], rows);
        return;
    }

    if (endpoint === '/clear-engine-fields') {
        const summary = result?.summary || {};
        const perFile = Array.isArray(result?.perFile) ? result.perFile : [];
        const cards = [
            { label: 'Registros tocados', value: String(Number(summary.totalRecords) || 0) },
            { label: 'Campos vaciados', value: String(Number(summary.totalFields) || 0) },
            { label: 'Sufijos', value: String((result?.suffixes || []).join(', ')) }
        ];
        const rows = perFile.map((item) => [
            String(item?.file || ''),
            String(Number(item?.records) || 0),
            String(Number(item?.fields) || 0)
        ]);
        renderResultPanel(actionLabel, endpoint, cards, ['Libro', 'Registros', 'Campos'], rows);
        return;
    }

    if (endpoint === '/recompute-qa-errors') {
        const ruleSummary = Array.isArray(result?.ruleSummary) ? result.ruleSummary : [];
        const cards = [
            { label: 'Modo', value: String(result?.mode || '-') },
            { label: 'Escaneados', value: String(Number(result?.scanned) || 0) },
            { label: 'Cambiados', value: String(Number(result?.changedRows) || 0) },
            { label: 'OK', value: String(Number(result?.okRows) || 0) },
            { label: 'KO', value: String(Number(result?.koRows) || 0) },
            { label: 'Errores', value: String(Number(result?.errorsFound) || 0) }
        ];
        const rows = ruleSummary.map((rule) => [
            String(rule?.label || rule?.code || ''),
            String(Number(rule?.count) || 0),
            String(rule?.severity || '')
        ]);
        renderResultPanel(actionLabel, endpoint, cards, ['Regla', 'Conteo', 'Severidad'], rows, rows.length ? '' : 'No hubo desglose de reglas para este alcance.');
        return;
    }

    if (endpoint === '/api/recompute-simple/update-states') {
        const cards = [
            { label: 'Motores procesados', value: String(Number(data?.enginesProcessed) || 0) },
            { label: 'Registros procesados', value: String(Number(data?.recordsProcessed) || 0) },
            { label: 'Actualizados', value: String(Number(data?.updated) || 0) },
            { label: 'Importar', value: String(Number(data?.importar) || 0) },
            { label: 'Eliminar', value: String(Number(data?.eliminar) || 0) },
            { label: 'Revisar', value: String(Number(data?.revisar) || 0) },
            { label: 'Sin cambios', value: String(Number(data?.unchanged) || 0) }
        ];

        const errors = Array.isArray(data?.errors) ? data.errors : [];
        const rows = errors.map((entry) => [
            String(entry?.engine || '-'),
            String(entry?.message || '')
        ]);

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Error'],
            rows,
            errors.length ? 'Se detectaron errores parciales. Revisa el detalle técnico.' : ''
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/update-sust') {
        const cards = [
            { label: 'Modo', value: String(result?.mode || '-') },
            { label: 'Motores procesados', value: String(Number(result?.enginesProcesados) || 0) },
            { label: 'Registros escaneados', value: String(Number(result?.registrosEscaneados) || 0) },
            { label: 'matched_new', value: String(Number(result?.matchedNew) || 0) },
            { label: 'matched_superseded', value: String(Number(result?.matchedSuperseded) || 0) },
            { label: 'not_found', value: String(Number(result?.notFound) || 0) },
            { label: 'changed_rows', value: String(Number(result?.changedRows) || 0) },
            { label: 'Backups', value: String(Number(result?.backupsCreated) || 0) }
        ];

        const perEngine = Array.isArray(result?.engineDetails) ? result.engineDetails : [];
        const rows = perEngine.map((item) => [
            String(item?.engine || ''),
            String(Number(item?.scanned) || 0),
            String(Number(item?.matched_new) || 0),
            String(Number(item?.matched_superseded) || 0),
            String(Number(item?.not_found) || 0),
            String(Number(item?.changed_rows) || 0),
            item?.wrote_file ? 'si' : 'no',
            String(item?.backup || '-')
        ]);

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Escaneados', 'New', 'Superseded', 'No match', 'Cambiados', 'Escrito', 'Backup'],
            rows,
            data?.ignoredId ? 'ID puntual ignorado para ACTUALIZAR SUST en este alcance.' : ''
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/update-gesa') {
        const cards = [
            { label: 'Modo', value: String(result?.mode || '-') },
            { label: 'Motores procesados', value: String(Number(result?.enginesProcesados) || 0) },
            { label: 'Registros escaneados', value: String(Number(result?.registrosEscaneados) || 0) },
            { label: 'Matches GESA', value: String(Number(result?.matchesGesa) || 0) },
            { label: 'No encontrados', value: String(Number(result?.noEncontrados) || 0) },
            { label: 'Registros modificados', value: String(Number(result?.registrosModificados) || 0) },
            { label: 'Backups', value: String(Number(result?.backupsCreados) || 0) }
        ];

        const perEngine = Array.isArray(result?.engineDetails) ? result.engineDetails : [];
        const rows = perEngine.map((item) => [
            String(item?.engine || ''),
            String(Number(item?.scanned) || 0),
            String(Number(item?.matches) || 0),
            String(Number(item?.noMatches) || 0),
            String(Number(item?.modified) || 0),
            item?.wroteFile ? 'si' : 'no',
            String(item?.backup || '-')
        ]);

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Escaneados', 'Matches', 'No match', 'Modificados', 'Escrito', 'Backup'],
            rows,
            data?.ignoredId ? 'ID puntual ignorado para ACTUALIZAR GESA en este alcance.' : ''
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/rebuild-json') {
        const notes = data?.notes || {};
        const cards = [
            { label: 'Modo', value: String(result?.mode || '-') },
            { label: 'Motores procesados', value: String(Number(result?.modelsProcessed) || 0) },
            { label: 'Motores con error', value: String(Number(result?.modelsFailed) || 0) },
            { label: 'Filas usadas', value: String(Number(result?.totals?.usedRows) || 0) },
            { label: 'Filas generadas', value: String(Number(result?.totals?.rowsGenerated) || 0) },
            { label: 'Ambiguos', value: String(Number(result?.totals?.ambiguous) || 0) },
            { label: 'No encontrados', value: String(Number(result?.totals?.notFound) || 0) },
            { label: 'Salida', value: String(result?.outputDir || notes?.writesOnlyTo || 'data/02-engine_rebuild') }
        ];

        const perModel = Array.isArray(result?.results) ? result.results : [];
        const rows = perModel.map((item) => [
            String(item?.model || ''),
            String(Number(item?.usedRows) || 0),
            String(Number(item?.rowsGenerated) || 0),
            String(Number(item?.ambiguous) || 0),
            String(Number(item?.notFound) || 0),
            String(item?.outputRebuild || '-'),
            String(item?.outputEngineCopy || '-'),
            String(item?.outputReport || '-')
        ]);

        const failures = Array.isArray(result?.failures) ? result.failures : [];
        const warningLines = [];
        if (notes?.backupIgnored) {
            warningLines.push('backup se ignora en CREACIÓN JSON REBUILD (no se escriben engine_*.json).');
        }
        if (failures.length) {
            warningLines.push(`Modelos con error: ${failures.map((item) => `${item?.model}: ${item?.error}`).join(' | ')}`);
        }

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Usadas', 'Generadas', 'Ambiguos', 'No match', 'JSON rebuild', 'Copia engine', 'Reporte'],
            rows,
            warningLines.join(' ')
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/enrich-assets') {
        const assets = data?.result || {};
        const cards = [
            { label: 'Motores procesados', value: String(Number(assets?.enginesProcessed) || 0) },
            { label: 'Registros procesados', value: String(Number(assets?.recordsProcessed) || 0) },
            { label: 'Fotos vinculadas', value: String(Number(assets?.photosLinked) || 0) },
            { label: 'Esquemas vinculados', value: String(Number(assets?.schemasLinked) || 0) },
            { label: 'Schema POS vinculados', value: String(Number(assets?.schemaPosLinked) || 0) },
            { label: 'Filas actualizadas', value: String(Number(assets?.updatedRows) || 0) },
            { label: 'Filas con faltantes', value: String(Number(assets?.missingAssets) || 0) },
            { label: 'Backup creado', value: assets?.backupCreated ? 'si' : 'no' },
            { label: 'Dry run', value: assets?.dryRun ? 'si' : 'no' }
        ];

        const details = Array.isArray(assets?.details) ? assets.details : [];
        const rows = details.map((item) => [
            String(item?.model || ''),
            String(Number(item?.rowsTotal) || 0),
            String(Number(item?.photosLinked) || 0),
            String(Number(item?.schemasLinked) || 0),
            String(Number(item?.schemaPosLinked) || 0),
            String(Number(item?.updatedRows) || 0),
            String(Number(item?.missingAssets) || 0),
            String(item?.backupPath || '-')
        ]);

        const errors = Array.isArray(assets?.errors) ? assets.errors : [];
        const warning = [
            data?.ignoredId ? 'ID puntual ignorado para ASSETS en este alcance.' : '',
            errors.length ? `Errores parciales: ${errors.map((item) => `${item?.model}: ${item?.error}`).join(' | ')}` : ''
        ].filter(Boolean).join(' ');

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Registros', 'Fotos', 'Esquemas', 'Schema POS', 'Actualizadas', 'Faltantes', 'Backup'],
            rows,
            warning
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/recompute-hermanos') {
        const siblings = data?.result || {};
        const cards = [
            { label: 'Libros procesados', value: String(Number(siblings?.books_processed) || 0) },
            { label: 'Registros escaneados', value: String(Number(siblings?.records_scanned) || 0) },
            { label: 'Grupos PN detectados', value: String(Number(siblings?.pn_groups_detected) || 0) },
            { label: 'PN con cambios', value: String(Number(siblings?.pns_with_changes) || 0) },
            { label: 'Registros actualizados', value: String(Number(siblings?.rows_updated) || 0) },
            { label: 'Backups', value: String(Number((siblings?.backup_paths || []).length) || 0) },
            { label: 'Dry run', value: siblings?.dry_run ? 'si' : 'no' }
        ];

        const perEngine = Array.isArray(siblings?.per_engine) ? siblings.per_engine : [];
        const rows = perEngine.map((item) => [
            String(item?.engine || ''),
            String(Number(item?.records_scanned) || 0),
            String(Number(item?.pn_groups_detected) || 0),
            String(Number(item?.pns_with_changes) || 0),
            String(Number(item?.rows_updated) || 0)
        ]);

        const errors = Array.isArray(siblings?.errors) ? siblings.errors : [];
        const warning = errors.length
            ? `Errores parciales: ${errors.map((item) => `${item?.file || 'bulk'}: ${item?.error || 'Error desconocido'}`).join(' | ')}`
            : '';

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Libro', 'Escaneados', 'Grupos PN', 'PN con cambios', 'Actualizados'],
            rows,
            warning
        );
        return;
    }

    if (endpoint === '/api/recompute-simple/generate-missing-esquema-pos') {
        const output = data?.result || {};
        const perEngine = Array.isArray(output?.results) ? output.results : [];
        const cards = [
            { label: 'Motores', value: String(Number(perEngine.length) || 0) },
            { label: 'Registros sin esquema', value: String(perEngine.reduce((acc, item) => acc + Number(item?.rows_missing_before || 0), 0)) },
            { label: 'Procesados', value: String(perEngine.reduce((acc, item) => acc + Number(item?.processed || 0), 0)) },
            { label: 'Generados', value: String(perEngine.reduce((acc, item) => acc + Number(item?.generated || 0), 0)) },
            { label: 'Ya existentes', value: String(perEngine.reduce((acc, item) => acc + Number(item?.already_exists || 0), 0)) },
            { label: 'Vinculados', value: String(perEngine.reduce((acc, item) => acc + Number(item?.linked || 0), 0)) },
            { label: 'Errores', value: String(perEngine.reduce((acc, item) => acc + Number(item?.errors || 0), 0)) }
        ];

        const rows = perEngine.map((item) => [
            String(item?.engine || ''),
            String(Number(item?.rows_missing_before) || 0),
            String(Number(item?.processed) || 0),
            String(Number(item?.generated) || 0),
            String(Number(item?.already_exists) || 0),
            String(Number(item?.linked) || 0),
            String(Number(item?.errors) || 0),
            item?.json_updated ? 'si' : 'no'
        ]);

        const warning = output?.reportPath
            ? `Reporte: ${String(output.reportPath)}`
            : '';

        renderResultPanel(
            actionLabel,
            endpoint,
            cards,
            ['Engine', 'Sin esquema', 'Procesados', 'Generados', 'Existentes', 'Vinculados', 'Errores', 'JSON actualizado'],
            rows,
            warning
        );
        return;
    }

    if (endpoint === '/api/pdf-preview/apply-to-engine') {
        const stats = data?.stats || {};
        const notFoundRows = Array.isArray(data?.not_found_rows) ? data.not_found_rows : [];
        const actionRequiredConflicts = Array.isArray(data?.action_required_conflicts) ? data.action_required_conflicts : [];
        const scope = getScope();
        const defaultBook = String(data?.engine || (scope.isAll ? '(varios)' : scope.model) || '').trim();
        const cards = [
            { label: 'Script', value: String(data?.script || '-') },
            { label: 'Engine', value: String(data?.engine || '(todos)') },
            { label: 'Preview filas', value: String(Number(stats.preview_rows) || 0) },
            { label: 'Match único', value: String(Number(stats.matched_unique) || 0) },
            { label: 'Ambiguos auto (iguales)', value: String(Number(stats.matched_ambiguous_all_equal) || 0) },
            { label: 'Ambiguos manual', value: String(Number(stats.matched_ambiguous_manual) || 0) },
            { label: 'No encontrados', value: String(Number(stats.not_found) || 0) },
            { label: 'Campos modificados', value: String(Number(stats.fields_changed) || 0) }
        ];
        const normalizedRows = notFoundRows.map((item) => ({
            book: String(item?.engine || item?.book || defaultBook),
            id: String(item?.id ?? item?.ID ?? ''),
            page: String(item?.page ?? ''),
            row_index: String(item?.row_index ?? ''),
            pos_pdf: String(item?.pos_pdf ?? item?.pos ?? ''),
            pn_pdf: String(item?.pn_pdf ?? item?.pn ?? ''),
            designation_pdf: String(item?.designation_pdf ?? ''),
            reason: String(item?.reason ?? '')
        }));
        renderResultPanel(actionLabel, endpoint, cards);
        renderImportNotFoundInteractive(normalizedRows);
        renderImportConflictTable(actionRequiredConflicts);
        return;
    }

    renderResultEmpty('La respuesta no tiene un formato visual mapeado todavía. Revisa el log para detalle técnico.');
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

async function postJson(endpoint, payload, options = {}) {
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

    const allowPartial = Boolean(options.allowPartial);
    const isPartialStatus = response.status === 207;

    if (!response.ok || !data) {
        throw new Error(normalizeText(data?.error) || `HTTP ${response.status}`);
    }

    if (data.ok !== true) {
        if (allowPartial && isPartialStatus) {
            appendLog(`[WARN] Respuesta parcial aceptada en ${endpoint} (HTTP 207).`, {
                errors: Array.isArray(data?.errors) ? data.errors.length : 0
            });
            return data;
        }
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

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        dryRun: false,
        backup: true
    };

    setStatus(scope.isAll ? 'Ejecutando IMPORTAR PDF para todos los libros...' : `Ejecutando IMPORTAR PDF para ${scope.model}...`, '');
    const data = await postJson('/api/recompute-simple/rebuild-json', payload, { allowPartial: true });
    renderResponseSummary('IMPORTAR PDF', '/api/recompute-simple/rebuild-json', data);

    if (data?.ok === false || Number(data?.result?.modelsFailed) > 0) {
        setStatus('IMPORTAR PDF completado con incidencias. Revisa el panel de resultados.', 'warning');
        return;
    }

    setStatus('IMPORTAR PDF finalizado correctamente.', 'ok');
}

async function runFinalCalculation() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('CÁLCULO FINAL');

    const payload = scope.isAll ? { backup: true } : { file: scope.file, backup: true };

    setStatus(scope.isAll ? 'Ejecutando CÁLCULO FINAL para todos los libros...' : `Ejecutando CÁLCULO FINAL para ${scope.model}...`, '');
    const data = await postJson('/copy-pdf-to-final-all-books', payload);
    renderResponseSummary('Cálculo FINAL', '/copy-pdf-to-final-all-books', data);
    setStatus('CÁLCULO FINAL finalizado correctamente.', 'ok');
}

async function runUpdateSust() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('ACTUALIZAR GESA + SUST');

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        id: '',
        backup: true,
        dryRun: false
    };

    setStatus(scope.isAll ? 'Actualizando GESA para todos los libros...' : `Actualizando GESA para ${scope.model}...`, '');
    const gesaData = await postJson('/api/recompute-simple/update-gesa', payload);
    renderResponseSummary('Actualizar GESA', '/api/recompute-simple/update-gesa', gesaData);

    setStatus(scope.isAll ? 'Actualizando SUST para todos los libros...' : `Actualizando SUST para ${scope.model}...`, '');
    const sustData = await postJson('/api/recompute-simple/update-sust', payload);
    renderResponseSummary('Actualizar GESA + SUST', '/api/recompute-simple/update-sust', sustData);

    setStatus('ACTUALIZAR GESA + SUST finalizado correctamente.', 'ok');
}

async function runAssets() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('ASSETS');

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        dryRun: false,
        backup: true
    };

    setStatus(scope.isAll ? 'Ejecutando ASSETS para todos los libros...' : `Ejecutando ASSETS para ${scope.model}...`, '');
    const data = await postJson('/api/recompute-simple/enrich-assets', payload, { allowPartial: true });
    renderResponseSummary('ASSETS', '/api/recompute-simple/enrich-assets', data);

    const hadErrors = Array.isArray(data?.result?.errors) && data.result.errors.length > 0;
    if (hadErrors) {
        setStatus('ASSETS finalizado con incidencias parciales. Revisa el panel de resultados.', 'warning');
        return;
    }

    setStatus('ASSETS finalizado correctamente.', 'ok');
}

async function runHermanos() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('HERMANOS / COPIAS');

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        dryRun: false,
        backup: true
    };

    // Reutiliza la logica oficial de Analisis para hermanos/copias a traves del wrapper recompute_simple.
    setStatus(scope.isAll ? 'Recalculando HERMANOS / COPIAS para todos los libros...' : `Recalculando HERMANOS / COPIAS para ${scope.model}...`, '');
    const data = await postJson('/api/recompute-simple/recompute-hermanos', payload, { allowPartial: true });
    renderResponseSummary('Recalcular hermanos', '/api/recompute-simple/recompute-hermanos', data);

    const hadErrors = Array.isArray(data?.result?.errors) && data.result.errors.length > 0;
    if (hadErrors) {
        setStatus('HERMANOS / COPIAS finalizado con incidencias parciales. Revisa el panel de resultados.', 'warning');
        return;
    }

    setStatus('HERMANOS / COPIAS finalizado correctamente.', 'ok');
}

async function runEsquemaPosMissing() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('ESQUEMA POS FALTANTES');

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        writeImages: true,
        writeJson: true,
        overwrite: false,
        limit: 0
    };

    setStatus(
        scope.isAll
            ? 'Generando y vinculando esquema POS faltantes para todos los libros...'
            : `Generando y vinculando esquema POS faltantes para ${scope.model}...`,
        ''
    );

    const data = await postJson('/api/recompute-simple/generate-missing-esquema-pos', payload, { allowPartial: true });
    renderResponseSummary('Generar esquema POS faltantes', '/api/recompute-simple/generate-missing-esquema-pos', data);

    const perEngine = Array.isArray(data?.result?.results) ? data.result.results : [];
    const hasErrors = perEngine.some((item) => Number(item?.errors || 0) > 0 || String(item?.status || '').toLowerCase() === 'error');

    if (hasErrors) {
        setStatus('ESQUEMA POS FALTANTES finalizado con incidencias parciales. Revisa el panel de resultados.', 'warning');
        return;
    }

    setStatus('ESQUEMA POS FALTANTES finalizado correctamente.', 'ok');
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
    const data = await postJson('/recompute-qa-errors', payload);
    renderResponseSummary('Recalcular errores', '/recompute-qa-errors', data);
    setStatus('ERRORES recalculados correctamente.', 'ok');
}

async function runStatuses() {
    const scope = getScope();
    const backupEnabled = !scope.isAll;

    const payload = {
        engine: scope.isAll ? 'ALL' : scope.model,
        id: scope.isAll ? '' : scope.id,
        backup: backupEnabled
    };

    if (!backupEnabled) {
        appendLog('[AVISO] 5-ESTADOS en alcance TODOS se ejecuta sin backup para evitar errores ENOSPC por copias masivas.');
    }

    if (scope.isAll) {
        setStatus('Recalculando ESTADOS para todos los libros...', '');
    } else if (scope.id) {
        setStatus(`Recalculando ESTADOS para ${scope.model} (ID ${scope.id})...`, '');
    } else {
        setStatus(`Recalculando ESTADOS para ${scope.model}...`, '');
    }

    const data = await postJson('/api/recompute-simple/update-states', payload, { allowPartial: true });
    renderResponseSummary('Recalcular estados', '/api/recompute-simple/update-states', data);
    if (Array.isArray(data?.errors) && data.errors.length) {
        const diskFull = data.errors.some((entry) => /ENOSPC|no space left on device/i.test(String(entry?.message || '')));
        if (diskFull) {
            setStatus('ESTADOS con incidencias parciales: no hay espacio para crear backups.', 'warning');
            window.alert(`ESTADOS completado con ${data.errors.length} incidencia(s). Falta espacio en disco para backups.`);
        } else {
            setStatus('ESTADOS recalculados con incidencias parciales. Revisa el log.', 'warning');
            window.alert(`ESTADOS completado con ${data.errors.length} incidencia(s). Revisa el panel de resultados.`);
        }
        return;
    }

    setStatus('ESTADOS recalculados correctamente.', 'ok');
    window.alert('ESTADOS recalculados correctamente.');
}

async function runClearPdfFinal() {
    const scope = getScope();
    if (scope.id) showIdIgnoredWarning('VACIAR _PDF, _FINAL Y _ERROR');

    const confirmed = await requestTypedConfirmation(
        'Acción destructiva. Se vaciarán campos *_pdf, *_final y *_error (excepto pn_pdf y pn_final). Además, se marcará revisión pendiente (qa_revision_estado=pendiente, qa_revision_accion=revisar) y qa_revision_updated_at con timestamp actual.\n\nEscribe VACIAR para continuar.',
        'VACIAR'
    );
    if (!confirmed) {
        setStatus('Operación cancelada por confirmación incompleta.', 'warning');
        appendLog('[AVISO] Vaciado cancelado por usuario.');
        return;
    }

    const payload = scope.isAll
        ? { suffixes: ['_pdf', '_final', '_error'], exclude: ['pn_pdf', 'pn_final'], resetQaRevision: true }
        : { files: [scope.file], suffixes: ['_pdf', '_final', '_error'], exclude: ['pn_pdf', 'pn_final'], resetQaRevision: true };

    setStatus(scope.isAll ? 'Vaciando campos _pdf/_final/_error y marcando revisión en todos los libros...' : `Vaciando campos _pdf/_final/_error y marcando revisión en ${scope.model}...`, '');
    const data = await postJson('/clear-engine-fields', payload);
    renderResponseSummary('Vaciar _pdf/_final/_error y marcar revisión', '/clear-engine-fields', data);
    setStatus('VACIAR + MARCAR REVISION finalizado correctamente. Es obligatorio recargar la web.', 'ok');
    window.alert('Vaciado completado correctamente.\n\nEs obligatorio recargar la web para continuar.');
    window.location.reload();
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

    if (refs.btnSust instanceof HTMLButtonElement) {
        refs.btnSust.addEventListener('click', () => runAction(runUpdateSust));
    }

    if (refs.btnAssets instanceof HTMLButtonElement) {
        refs.btnAssets.addEventListener('click', () => runAction(runAssets));
    }

    if (refs.btnHermanos instanceof HTMLButtonElement) {
        refs.btnHermanos.addEventListener('click', () => runAction(runHermanos));
    }

    if (refs.btnEsquemaPosMissing instanceof HTMLButtonElement) {
        refs.btnEsquemaPosMissing.addEventListener('click', () => runAction(runEsquemaPosMissing));
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
    renderResultEmpty('Aún no hay ejecuciones. Lanza una acción para ver resumen y detalle por tabla.');
    appendLog('Inicializando recompute simple...');
    await loadEngines();
    renderScopeSummary();
    appendLog('Listo.');
}

init();
