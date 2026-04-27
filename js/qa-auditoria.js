function getAuditBackendCandidateUrls() {
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : '';
    const currentHostname = String(window.location.hostname || '').trim();
    const sameDirectoryCandidate = new URL('audit-log', new URL('.', window.location.href)).href;
    const localPortCandidate = currentHostname ? `http://${currentHostname}:3000/audit-log` : '';
    const sameOriginCandidate = currentOrigin ? `${currentOrigin}/audit-log` : '/audit-log';
    return [
        localPortCandidate,
        'http://localhost:3000/audit-log',
        sameDirectoryCandidate,
        sameOriginCandidate
    ].filter((url, index, arr) => url && arr.indexOf(url) === index);
}

async function fetchAuditEntries(limit = 1000) {
    const urls = getAuditBackendCandidateUrls();
    let lastError = null;
    for (const url of urls) {
        try {
            const response = await fetch(`${url}?limit=${limit}`, { cache: 'no-store' });
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                continue;
            }
            const json = await response.json();
            return Array.isArray(json?.entries) ? json.entries : [];
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(String(lastError?.message || 'No se pudo conectar con backend de auditoria'));
}

async function clearAuditEntries() {
    const urls = getAuditBackendCandidateUrls();
    let lastError = null;
    for (const url of urls) {
        try {
            const response = await fetch(url, { method: 'DELETE' });
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                continue;
            }
            return true;
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(String(lastError?.message || 'No se pudo limpiar auditoria'));
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '-');
    return date.toLocaleString('es-ES');
}

const ui = {
    tbody: document.getElementById('tbody'),
    status: document.getElementById('status'),
    q: document.getElementById('q'),
    kind: document.getElementById('kind'),
    refreshBtn: document.getElementById('refreshBtn'),
    clearBtn: document.getElementById('clearBtn')
};

let allEntries = [];

function applyFilters(entries) {
    const kind = String(ui.kind?.value || '').trim();
    const q = String(ui.q?.value || '').trim().toLowerCase();

    return entries.filter((entry) => {
        if (kind && String(entry?.kind || '') !== kind) return false;
        if (!q) return true;

        const changesList = Object.entries(entry?.data?.changes || {})
            .map(([field, values]) => `${field}: ${values?.before} → ${values?.after}`)
            .join(' ');

        const haystack = [
            entry?.kind,
            entry?.type,
            entry?.module,
            entry?.action,
            entry?.description,
            entry?.changeId,
            changesList,
            JSON.stringify(entry?.target || {})
        ].join(' ').toLowerCase();

        return haystack.includes(q);
    });
}

function formatChanges(changes) {
    if (!changes || typeof changes !== 'object') return '-';
    const entries = Object.entries(changes);
    if (!entries.length) return '-';

    return entries
        .map(([field, values]) => {
            const before = values?.before ?? '';
            const after = values?.after ?? '';
            const beforeStr = typeof before === 'object' ? JSON.stringify(before) : String(before);
            const afterStr = typeof after === 'object' ? JSON.stringify(after) : String(after);
            return `${field}: "${beforeStr}" → "${afterStr}"`;
        })
        .slice(0, 2)
        .join('<br>');
}

function formatFullChangeDetails(entry) {
    const lines = [];
    lines.push(`ID: ${esc(entry?.id || '-')}`);
    lines.push(`Timestamp: ${formatTimestamp(entry?.timestamp)}`);
    lines.push(`Kind: ${esc(entry?.kind || '-')}`);
    lines.push(`Type: ${esc(entry?.type || '-')}`);
    lines.push(`Module: ${esc(entry?.module || '-')}`);
    lines.push(`Action: ${esc(entry?.action || '-')}`);
    lines.push(`Description: ${esc(entry?.description || '-')}`);
    lines.push('');
    lines.push('Target:');
    lines.push(JSON.stringify(entry?.target || {}, null, 2));
    lines.push('');
    lines.push('Cambios detallados:');
    if (entry?.data?.changes && Object.keys(entry.data.changes).length) {
        Object.entries(entry.data.changes).forEach(([field, values]) => {
            const before = values?.before ?? '';
            const after = values?.after ?? '';
            const beforeStr = typeof before === 'object' ? JSON.stringify(before) : String(before);
            const afterStr = typeof after === 'object' ? JSON.stringify(after) : String(after);
            lines.push(`  ${field}:`);
            lines.push(`    Antes: ${beforeStr}`);
            lines.push(`    Despues: ${afterStr}`);
        });
    } else {
        lines.push('  (sin cambios registrados)');
    }
    return lines.join('\n');
}

function renderTable() {
    if (!(ui.tbody instanceof HTMLElement)) return;
    const rows = applyFilters(allEntries);

    if (!rows.length) {
        ui.tbody.innerHTML = '<tr><td colspan="5" class="muted">Sin resultados</td></tr>';
        if (ui.status) ui.status.textContent = `0 registros visibles de ${allEntries.length}`;
        return;
    }

    const rowsHtml = rows.map((entry, idx) => {
        const changesSummary = formatChanges(entry?.data?.changes);
        const fullDetails = formatFullChangeDetails(entry);
        const rowId = `audit-row-${idx}`;
        const detailId = `audit-detail-${idx}`;

        const mainRow = '<tr class="audit-main-row" data-detail-id="' + detailId + '">'
            + `<td>${esc(formatTimestamp(entry?.timestamp))}</td>`
            + `<td>${esc(entry?.description || '-')}</td>`
            + `<td>${changesSummary}</td>`
            + `<td>${esc(entry?.action || '-')}</td>`
            + `<td><span class="audit-expand-icon">▸</span>Ver todo</td>`
            + '</tr>';

        const detailRow = '<tr class="audit-detail-row" id="' + detailId + '">'
            + '<td colspan="5" class="audit-detail-cell">'
            + esc(fullDetails)
            + '</td>'
            + '</tr>';

        return mainRow + detailRow;
    }).join('');

    ui.tbody.innerHTML = rowsHtml;

    // Attach click handlers
    ui.tbody.querySelectorAll('.audit-main-row').forEach(row => {
        row.addEventListener('click', () => {
            const detailId = row.dataset.detailId;
            const detailRow = document.getElementById(detailId);
            if (detailRow) {
                detailRow.classList.toggle('expanded');
                const icon = row.querySelector('.audit-expand-icon');
                if (icon) {
                    icon.textContent = detailRow.classList.contains('expanded') ? '▾' : '▸';
                }
            }
        });
    });

    if (ui.status) ui.status.textContent = `${rows.length} registros visibles de ${allEntries.length}`;
}

async function reloadAudit() {
    if (ui.status) ui.status.textContent = 'Cargando auditoria...';
    allEntries = await fetchAuditEntries(2000);
    renderTable();
}

ui.refreshBtn?.addEventListener('click', () => {
    reloadAudit().catch((error) => {
        if (ui.status) ui.status.textContent = `Error: ${error.message}`;
    });
});

ui.clearBtn?.addEventListener('click', async () => {
    const confirmed = window.confirm('Se borrara toda la auditoria en servidor. Esta accion no se puede deshacer.');
    if (!confirmed) return;
    try {
        await clearAuditEntries();
        await reloadAudit();
    } catch (error) {
        if (ui.status) ui.status.textContent = `Error limpiando auditoria: ${error.message}`;
    }
});

ui.q?.addEventListener('input', renderTable);
ui.kind?.addEventListener('change', renderTable);

reloadAudit().catch((error) => {
    if (ui.status) ui.status.textContent = `Error: ${error.message}`;
    if (ui.tbody) {
        ui.tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`;
    }
});
