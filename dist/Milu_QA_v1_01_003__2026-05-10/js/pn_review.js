(function () {
    const PAGE_SIZE = 120;

    const state = {
        rows: [],
        filtered: [],
        selectedSku: '',
        detailBySku: new Map(),
        sourcesBySku: new Map(),
        sortBy: 'sku',
        sortOrder: 'asc',
        page: 0,
        total: 0,
        loadedAt: null
    };

    const ui = {
        reloadBtn: document.getElementById('reloadBtn'),
        statusBadge: document.getElementById('statusBadge'),
        searchInput: document.getElementById('searchInput'),
        decisionFilter: document.getElementById('decisionFilter'),
        severityFilter: document.getElementById('severityFilter'),
        tableMeta: document.getElementById('tableMeta'),
        tableBody: document.getElementById('pnTableBody'),
        prevPageBtn: document.getElementById('prevPageBtn'),
        nextPageBtn: document.getElementById('nextPageBtn'),
        pageInfo: document.getElementById('pageInfo'),
        detailEmpty: document.getElementById('detailEmpty'),
        detailContent: document.getElementById('detailContent'),
        detailSku: document.getElementById('detailSku'),
        openSourcesBtn: document.getElementById('openSourcesBtn'),
        exportableFields: document.getElementById('exportableFields'),
        scoreBlock: document.getElementById('scoreBlock'),
        rulesList: document.getElementById('rulesList'),
        conflictsList: document.getElementById('conflictsList'),
        mergeSummary: document.getElementById('mergeSummary'),
        modal: document.getElementById('sourcesModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalMeta: document.getElementById('modalMeta'),
        sourcesTableBody: document.getElementById('sourcesTableBody')
    };

    const tableHeaders = Array.from(document.querySelectorAll('th[data-sort]'));

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function debounce(fn, waitMs) {
        let timer = 0;
        return function debounced() {
            const args = arguments;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn.apply(null, args), waitMs);
        };
    }

    function buildBackendCandidates(pathSuffix) {
        const currentOrigin = window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : '';
        const host = String(window.location.hostname || '').trim();
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
        const sameDirectory = new URL(pathSuffix.replace(/^\//, ''), new URL('.', window.location.href)).href;
        const localPort = isLocal && host ? `http://${host}:3000${pathSuffix}` : '';
        const sameOrigin = currentOrigin ? `${currentOrigin}${pathSuffix}` : pathSuffix;
        return [
            localPort,
            isLocal ? `http://localhost:3000${pathSuffix}` : '',
            sameDirectory,
            sameOrigin
        ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);
    }

    async function apiFetch(pathSuffix, options) {
        const urls = buildBackendCandidates(pathSuffix);
        let lastError = null;

        for (const url of urls) {
            try {
                const response = await fetch(url, options || { cache: 'no-store' });
                if (!response.ok) {
                    lastError = new Error(`HTTP ${response.status} en ${url}`);
                    continue;
                }
                return await response.json();
            } catch (error) {
                lastError = error;
            }
        }

        throw new Error(String(lastError && lastError.message ? lastError.message : 'No se pudo conectar con backend PN'));
    }

    function updateStatus(text) {
        if (ui.statusBadge) ui.statusBadge.textContent = text;
    }

    function compareRows(a, b, field, order) {
        const av = a[field];
        const bv = b[field];
        let cmp = 0;

        if (typeof av === 'number' && typeof bv === 'number') {
            cmp = av - bv;
        } else {
            cmp = String(av || '').localeCompare(String(bv || ''), 'es', { numeric: true, sensitivity: 'base' });
        }

        return order === 'desc' ? -cmp : cmp;
    }

    function applyFiltersAndSort() {
        const query = String(ui.searchInput && ui.searchInput.value || '').trim().toLowerCase();
        const decision = String(ui.decisionFilter && ui.decisionFilter.value || '').trim().toLowerCase();
        const severity = String(ui.severityFilter && ui.severityFilter.value || '').trim().toLowerCase();

        let rows = state.rows;

        if (query) {
            rows = rows.filter((row) => String(row.sku || '').toLowerCase().includes(query));
        }

        if (decision) {
            rows = rows.filter((row) => String(row.decision || '').toLowerCase() === decision);
        }

        if (severity) {
            rows = rows.filter((row) => String(row.conflict_severity || '').toLowerCase() === severity);
        }

        rows = [...rows].sort((a, b) => compareRows(a, b, state.sortBy, state.sortOrder));

        state.filtered = rows;
        state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
    }

    function renderTable() {
        if (!(ui.tableBody instanceof HTMLElement)) return;

        if (!state.filtered.length) {
            ui.tableBody.innerHTML = '<tr><td colspan="6">Sin resultados</td></tr>';
            if (ui.tableMeta) ui.tableMeta.textContent = '0 PN visibles';
            if (ui.pageInfo) ui.pageInfo.textContent = 'Pagina 0 / 0';
            return;
        }

        const start = state.page * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, state.filtered.length);
        const rows = state.filtered.slice(start, end);

        const html = rows.map((row) => {
            const activeClass = row.sku === state.selectedSku ? 'active' : '';
            return `
                <tr class="${activeClass}" data-sku="${esc(row.sku)}">
                    <td>${esc(row.sku)}</td>
                    <td>${esc(row.decision)}</td>
                    <td>${Number(row.confidence || 0).toFixed(3)}</td>
                    <td>${esc(row.occurrences)}</td>
                    <td>${esc(row.conflicts_count)}</td>
                    <td>${esc(row.engines_count)}</td>
                </tr>
            `;
        }).join('');

        ui.tableBody.innerHTML = html;

        for (const tr of ui.tableBody.querySelectorAll('tr[data-sku]')) {
            tr.addEventListener('click', () => {
                const sku = String(tr.getAttribute('data-sku') || '').trim();
                if (!sku) return;
                selectSku(sku).catch((error) => {
                    updateStatus(`Error detalle: ${error.message}`);
                });
            });
        }

        const pageTotal = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
        if (ui.tableMeta) {
            ui.tableMeta.textContent = `${state.filtered.length} PN visibles de ${state.total} total | actualizado ${state.loadedAt || '-'}`;
        }
        if (ui.pageInfo) {
            ui.pageInfo.textContent = `Pagina ${state.page + 1} / ${pageTotal}`;
        }
    }

    function badgeClass(status) {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'error') return 'badge error';
        if (normalized === 'warning') return 'badge warning';
        return 'badge ok';
    }

    function renderDetail(detail) {
        if (!detail || !ui.detailContent) return;
        if (ui.detailEmpty) ui.detailEmpty.hidden = true;
        ui.detailContent.hidden = false;

        if (ui.detailSku) ui.detailSku.textContent = `${detail.sku} (${detail.decision || '-'})`;

        const fields = Array.isArray(detail.exportable_fields) ? detail.exportable_fields : [];
        if (ui.exportableFields) {
            ui.exportableFields.innerHTML = `
                <div class="fields-grid">
                    ${fields.map((field) => `
                        <div class="field-row">
                            <span class="key">${esc(field.field)}</span>
                            <span class="value">${esc(field.value || '-')}</span>
                            <span class="${badgeClass(field.status)}">${esc(field.status)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (ui.scoreBlock) {
            const score = detail.score || {};
            ui.scoreBlock.innerHTML = `
                <div class="score-grid">
                    <div class="score-row"><span class="key">consistency_score</span><span>${esc(Number(score.consistency_score || 0).toFixed(3))}</span></div>
                    <div class="score-row"><span class="key">field_agreement_ratio</span><span>${esc(Number(score.field_agreement_ratio || 0).toFixed(3))}</span></div>
                    <div class="score-row"><span class="key">conflict_severity</span><span>${esc(score.conflict_severity || '-')}</span></div>
                    <div class="score-row"><span class="key">conflicts_count</span><span>${esc(score.conflicts_count || 0)}</span></div>
                </div>
            `;
        }

        if (ui.rulesList) {
            const rules = Array.isArray(detail.rules_applied) ? detail.rules_applied : [];
            ui.rulesList.innerHTML = rules.length
                ? rules.map((rule) => `<li>${esc(rule)}</li>`).join('')
                : '<li>Sin reglas declaradas</li>';
        }

        if (ui.conflictsList) {
            const conflicts = Array.isArray(detail.conflicts) ? detail.conflicts : [];
            ui.conflictsList.innerHTML = conflicts.length
                ? conflicts.map((conflict) => `<li>${esc(conflict.field)} (${esc(conflict.severity)})</li>`).join('')
                : '<li>Sin conflictos reales</li>';
        }

        if (ui.mergeSummary) {
            const summary = detail.resumen_fusion || {};
            const summaryRows = [
                ['total_occurrences_global', summary.total_occurrences_global],
                ['engines_count', summary.engines_count],
                ['engine_models_all', summary.engine_models_all],
                ['source_pages_all', summary.source_pages_all],
                ['source_ids_all', summary.source_ids_all],
                ['merge_decision', summary.merge_decision],
                ['merge_decision_reasons', (summary.merge_decision_reasons || []).join(', ')]
            ];
            ui.mergeSummary.innerHTML = `
                <div class="summary-grid">
                    ${summaryRows.map((entry) => `
                        <div class="summary-row">
                            <span class="key">${esc(entry[0])}</span>
                            <span class="value">${esc(entry[1] == null ? '-' : entry[1])}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (ui.openSourcesBtn) {
            ui.openSourcesBtn.onclick = () => {
                openSourcesModal(detail.sku).catch((error) => {
                    updateStatus(`Error fuentes: ${error.message}`);
                });
            };
        }
    }

    async function selectSku(sku) {
        state.selectedSku = sku;
        renderTable();

        if (state.detailBySku.has(sku)) {
            renderDetail(state.detailBySku.get(sku));
            return;
        }

        updateStatus(`Cargando detalle ${sku}...`);
        const detail = await apiFetch(`/pn/${encodeURIComponent(sku)}`);
        state.detailBySku.set(sku, detail);
        renderDetail(detail);
        updateStatus(`Detalle listo: ${sku}`);
    }

    function dominantValueByColumn(rows, column) {
        const counts = new Map();
        for (const row of rows) {
            const value = String(row && row[column] || '').trim();
            if (!value) continue;
            counts.set(value, (counts.get(value) || 0) + 1);
        }
        let winner = '';
        let best = 0;
        for (const [value, count] of counts.entries()) {
            if (count > best) {
                winner = value;
                best = count;
            }
        }
        return winner;
    }

    function renderSourcesRows(rows, conflictColumns) {
        const allRows = Array.isArray(rows) ? rows : [];
        const conflictSet = new Set(Array.isArray(conflictColumns) ? conflictColumns : []);
        const columns = [
            'id',
            'engine_model',
            'source_file',
            'source_page',
            'pos',
            'bom',
            'designation_final',
            'measure_final',
            'weight_final',
            'qa_revision_estado',
            'qa_revision_accion'
        ];

        const dominant = {};
        for (const column of columns) {
            dominant[column] = dominantValueByColumn(allRows, column);
        }

        return allRows.map((row) => {
            const cells = columns.map((column) => {
                const value = String(row && row[column] || '').trim();
                const classes = [];
                if (conflictSet.has(column) && value && value !== dominant[column]) classes.push('diff-cell');
                if ((column === 'measure_final' || column === 'weight_final' || column === 'designation_final') && conflictSet.has(column)) {
                    classes.push('conflict-cell');
                }
                return `<td class="${classes.join(' ')}">${esc(value)}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    }

    async function openSourcesModal(sku) {
        if (!(ui.modal instanceof HTMLDialogElement)) return;

        let payload = state.sourcesBySku.get(sku);
        if (!payload) {
            updateStatus(`Cargando apariciones ${sku}...`);
            payload = await apiFetch(`/pn/${encodeURIComponent(sku)}/sources`);
            state.sourcesBySku.set(sku, payload);
        }

        if (ui.modalTitle) ui.modalTitle.textContent = `Apariciones de ${sku}`;
        if (ui.modalMeta) ui.modalMeta.textContent = `${payload.count || 0} filas fuente | columnas en conflicto: ${(payload.diff && payload.diff.conflictColumns || []).join(', ') || 'ninguna'}`;

        if (ui.sourcesTableBody) {
            ui.sourcesTableBody.innerHTML = renderSourcesRows(payload.rows, payload.diff && payload.diff.conflictColumns);
        }

        if (!ui.modal.open) ui.modal.showModal();
        updateStatus(`Apariciones listas: ${sku}`);
    }

    async function loadList() {
        updateStatus('Cargando lista de PN...');
        const response = await apiFetch('/pn/list?limit=10000&offset=0');
        state.rows = Array.isArray(response.rows) ? response.rows : [];
        state.total = Number(response.total || state.rows.length);
        state.loadedAt = String(response.loaded_at || '').replace('T', ' ').slice(0, 19);

        applyFiltersAndSort();
        renderTable();

        if (!state.selectedSku && state.filtered.length) {
            await selectSku(state.filtered[0].sku);
        }

        updateStatus(`Listo: ${state.rows.length} PN`);
    }

    function installEvents() {
        ui.reloadBtn && ui.reloadBtn.addEventListener('click', () => {
            loadList().catch((error) => updateStatus(`Error: ${error.message}`));
        });

        const onFilterChange = debounce(() => {
            state.page = 0;
            applyFiltersAndSort();
            renderTable();
        }, 120);

        ui.searchInput && ui.searchInput.addEventListener('input', onFilterChange);
        ui.decisionFilter && ui.decisionFilter.addEventListener('change', onFilterChange);
        ui.severityFilter && ui.severityFilter.addEventListener('change', onFilterChange);

        ui.prevPageBtn && ui.prevPageBtn.addEventListener('click', () => {
            if (state.page <= 0) return;
            state.page -= 1;
            renderTable();
        });

        ui.nextPageBtn && ui.nextPageBtn.addEventListener('click', () => {
            const pageTotal = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
            if (state.page >= pageTotal - 1) return;
            state.page += 1;
            renderTable();
        });

        for (const th of tableHeaders) {
            th.addEventListener('click', () => {
                const field = String(th.getAttribute('data-sort') || '').trim();
                if (!field) return;
                if (state.sortBy === field) {
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortBy = field;
                    state.sortOrder = 'asc';
                }
                applyFiltersAndSort();
                renderTable();
            });
        }
    }

    installEvents();
    loadList().catch((error) => {
        updateStatus(`Error: ${error.message}`);
        if (ui.tableBody) ui.tableBody.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
    });
})();
