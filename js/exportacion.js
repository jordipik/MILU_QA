/* MILU — Exportación: lógica de página independiente. */
(function () {
    'use strict';

    const API = {
        health: '/health',
        files: '/export/files',
        wordpressDecisions: '/export/wordpress-decisions',
        file: (folder, name) => `/export/file?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`,
        download: (folder, name) => `/export/download?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`,
        preview: '/export/preview',
        runSynthetic: '/export/run-synthetic',
        runWordpress: '/export/run-wordpress',
        runAi: '/export/run-ai-conflicts',
        runAll: '/export/run-all',
        status: '/export/status'
    };

    const state = {
        files: [],
        decisionRows: [],
        sortKey: 'mtime',
        sortAsc: false,
        selected: null,
        running: false
    };

    const $ = (id) => document.getElementById(id);

    function fmtBytes(bytes) {
        if (!Number.isFinite(bytes)) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
        } catch (_) { return iso; }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function appendLog(msg, level) {
        const el = $('expLog');
        if (!el) return;
        const ts = new Date().toLocaleTimeString('es-ES');
        const prefix = level === 'error' ? '[ERR]' : level === 'ok' ? '[OK ]' : '[   ]';
        const line = `${ts} ${prefix} ${msg}`;
        el.textContent = (el.textContent === 'Esperando acciones…' ? '' : `${el.textContent}\n`) + line;
        el.scrollTop = el.scrollHeight;
    }

    function setBackendStatus(state2, text) {
        const el = $('expBackendStatus');
        el.dataset.state = state2;
        el.textContent = text;
    }

    function setRunStatus(text) {
        $('expRunStatus').textContent = text || '—';
    }

    function setActionsDisabled(disabled) {
        document.querySelectorAll('#expActions button[data-job]').forEach((btn) => {
            btn.disabled = disabled;
        });
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        let body = null;
        try { body = await response.json(); } catch (_) { body = null; }
        if (!response.ok || (body && body.ok === false)) {
            const errMsg = body?.error || `HTTP ${response.status}`;
            const err = new Error(errMsg);
            err.body = body;
            err.status = response.status;
            throw err;
        }
        return body;
    }

    async function checkBackend() {
        try {
            await fetchJson(API.health);
            setBackendStatus('ok', 'Backend conectado');
        } catch (err) {
            setBackendStatus('error', 'Backend no responde');
            appendLog(`Backend offline: ${err.message}`, 'error');
        }
    }

    async function loadFiles() {
        try {
            const body = await fetchJson(API.files);
            state.files = Array.isArray(body.files) ? body.files : [];
            renderSummary(body.summary || {}, body.run_state || null);
            renderFiles();
        } catch (err) {
            appendLog(`Error cargando archivos: ${err.message}`, 'error');
        }

        await loadDecisionRows();
    }

    function renderDecisionTable() {
        const tbody = $('expDecisionBody');
        if (!tbody) return;

        const filter = String(($('expDecisionFilter')?.value || '')).trim().toLowerCase();
        const rows = state.decisionRows.filter((row) => {
            if (!filter) return true;
            return String(row?.decision || '').toLowerCase() === filter;
        });

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="exp-empty">Sin resultados para el filtro seleccionado.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.slice(0, 1500).map((row) => `
            <tr>
                <td>${escapeHtml(row?.sku || '')}</td>
                <td>${escapeHtml(row?.designation_final || '')}</td>
                <td>${String(row?.qa_validated).toLowerCase() === 'true' ? 'true' : 'false'}</td>
                <td>${escapeHtml(row?.decision || '')}</td>
                <td>${escapeHtml(row?.reason || '')}</td>
                <td>${escapeHtml(row?.occurrences || '')}</td>
                <td>${escapeHtml(row?.engines || '')}</td>
                <td>${escapeHtml(row?.source_ids || '')}</td>
            </tr>
        `).join('');
    }

    async function loadDecisionRows() {
        try {
            const payload = await fetchJson(API.wordpressDecisions);
            state.decisionRows = Array.isArray(payload?.rows) ? payload.rows : [];
            const summary = payload?.summary || {};

            $('expSumImport').textContent = summary.import ?? '—';
            $('expSumPending').textContent = summary.pending_review ?? '—';
            $('expSumDiscard').textContent = summary.discard ?? '—';
            $('expSumValidated').textContent = summary.qa_validated ?? '—';
            $('expSumDecisionTotal').textContent = summary.total ?? '—';

            renderDecisionTable();
        } catch (err) {
            appendLog(`No se pudo cargar decisiones QA: ${err.message}`, 'error');
        }

        try {
            const preview = await fetchJson(API.preview);
            const s = preview?.summary || {};
            if (!Number.isFinite(Number($('expSumImport').textContent))) {
                $('expSumImport').textContent = s.preview_import ?? s.preview_new ?? '—';
            }
            if (!Number.isFinite(Number($('expSumPending').textContent))) {
                $('expSumPending').textContent = s.preview_pending ?? '—';
            }
            if (!Number.isFinite(Number($('expSumDiscard').textContent))) {
                $('expSumDiscard').textContent = s.preview_discarded ?? '—';
            }
        } catch (_) {
            // preview puede no existir aún.
        }
    }

    function renderSummary(summary, runState) {
        $('expSumFiles').textContent = summary.totalFiles ?? '—';
        $('expSumSize').textContent = fmtBytes(summary.totalSize || 0);
        $('expSumLast').textContent = fmtDate(summary.lastModified);
        const byFolder = summary.byFolder || {};
        $('expSumByFolder').textContent = Object.entries(byFolder)
            .map(([k, v]) => `${k}: ${v}`).join(' · ');

        if (runState && runState.lastJob) {
            const ts = fmtDate(runState.finishedAt);
            const status = runState.lastError ? `error (${runState.lastError})` : 'OK';
            setRunStatus(`Última ejecución: ${runState.lastJob} — ${status} — ${ts}`);
        }
    }

    function compareValues(a, b, key) {
        const av = a[key]; const bv = b[key];
        if (key === 'size') return (av || 0) - (bv || 0);
        if (key === 'mtime') return String(av || '').localeCompare(String(bv || ''));
        return String(av || '').localeCompare(String(bv || ''), 'es', { numeric: true, sensitivity: 'base' });
    }

    function renderFiles() {
        const tbody = $('expFilesBody');
        if (!state.files.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="exp-empty">No hay archivos generados todavía.</td></tr>';
            $('expFilesCount').textContent = '0 archivos';
            return;
        }
        const sorted = state.files.slice().sort((a, b) => {
            const cmp = compareValues(a, b, state.sortKey);
            return state.sortAsc ? cmp : -cmp;
        });
        $('expFilesCount').textContent = `${sorted.length} archivo${sorted.length === 1 ? '' : 's'}`;
        tbody.innerHTML = sorted.map((f) => {
            const isSelected = state.selected
                && state.selected.folder === f.folder
                && state.selected.name === f.name;
            return `<tr data-folder="${escapeHtml(f.folder)}" data-name="${escapeHtml(f.name)}"${isSelected ? ' class="is-selected"' : ''}>
                <td><span class="exp-folder-tag" data-folder="${escapeHtml(f.folder)}">${escapeHtml(f.folder)}</span></td>
                <td title="${escapeHtml(f.path)}">${escapeHtml(f.name)}</td>
                <td>${escapeHtml(f.type)}</td>
                <td>${fmtBytes(f.size)}</td>
                <td>${fmtDate(f.mtime)}</td>
                <td class="exp-row-actions">
                    <button data-action="view" type="button">Ver</button>
                    <button data-action="download" type="button">Descargar</button>
                    <button data-action="copy" type="button">Copiar ruta</button>
                </td>
            </tr>`;
        }).join('');
    }

    function selectFile(folder, name) {
        state.selected = { folder, name };
        renderFiles();
        loadPreview(folder, name);
    }

    async function loadPreview(folder, name) {
        const titleEl = $('expPreviewTitle');
        const metaEl = $('expPreviewMeta');
        const metaTopEl = $('expPreviewMetaTop');
        const container = $('expPreviewContainer');
        titleEl.textContent = `Preview — ${name}`;
        metaTopEl.textContent = `${folder}/${name}`;
        metaEl.textContent = 'Cargando…';
        container.innerHTML = '';

        try {
            const body = await fetchJson(API.file(folder, name));
            const meta = [];
            meta.push(`<strong>${escapeHtml(folder)}/${escapeHtml(name)}</strong>`);
            meta.push(`Tamaño: ${fmtBytes(body.size)}`);
            meta.push(`Modificado: ${fmtDate(body.mtime)}`);
            if (body.truncated) meta.push('<span style="color:var(--exp-warn);">⚠ preview truncado</span>');
            metaEl.innerHTML = meta.join(' · ');

            if (body.type === 'json' && body.json) {
                renderJsonPreview(container, body);
            } else if (body.type === 'csv') {
                renderCsvPreview(container, body.text || '');
            } else if (body.type === 'md' || body.type === 'txt') {
                container.innerHTML = `<pre class="exp-preview-content">${escapeHtml(body.text || '')}</pre>`;
            } else {
                container.innerHTML = `<pre class="exp-preview-content">${escapeHtml(body.text || '(sin contenido)')}</pre>`;
            }
        } catch (err) {
            metaEl.innerHTML = `<span style="color:var(--exp-danger);">Error: ${escapeHtml(err.message)}</span>`;
            container.innerHTML = '';
        }
    }

    function renderJsonPreview(container, body) {
        const j = body.json;
        const summary = document.createElement('div');
        summary.style.marginBottom = '8px';
        summary.style.fontSize = '12px';
        if (j.is_array) {
            summary.innerHTML = `Array · <strong>${j.length}</strong> entradas (mostrando primeras ${Math.min(20, j.length)})`;
        } else if (j.keys) {
            summary.innerHTML = `Objeto · claves: <code>${escapeHtml(j.keys.join(', '))}</code>`;
        } else {
            summary.innerHTML = 'JSON';
        }
        container.appendChild(summary);

        const pre = document.createElement('pre');
        pre.className = 'exp-preview-content';
        try {
            pre.textContent = JSON.stringify(j.sample, null, 2);
        } catch (_) {
            pre.textContent = String(j.sample);
        }
        container.appendChild(pre);
    }

    function parseCsvLine(line, sep) {
        const out = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
                else if (ch === '"') inQuotes = false;
                else current += ch;
            } else if (ch === '"') inQuotes = true;
            else if (ch === sep) { out.push(current); current = ''; }
            else current += ch;
        }
        out.push(current);
        return out;
    }

    function renderCsvPreview(container, text) {
        if (!text) {
            container.innerHTML = '<div class="exp-empty">CSV vacío</div>';
            return;
        }
        const cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        const lines = cleaned.split(/\r?\n/).filter((l) => l.length > 0);
        if (!lines.length) {
            container.innerHTML = '<div class="exp-empty">CSV vacío</div>';
            return;
        }
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = parseCsvLine(lines[0], sep);
        const rows = lines.slice(1, 51).map((l) => parseCsvLine(l, sep));

        const summary = document.createElement('div');
        summary.style.marginBottom = '8px';
        summary.style.fontSize = '12px';
        summary.innerHTML = `CSV (sep <code>${sep}</code>) · ${lines.length - 1} filas (mostrando primeras ${rows.length})`;
        container.appendChild(summary);

        const wrap = document.createElement('div');
        wrap.style.overflow = 'auto';
        wrap.style.maxHeight = '60vh';
        const table = document.createElement('table');
        table.className = 'exp-preview-csv';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const r of rows) {
            tbody.innerHTML += `<tr>${headers.map((_, i) => `<td>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`;
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        container.appendChild(wrap);
    }

    async function runJob(job) {
        if (state.running) return;
        const endpoints = {
            'run-synthetic': API.runSynthetic,
            'run-wordpress': API.runWordpress,
            'run-ai-conflicts': API.runAi,
            'run-all': API.runAll
        };
        const url = endpoints[job];
        if (!url) return;

        state.running = true;
        setActionsDisabled(true);
        setBackendStatus('running', `Ejecutando ${job}…`);
        appendLog(`▶ Iniciando ${job}…`);

        try {
            const body = await fetchJson(url, { method: 'POST' });
            appendLog(`✓ ${job} completado`, 'ok');
            const result = body?.result;
            if (result) {
                if (result.synthetic) {
                    appendLog(`  synthetic: new=${result.synthetic.synthetic_new_compacted}, sup=${result.synthetic.synthetic_superseded_compacted}, all_rows=${result.synthetic.all_rows}`);
                }
                if (result.export_review_summary) {
                    const s = result.export_review_summary;
                    appendLog(`  preview: total=${s.preview_total}, new=${s.preview_new}, sup=${s.preview_superseded}, pending=${s.preview_pending}, discard=${s.preview_discarded}, conflicts=${s.conflict_rows}`);
                }
                if (result.wordpress?.stdout) {
                    const tail = String(result.wordpress.stdout).split('\n').slice(-5).join('\n');
                    if (tail.trim()) appendLog(`  wordpress stdout (tail):\n${tail}`);
                }
                if (result.ai?.stdout) {
                    const tail = String(result.ai.stdout).split('\n').slice(-5).join('\n');
                    if (tail.trim()) appendLog(`  ai stdout (tail):\n${tail}`);
                }
            }
            setBackendStatus('ok', 'Backend conectado');
        } catch (err) {
            appendLog(`✗ ${job} falló: ${err.message}`, 'error');
            setBackendStatus('error', `Error en ${job}`);
        } finally {
            state.running = false;
            setActionsDisabled(false);
            await loadFiles();
        }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            appendLog(`Ruta copiada: ${text}`, 'ok');
        } catch (_) {
            appendLog(`No se pudo copiar al portapapeles: ${text}`, 'error');
        }
    }

    function bindEvents() {
        $('expBtnRefresh').addEventListener('click', () => { loadFiles(); });
        $('expBtnClearLog').addEventListener('click', () => { $('expLog').textContent = 'Esperando acciones…'; });
        $('expDecisionFilter')?.addEventListener('change', renderDecisionTable);

        document.querySelectorAll('#expActions button[data-job]').forEach((btn) => {
            btn.addEventListener('click', () => runJob(btn.dataset.job));
        });

        document.querySelectorAll('#expFilesTable thead th[data-sort]').forEach((th) => {
            th.addEventListener('click', () => {
                const k = th.dataset.sort;
                if (state.sortKey === k) state.sortAsc = !state.sortAsc;
                else { state.sortKey = k; state.sortAsc = true; }
                renderFiles();
            });
        });

        $('expFilesBody').addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-action]');
            const tr = event.target.closest('tr[data-folder]');
            if (!tr) return;
            const folder = tr.dataset.folder;
            const name = tr.dataset.name;
            if (btn) {
                event.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'view') selectFile(folder, name);
                else if (action === 'download') window.open(API.download(folder, name), '_blank');
                else if (action === 'copy') {
                    const f = state.files.find((x) => x.folder === folder && x.name === name);
                    if (f) copyToClipboard(f.path);
                }
                return;
            }
            selectFile(folder, name);
        });
    }

    async function init() {
        bindEvents();
        await checkBackend();
        await loadFiles();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
