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

        const haystack = [
            entry?.kind,
            entry?.type,
            entry?.module,
            entry?.action,
            entry?.description,
            entry?.changeId,
            JSON.stringify(entry?.target || {})
        ].join(' ').toLowerCase();

        return haystack.includes(q);
    });
}

function renderTable() {
    if (!(ui.tbody instanceof HTMLElement)) return;
    const rows = applyFilters(allEntries);

    if (!rows.length) {
        ui.tbody.innerHTML = '<tr><td colspan="7" class="muted">Sin resultados</td></tr>';
        if (ui.status) ui.status.textContent = `0 registros visibles de ${allEntries.length}`;
        return;
    }

    ui.tbody.innerHTML = rows.map((entry) => {
        const targetTxt = JSON.stringify(entry?.target || {});
        return '<tr>'
            + `<td>${esc(formatTimestamp(entry?.timestamp))}</td>`
            + `<td class="mono">${esc(entry?.kind || '-')}</td>`
            + `<td>${esc(entry?.module || '-')}</td>`
            + `<td>${esc(entry?.action || '-')}</td>`
            + `<td>${esc(entry?.description || '-')}</td>`
            + `<td class="mono">${esc(targetTxt || '{}')}</td>`
            + `<td class="mono">${esc(entry?.changeId || entry?.id || '-')}</td>`
            + '</tr>';
    }).join('');

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
