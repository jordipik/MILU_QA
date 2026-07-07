(function () {
    const PN_REVIEW_FIELD_FALLBACKS = {
        pn_final: ['PART NO.', 'pn'],
        pn_excel: ['pn_excel', 'pn_raw', 'PART NO.', 'pn'],
        pn_pdf: ['pn_pdf'],
        designation_final: ['DESIGNATION', 'designation_gesa', 'designation_pdf'],
        designation_pdf: ['designation_pdf', 'DESIGNATION', 'designation_gesa'],
        pos_final: ['POS'],
        qty_final: ['QTY'],
        qty_units_final: ['UNITS', 'units'],
        measure_final: ['measurement_final', 'MEASUREMENT / STANDARD', 'dimensions_gesa', 'measure_pdf'],
        norma_final: ['norma', 'STANDARD'],
        weight_final: ['WEIGHT', 'weight_gesa', 'weight_pdf'],
        model_type_final: ['MODEL/TYPE', 'model'],
        qa_revision_estado: ['qa_revision_estado'],
        qa_revision_accion: ['qa_revision_accion'],
        is_subst_final: ['sust_status', 'is_subst_excel'],
        hierarchie_final: ['sust_hierarchie', 'hierarchie_excel'],
        new_pn_final: ['sust_new_part_number', 'new_part_number', 'pn_new'],
        subst_pnlist_final: ['sust_superseded_list'],
        source_page: ['Source Page', 'page4'],
        engine_model: ['engine_model', '__engine_model', 'engine'],
        libro_pag: ['libro_pag', 'book_set', 'pages'],
        ruta_foto: ['filename_foto'],
        ruta_esquemas_pos: ['exp_imagenes']
    };

    const state = {
        rows: [],
        filtered: [],
        selectedSku: '',
        detailCache: new Map(),
        sourcesCache: new Map(),
        sortField: 'sku',
        sortOrder: 'asc',
        sourceSortField: 'engine_model',
        sourceSortOrder: 'asc',
        loadedAt: '',
        lastRefreshedAt: ''
    };

    const ui = {
        backendBadge: document.getElementById('backendBadge'),
        loadedAtBadge: document.getElementById('loadedAtBadge'),
        refreshBtn: document.getElementById('refreshBtn'),
        summaryCards: document.getElementById('summaryCards'),
        searchInput: document.getElementById('searchInput'),
        decisionFilter: document.getElementById('decisionFilter'),
        validationFilter: document.getElementById('validationFilter'),
        engineFilter: document.getElementById('engineFilter'),
        qaFilter: document.getElementById('qaFilter'),
        quickPendingBtn: document.getElementById('quickPendingBtn'),
        quickIssuesBtn: document.getElementById('quickIssuesBtn'),
        quickReadyBtn: document.getElementById('quickReadyBtn'),
        quickResetBtn: document.getElementById('quickResetBtn'),
        tableMeta: document.getElementById('tableMeta'),
        pnTableBody: document.getElementById('pnTableBody'),
        detailEmpty: document.getElementById('detailEmpty'),
        detailContent: document.getElementById('detailContent'),
        detailSku: document.getElementById('detailSku'),
        detailSubtitle: document.getElementById('detailSubtitle'),
        detailDecision: document.getElementById('detailDecision'),
        detailOccurrences: document.getElementById('detailOccurrences'),
        detailEnginesCount: document.getElementById('detailEnginesCount'),
        detailReason: document.getElementById('detailReason'),
        exportFieldsTable: document.getElementById('exportFieldsTable'),
        qaSummaryBlock: document.getElementById('qaSummaryBlock'),
        conflictBlock: document.getElementById('conflictBlock'),
        markImportBtn: document.getElementById('markImportBtn'),
        markReviewBtn: document.getElementById('markReviewBtn'),
        markDiscardBtn: document.getElementById('markDiscardBtn'),
        openSourcesBtn: document.getElementById('openSourcesBtn'),
        sourcesModal: document.getElementById('sourcesModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalMeta: document.getElementById('modalMeta'),
        sourcesTableBody: document.getElementById('sourcesTableBody')
    };

    const tableSortHeaders = Array.from(document.querySelectorAll('th[data-sort]'));
    const sourceSortHeaders = Array.from(document.querySelectorAll('th[data-sort-source]'));

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalize(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeLower(value) {
        return normalize(value).toLowerCase();
    }

    function getPnReviewDebugEnabled() {
        try {
            return Boolean(window?.PN_REVIEW_FIELD_DEBUG);
        } catch (_) {
            return false;
        }
    }

    function getFieldAdapterApi() {
        try {
            const adapter = window?.fieldAdapter;
            if (adapter && typeof adapter.getField === 'function') return adapter;
        } catch (_) {
            // Ignore window access issues.
        }
        return null;
    }

    function logPnReviewFieldDebug(record, fieldName, source, aliasUsed) {
        if (!getPnReviewDebugEnabled()) return;
        const id = String(record?.ID ?? record?._idx ?? '').trim();
        const payload = { field: fieldName, source, alias: aliasUsed || '' };
        if (id) payload.id = id;
        console.debug('[PN Review fieldAdapter]', payload);
    }

    function isEmptyPnReviewValue(value) {
        return normalize(value) === '' || normalize(value) === '-' || normalize(value) === 'null' || normalize(value) === 'undefined';
    }

    function getPnReviewFieldValue(record, fieldName, defaultValue = '') {
        const row = record && typeof record === 'object' ? record : {};
        const field = normalize(fieldName);
        if (!field) return defaultValue;

        const adapter = getFieldAdapterApi();
        if (adapter) {
            const adapterValue = adapter.getField(row, field);
            if (!isEmptyPnReviewValue(adapterValue)) {
                let aliasUsed = field;
                if (typeof adapter.getFieldAliases === 'function') {
                    const aliases = adapter.getFieldAliases(field);
                    if (Array.isArray(aliases)) {
                        const matched = aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias) && !isEmptyPnReviewValue(row[alias]));
                        if (matched) aliasUsed = matched;
                    }
                }
                logPnReviewFieldDebug(row, field, 'adapter', aliasUsed);
                return adapterValue;
            }
        }

        const direct = row[field];
        if (!isEmptyPnReviewValue(direct)) {
            logPnReviewFieldDebug(row, field, 'direct', field);
            return direct;
        }

        const fallbackKeys = PN_REVIEW_FIELD_FALLBACKS[field] || [];
        for (const key of fallbackKeys) {
            const candidate = row[key];
            if (!isEmptyPnReviewValue(candidate)) {
                logPnReviewFieldDebug(row, field, 'fallback', key);
                return candidate;
            }
        }

        logPnReviewFieldDebug(row, field, 'missing', '');
        return defaultValue;
    }

    function formatDateTime(value) {
        const text = normalize(value);
        if (!text) return '-';
        const dt = new Date(text);
        if (Number.isNaN(dt.getTime())) return text;
        return dt.toLocaleString('es-ES');
    }

    function decisionLabel(decision) {
        const value = normalizeLower(decision);
        if (value === 'import') return 'Import';
        if (value === 'discard') return 'Discard';
        return 'Pending';
    }

    function decisionClass(decision) {
        const value = normalizeLower(decision);
        if (value === 'import') return 'decision-import';
        if (value === 'discard') return 'decision-discard';
        return 'decision-pending';
    }

    function getDecisionActionMeta(action) {
        if (action === 'validar') {
            return {
                estado: 'ok',
                accion: 'importar',
                confirmText: 'OK / IMPORTAR',
                label: 'Validar PN'
            };
        }
        if (action === 'revisar') {
            return {
                estado: 'pendiente',
                accion: 'revisar',
                confirmText: 'PENDIENTE / REVISAR',
                label: 'Revisar PN'
            };
        }
        if (action === 'descartar') {
            return {
                estado: 'ok',
                accion: 'eliminar',
                confirmText: 'OK / ELIMINAR',
                label: 'Descartar PN'
            };
        }
        return null;
    }

    function issueTags(validation) {
        const tags = [];
        if (!validation || typeof validation !== 'object') return tags;
        if (!validation.has_image) tags.push('no_image');
        if (!validation.has_measure) tags.push('no_measure');
        if (!validation.has_weight) tags.push('no_weight');
        if (!validation.has_sust) tags.push('sust');
        if (validation.has_conflicts) tags.push('conflict');
        if (!validation.has_designation) tags.push('missing_designation');
        return tags;
    }

    function buildBackendCandidates(pathSuffix) {
        const currentOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
        const host = normalize(window.location.hostname);
        const isLocal = host === 'localhost' || host === '127.0.0.1' || !host;
        const sameDirectory = new URL(pathSuffix.replace(/^\//, ''), new URL('.', window.location.href)).href;
        const localPort = isLocal && host ? `http://${host}:3000${pathSuffix}` : '';
        const sameOrigin = currentOrigin ? `${currentOrigin}${pathSuffix}` : pathSuffix;

        return [
            localPort,
            isLocal ? `http://localhost:3000${pathSuffix}` : '',
            sameDirectory,
            sameOrigin
        ].filter((item, index, list) => item && list.indexOf(item) === index);
    }

    async function apiFetch(pathSuffix, options) {
        const urls = buildBackendCandidates(pathSuffix);
        let lastError = null;

        for (const url of urls) {
            try {
                const response = await fetch(url, options || { cache: 'no-store' });
                if (!response.ok) {
                    const bodyText = await response.text();
                    lastError = new Error(`HTTP ${response.status} ${url} ${bodyText}`);
                    continue;
                }
                return await response.json();
            } catch (error) {
                lastError = error;
            }
        }

        throw new Error(normalize(lastError && lastError.message) || 'No se pudo conectar con el backend');
    }

    function renderSummary() {
        const rows = state.filtered;
        const total = rows.length;
        const importCount = rows.filter((row) => normalizeLower(row.decision) === 'import').length;
        const pendingCount = rows.filter((row) => normalizeLower(row.decision) === 'pending_review').length;
        const discardCount = rows.filter((row) => normalizeLower(row.decision) === 'discard').length;
        const withoutImage = rows.filter((row) => !row.validation?.has_image).length;
        const withoutMeasure = rows.filter((row) => !row.validation?.has_measure).length;
        const withConflicts = rows.filter((row) => row.validation?.has_conflicts).length;

        const today = new Date();
        const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        const reviewedToday = rows.filter((row) => {
            const value = normalize(row.qa_summary?.updated_at || '');
            if (!value) return false;
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return false;
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` === todayKey;
        }).length;

        const cards = [
            ['Total PN', total],
            ['Import', importCount],
            ['Pending', pendingCount],
            ['Discard', discardCount],
            ['Sin imagen', withoutImage],
            ['Sin medida', withoutMeasure],
            ['Con conflictos', withConflicts],
            ['Revisados hoy', reviewedToday]
        ];

        ui.summaryCards.innerHTML = cards.map((card) => {
            return `<article class="summary-card"><div class="k">${esc(card[0])}</div><div class="v">${esc(card[1])}</div></article>`;
        }).join('');
    }

    function compareValue(a, b, field) {
        const av = a[field];
        const bv = b[field];
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av || '').localeCompare(String(bv || ''), 'es', { numeric: true, sensitivity: 'base' });
    }

    function applyFilters() {
        const q = normalizeLower(ui.searchInput.value);
        const decision = normalizeLower(ui.decisionFilter.value);
        const validation = normalizeLower(ui.validationFilter.value);
        const engine = normalizeLower(ui.engineFilter.value);
        const qa = normalizeLower(ui.qaFilter.value);

        let rows = state.rows;

        if (q) {
            rows = rows.filter((row) => normalizeLower(row.sku).includes(q) || normalizeLower(row.designation_final).includes(q));
        }

        if (decision) {
            rows = rows.filter((row) => normalizeLower(row.decision) === decision);
        }

        if (validation) {
            rows = rows.filter((row) => {
                const v = row.validation || {};
                if (validation === 'conflict') return !!v.has_conflicts;
                if (validation === 'no_image') return !v.has_image;
                if (validation === 'no_measure') return !v.has_measure;
                if (validation === 'no_weight') return !v.has_weight;
                if (validation === 'no_sust') return !v.has_sust;
                if (validation === 'no_designation') return !v.has_designation;
                return true;
            });
        }

        if (engine) {
            rows = rows.filter((row) => Array.isArray(row.engine_models) && row.engine_models.some((item) => normalizeLower(item) === engine));
        }

        if (qa) {
            rows = rows.filter((row) => {
                const s = row.qa_summary || {};
                if (qa === 'has_ok_importar') return Number(s.ok_importar || 0) > 0;
                if (qa === 'has_ok_eliminar') return Number(s.ok_eliminar || 0) > 0;
                if (qa === 'has_pending_or_review') return Number(s.pendiente || 0) > 0 || Number(s.revisar || 0) > 0;
                return true;
            });
        }

        rows = [...rows].sort((a, b) => {
            const result = compareValue(a, b, state.sortField);
            return state.sortOrder === 'desc' ? -result : result;
        });

        state.filtered = rows;
    }

    function renderTable() {
        if (!state.filtered.length) {
            ui.pnTableBody.innerHTML = '<tr><td colspan="8">Sin resultados</td></tr>';
            ui.tableMeta.textContent = '0 PN visibles';
            renderSummary();
            return;
        }

        const html = state.filtered.map((row) => {
            const tags = issueTags(row.validation);
            const qa = row.qa_summary || {};
            const isActive = normalizeLower(row.sku) === normalizeLower(state.selectedSku);
            return `
                <tr data-sku="${esc(row.sku)}" class="${isActive ? 'active' : ''}">
                    <td class="mono">${esc(row.sku)}</td>
                    <td>${esc(row.designation_final || '-')}</td>
                    <td><span class="decision-pill ${decisionClass(row.decision)}">${esc(decisionLabel(row.decision))}</span></td>
                    <td>${esc(row.reason || '-')}</td>
                    <td>${esc(row.occurrences || 0)}</td>
                    <td>${esc((row.engine_models || []).join(', '))}</td>
                    <td class="mono">T:${esc(qa.total_rows || 0)} I:${esc(qa.ok_importar || 0)} X:${esc(qa.ok_eliminar || 0)} P:${esc(qa.pendiente || 0)} R:${esc(qa.revisar || 0)}</td>
                    <td>${tags.map((tag) => `<span class="issue-badge">${esc(tag)}</span>`).join(' ') || '-'}</td>
                </tr>
            `;
        }).join('');

        ui.pnTableBody.innerHTML = html;
        ui.tableMeta.textContent = `${state.filtered.length} PN visibles de ${state.rows.length}`;
        renderSummary();

        Array.from(ui.pnTableBody.querySelectorAll('tr[data-sku]')).forEach((tr) => {
            tr.addEventListener('click', async () => {
                const sku = normalize(tr.getAttribute('data-sku'));
                if (!sku) return;
                await selectSku(sku);
            });
        });
    }

    function fieldState(value, conflict) {
        if (!normalize(value)) return 'missing';
        if (conflict) return 'conflict';
        return 'ok';
    }

    function renderDetail(detail) {
        ui.detailEmpty.hidden = true;
        ui.detailContent.hidden = false;

        const occurrences = Number(detail.export_row?.occurrences || detail.qa_summary?.total_rows || 0);
        const engines = Array.isArray(detail.engine_models_all) ? detail.engine_models_all : [];
        const enginesLabel = engines.length ? engines.join(', ') : '-';

        ui.detailSku.textContent = detail.sku;
        ui.detailSubtitle.textContent = `${detail.export_row?.designation_final || '-'} | Engines: ${enginesLabel}`;
        ui.detailDecision.textContent = decisionLabel(detail.decision);
        ui.detailDecision.className = `decision-chip ${decisionClass(detail.decision)}`;
        ui.detailOccurrences.textContent = `Occurrences: ${occurrences}`;
        ui.detailEnginesCount.textContent = `Motores: ${engines.length}`;
        ui.detailReason.textContent = detail.reason || '-';

        const merged = detail.merged_fields || {};
        const conflictCodes = detail.validation?.conflict_codes || [];

        const fields = [
            ['SKU', detail.sku, 'Regla PN global', false],
            ['designation_final', merged.designation_final, 'Frecuencia mayoritaria', conflictCodes.includes('designation_conflict')],
            ['measure_final', merged.measure_final, 'Frecuencia mayoritaria', conflictCodes.includes('measure_conflict')],
            ['weight_final', merged.weight_final, 'Frecuencia mayoritaria', conflictCodes.includes('weight_conflict')],
            ['images', (detail.images_all || []).join(', '), 'exp_imagenes unificadas', false],
            ['sust_new_part_number', merged.sust_new_part_number, 'Frecuencia mayoritaria', conflictCodes.includes('sust_new_part_number_conflict')],
            ['sust_superseded_list', merged.sust_superseded_list, 'Frecuencia mayoritaria', false],
            ['categories', (merged.categories || []).join(', '), 'Campos categoria', false],
            ['tags', (merged.tags || []).join(', '), 'Campo tags', false]
        ];

        ui.exportFieldsTable.innerHTML = `
            <thead><tr><th>Campo</th><th>Valor final</th><th>Estado</th><th>Fuente preferida/regla</th><th>Conflicto</th></tr></thead>
            <tbody>
                ${fields.map((entry) => {
            const stateCode = fieldState(entry[1], entry[3]);
            return `<tr>
                            <td class="mono">${esc(entry[0])}</td>
                            <td>${esc(entry[1] || '-')}</td>
                            <td><span class="state-pill state-${esc(stateCode)}">${esc(stateCode)}</span></td>
                            <td>${esc(entry[2])}</td>
                            <td>${entry[3] ? 'si' : 'no'}</td>
                        </tr>`;
        }).join('')}
            </tbody>
        `;

        const qa = detail.qa_summary || {};
        const qaRows = [
            ['total_rows', qa.total_rows || 0],
            ['ok/importar', qa.ok_importar || 0],
            ['ok/eliminar', qa.ok_eliminar || 0],
            ['pendiente/revisar', Number(qa.pendiente || 0) + Number(qa.revisar || 0)],
            ['otros', qa.otros || 0]
        ];
        ui.qaSummaryBlock.innerHTML = qaRows.map((entry) => `<div class="mini-row"><span>${esc(entry[0])}</span><strong>${esc(entry[1])}</strong></div>`).join('');

        const conflictSummary = detail.conflict_summary || {};
        const codes = Array.isArray(conflictSummary.conflict_codes) ? conflictSummary.conflict_codes : [];
        if (!codes.length) {
            ui.conflictBlock.innerHTML = '<p>Sin conflictos detectados.</p>';
        } else {
            ui.conflictBlock.innerHTML = `
                <div class="issues-line">${codes.map((code) => `<span class="issue-badge">${esc(code)}</span>`).join(' ')}</div>
                <p>Se detectaron valores no equivalentes entre apariciones para los campos indicados.</p>
            `;
        }

        ui.markImportBtn.onclick = async () => {
            await applyDecision(detail, 'validar');
        };
        ui.markDiscardBtn.onclick = async () => {
            await applyDecision(detail, 'descartar');
        };
        ui.markReviewBtn.onclick = async () => {
            await applyDecision(detail, 'revisar');
        };
        ui.openSourcesBtn.onclick = () => openSources(detail.sku);
    }

    function sourceCellBadges(rows, source, fieldName, keyFn) {
        const set = new Set(rows.map((row) => keyFn(row[fieldName])).filter(Boolean));
        const sourceValue = keyFn(source[fieldName]);
        if (set.size <= 1) return '';
        if (!sourceValue) return '<span class="issue-badge">warning</span>';
        if (set.has(sourceValue)) return '<span class="issue-badge">conflict</span>';
        return '<span class="issue-badge">critical</span>';
    }

    function sortSources(rows) {
        return [...rows].sort((a, b) => {
            const av = a[state.sourceSortField] || '';
            const bv = b[state.sourceSortField] || '';
            const cmp = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
            return state.sourceSortOrder === 'desc' ? -cmp : cmp;
        });
    }

    function renderSourcesTable(sources) {
        const sorted = sortSources(sources);
        ui.sourcesTableBody.innerHTML = sorted.map((row) => {
            const pnPack = `${normalize(getPnReviewFieldValue(row, 'pn_excel', ''))} / ${normalize(getPnReviewFieldValue(row, 'pn_final', ''))}`;
            const dPack = `${normalize(getPnReviewFieldValue(row, 'designation_pdf', ''))} / ${normalize(getPnReviewFieldValue(row, 'designation_final', ''))} / ${normalize(row.designation_gesa)}`;
            const mPack = `${normalize(getPnReviewFieldValue(row, 'measure_final', ''))} / ${normalize(row.dimensions_gesa)} / ${normalize(row.measure_pdf)}`;
            const wPack = `${normalize(getPnReviewFieldValue(row, 'weight_final', ''))} / ${normalize(row.weight_gesa)} / ${normalize(row.weight_pdf)}`;
            const sPack = `${normalize(getPnReviewFieldValue(row, 'is_subst_final', ''))} / ${normalize(getPnReviewFieldValue(row, 'new_pn_final', ''))} / ${normalize(getPnReviewFieldValue(row, 'subst_pnlist_final', ''))}`;
            const qaPack = `${normalize(getPnReviewFieldValue(row, 'qa_revision_estado', ''))} / ${normalize(getPnReviewFieldValue(row, 'qa_revision_accion', ''))}`;

            const designationBadge = sourceCellBadges(sorted, row, 'designation_final', (v) => normalizeLower(v));
            const measureBadge = sourceCellBadges(sorted, row, 'measure_final', (v) => normalizeLower(v));
            const weightBadge = sourceCellBadges(sorted, row, 'weight_final', (v) => normalizeLower(v));
            const sustBadge = sourceCellBadges(sorted, row, 'sust_new_part_number', (v) => normalizeLower(v));

            return `
                <tr>
                    <td class="mono">${esc(row.ID || '-')}</td>
                    <td>${esc(getPnReviewFieldValue(row, 'engine_model', '-'))}</td>
                    <td>${esc(getPnReviewFieldValue(row, 'source_page', '-'))}</td>
                    <td>${esc(getPnReviewFieldValue(row, 'pos_final', '-'))}</td>
                    <td>${esc(pnPack)}</td>
                    <td>${esc(dPack)} ${designationBadge}</td>
                    <td>${esc(mPack)} ${measureBadge}</td>
                    <td>${esc(wPack)} ${weightBadge}</td>
                    <td>${esc(sPack)} ${sustBadge}</td>
                    <td>${esc(qaPack)}</td>
                </tr>
            `;
        }).join('');
    }

    async function openSources(sku) {
        let payload = state.sourcesCache.get(sku);
        if (!payload) {
            payload = await apiFetch(`/pn-review/${encodeURIComponent(sku)}/sources`, { cache: 'no-store' });
            state.sourcesCache.set(sku, payload);
        }

        ui.modalTitle.textContent = `Apariciones de ${sku}`;
        ui.modalMeta.textContent = `${payload.count || 0} filas fuente`;
        renderSourcesTable(payload.rows || []);
        if (!ui.sourcesModal.open) ui.sourcesModal.showModal();
    }

    async function selectSku(sku) {
        state.selectedSku = sku;
        renderTable();

        let detail = state.detailCache.get(sku);
        if (!detail) {
            const payload = await apiFetch(`/pn-review/${encodeURIComponent(sku)}`, { cache: 'no-store' });
            detail = payload;
            state.detailCache.set(sku, detail);
        }

        renderDetail(detail);
    }

    function buildDecisionConfirmation(detail, actionMeta) {
        const sku = normalize(detail?.sku);
        const occurrences = Number(detail?.export_row?.occurrences || detail?.qa_summary?.total_rows || 0);
        const engines = Array.isArray(detail?.engine_models_all) ? detail.engine_models_all : [];
        const enginesCount = engines.length;

        return `Vas a marcar todas las apariciones del PN ${sku} como ${actionMeta.confirmText}. Esto afectara a ${occurrences} registros en ${enginesCount} motores. ¿Continuar?`;
    }

    async function applyDecision(detail, action) {
        const sku = normalize(detail?.sku);
        const actionMeta = getDecisionActionMeta(action);
        if (!sku || !actionMeta) {
            showToast('No se pudo aplicar la decision: datos incompletos.', 'error');
            return;
        }

        const confirmMessage = buildDecisionConfirmation(detail, actionMeta);
        const expectedText = action === 'descartar' ? 'DESCARTAR' : 'APLICAR';
        const confirmed = await showConfirmDialog(`Confirmar: ${actionMeta.label}`, confirmMessage, { expectedText });
        if (!confirmed) return;

        try {
            const response = await apiFetch(`/pn-review/${encodeURIComponent(sku)}/apply-decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });

            if (!response.ok) {
                throw new Error(response.error || 'No se pudo aplicar decision');
            }

            state.detailCache.delete(sku);
            state.sourcesCache.delete(sku);
            showToast(`Decision aplicada (${actionMeta.label}). Registros: ${response.rows_updated}. Motores: ${(response.files_touched || []).length}.`, 'success');
            await loadList();
            await selectSku(sku);
        } catch (error) {
            showToast(`No se pudo aplicar la decision para ${sku}. ${error.message || error}`, 'error');
        }
    }

    function showToast(msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('toast--visible'), 10);
        setTimeout(() => {
            toast.classList.remove('toast--visible');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    function showConfirmDialog(title, msg, opts = {}) {
        return new Promise((resolve) => {
            const dlg = document.getElementById('confirmDialog');
            const titleEl = document.getElementById('confirmDialogTitle');
            const msgEl = document.getElementById('confirmDialogMsg');
            const okBtn = document.getElementById('confirmDialogOk');
            const cancelBtn = document.getElementById('confirmDialogCancel');
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

            titleEl.textContent = title;
            msgEl.textContent = '';

            const textNode = document.createElement('p');
            textNode.textContent = msg;
            textNode.style.margin = '0 0 10px';
            msgEl.appendChild(textNode);

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

                msgEl.appendChild(label);
                msgEl.appendChild(typedInput);
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
            okBtn.value = 'ok';
            cancelBtn.value = 'cancel';
            dlg.showModal();
            if (typedInput) typedInput.focus();
        });
    }

    async function checkHealth() {
        try {
            await apiFetch('/health', { cache: 'no-store' });
            ui.backendBadge.dataset.state = 'ok';
            ui.backendBadge.textContent = 'Backend: OK';
        } catch (_) {
            ui.backendBadge.dataset.state = 'error';
            ui.backendBadge.textContent = 'Backend: error';
        }
    }

    async function loadList() {
        const payload = await apiFetch('/pn-review/list?limit=20000&offset=0', { cache: 'no-store' });
        state.rows = Array.isArray(payload.rows) ? payload.rows : [];
        state.loadedAt = formatDateTime(payload.loaded_at);
        state.lastRefreshedAt = new Date().toISOString();
        ui.loadedAtBadge.textContent = `Ultima carga: ${state.loadedAt}`;
        applyFilters();
        renderTable();

        if (!state.selectedSku && state.filtered.length) {
            await selectSku(state.filtered[0].sku);
        } else if (state.selectedSku) {
            const exists = state.filtered.find((row) => normalizeLower(row.sku) === normalizeLower(state.selectedSku));
            if (exists) {
                await selectSku(exists.sku);
            }
        }
    }

    function clearFilters() {
        ui.searchInput.value = '';
        ui.decisionFilter.value = '';
        ui.validationFilter.value = '';
        ui.engineFilter.value = '';
        ui.qaFilter.value = '';
    }

    function bindEvents() {
        ui.refreshBtn.addEventListener('click', async () => {
            await checkHealth();
            await loadList();
        });

        const onFilter = () => {
            applyFilters();
            renderTable();
        };

        ui.searchInput.addEventListener('input', onFilter);
        ui.decisionFilter.addEventListener('change', onFilter);
        ui.validationFilter.addEventListener('change', onFilter);
        ui.engineFilter.addEventListener('change', onFilter);
        ui.qaFilter.addEventListener('change', onFilter);

        ui.quickPendingBtn.addEventListener('click', () => {
            clearFilters();
            ui.decisionFilter.value = 'pending_review';
            onFilter();
        });

        ui.quickIssuesBtn.addEventListener('click', () => {
            clearFilters();
            ui.validationFilter.value = 'conflict';
            onFilter();
        });

        ui.quickReadyBtn.addEventListener('click', () => {
            clearFilters();
            ui.decisionFilter.value = 'import';
            onFilter();
        });

        ui.quickResetBtn.addEventListener('click', () => {
            clearFilters();
            onFilter();
        });

        tableSortHeaders.forEach((th) => {
            th.addEventListener('click', () => {
                const field = normalize(th.getAttribute('data-sort'));
                if (!field) return;
                if (state.sortField === field) {
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortField = field;
                    state.sortOrder = 'asc';
                }
                applyFilters();
                renderTable();
            });
        });

        sourceSortHeaders.forEach((th) => {
            th.addEventListener('click', () => {
                const field = normalize(th.getAttribute('data-sort-source'));
                if (!field) return;
                if (state.sourceSortField === field) {
                    state.sourceSortOrder = state.sourceSortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sourceSortField = field;
                    state.sourceSortOrder = 'asc';
                }
                const activeSku = state.selectedSku;
                if (!activeSku) return;
                const payload = state.sourcesCache.get(activeSku);
                if (!payload) return;
                renderSourcesTable(payload.rows || []);
            });
        });
    }

    async function bootstrap() {
        bindEvents();
        await checkHealth();
        await loadList();
    }

    bootstrap().catch((error) => {
        ui.backendBadge.dataset.state = 'error';
        ui.backendBadge.textContent = `Error: ${error.message}`;
    });
})();
