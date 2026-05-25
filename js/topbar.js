/**
 * Componente reutilizable de encabezado (topbar)
 * Se usa en qa_milu.html, qa_lista_agrupada.html y analista_02.html
 */

import { checkSaveBackendConnection } from './data-loader.js';

let backendStatusTimer = null;
const ENABLE_EXPORT_VIEW = false;
const BACKEND_STATUS_CACHE_KEY = 'milu_backend_status_cache_v1';
const BACKEND_STATUS_CACHE_MAX_AGE_MS = 30000;

function resolveAppBasePath() {
    const pathname = String(window.location.pathname || '/');
    return /^\/milu(\/|$)/i.test(pathname) ? '/milu' : '';
}

const APP_BASE_PATH = resolveAppBasePath();
const appUrl = (pathname) => `${APP_BASE_PATH}${pathname}`;

function isEmbeddedMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get('embedded') === '1';
}

function getNavTargetHref(pageKey) {
    const allowedViews = ENABLE_EXPORT_VIEW
        ? ['importpdf', 'pdf', 'export', 'analisis', 'imagenes', 'exportwp']
        : ['importpdf', 'pdf', 'analisis', 'imagenes', 'exportwp'];
    const view = allowedViews.includes(pageKey) ? pageKey : 'pdf';
    return `${appUrl('/milu_shell.html')}?view=${encodeURIComponent(view)}`;
}

function readCachedBackendStatus() {
    try {
        const raw = sessionStorage.getItem(BACKEND_STATUS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const status = String(parsed?.status || '').trim();
        const message = String(parsed?.message || '').trim();
        const updatedAt = Number(parsed?.updatedAt || 0);
        if (!status || !message || !Number.isFinite(updatedAt)) return null;
        if (Date.now() - updatedAt > BACKEND_STATUS_CACHE_MAX_AGE_MS) return null;
        return { status, message, updatedAt };
    } catch (_) {
        return null;
    }
}

function writeCachedBackendStatus(status, message) {
    try {
        sessionStorage.setItem(BACKEND_STATUS_CACHE_KEY, JSON.stringify({
            status,
            message,
            updatedAt: Date.now()
        }));
    } catch (_) {
        // Ignore cache write errors.
    }
}

function setBackendStatusBadge(status, message) {
    const statusWrap = document.getElementById('backendStatus');
    const statusText = document.getElementById('backendStatusText');
    if (!statusWrap || !statusText) return;

    statusWrap.classList.remove('checking', 'online', 'offline');
    statusWrap.classList.add(status);
    statusText.textContent = message;
}

async function refreshBackendStatus() {
    setBackendStatusBadge('checking', 'Backend: comprobando...');
    try {
        const result = await checkSaveBackendConnection();
        if (result.ok) {
            setBackendStatusBadge('online', 'Backend: conectado');
            writeCachedBackendStatus('online', 'Backend: conectado');
            return;
        }
        setBackendStatusBadge('offline', 'Backend: sin conexion');
        writeCachedBackendStatus('offline', 'Backend: sin conexion');
    } catch (error) {
        setBackendStatusBadge('offline', 'Backend: sin conexion');
        writeCachedBackendStatus('offline', 'Backend: sin conexion');
    }
}

function primeNavigationPrefetch() {
    const links = Array.from(document.querySelectorAll('header.a2-topbar .a2-nav a[href]'));
    links.forEach(link => {
        if (!(link instanceof HTMLAnchorElement)) return;
        const href = link.getAttribute('href');
        if (!href) return;
        const url = new URL(href, window.location.href);
        if (url.pathname === window.location.pathname) return;

        const preload = document.createElement('link');
        preload.rel = 'prefetch';
        preload.href = url.href;
        preload.as = 'document';
        document.head.appendChild(preload);
    });
}

function initBackendStatusMonitor() {
    // Reusar estado reciente para evitar parpadeo entre páginas.
    const cachedStatus = readCachedBackendStatus();
    if (cachedStatus) {
        setBackendStatusBadge(cachedStatus.status, cachedStatus.message);
    } else {
        setBackendStatusBadge('checking', 'Backend: comprobando...');
    }

    // Verificar estado real en segundo plano.
    refreshBackendStatus();

    // Limpiar timer anterior si existe
    if (backendStatusTimer) clearInterval(backendStatusTimer);

    // Verificar cada 30 segundos
    backendStatusTimer = setInterval(() => {
        refreshBackendStatus();
    }, 30000);

    // Verificar cuando la ventana gana foco
    window.addEventListener('focus', () => {
        refreshBackendStatus();
    });

    // Permitir reintentar manualmente
    const retryBtn = document.getElementById('backendStatusRetryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            refreshBackendStatus();
        });
    }
}

export function createTopbar(page) {
    const pages = {
        importpdf: {
            title: 'Extract de PDF',
            subtitle: 'Extract visual por página, solo lectura y preview JSON reutilizando el flujo PDF actual.',
            active: 'EXTRACT'
        },
        pdf: {
            title: 'Panel de revisión visual',
            subtitle: 'Flujo rápido para filtrar, validar y revisar artículos con contexto de esquemas y posición, todo en la misma vista.',
            active: 'PDF'
        },
        analisis: {
            title: 'Analista de registro 02',
            subtitle: 'De registro_raw a registro_ok o registro_ko, proceso por proceso.',
            active: 'ANALISIS'
        },
        recompute: {
            title: 'Recompute MILU Simple',
            subtitle: 'Recálculo por libro o global con endpoints oficiales y log de ejecución.',
            active: 'RECOMPUTE'
        },
        imagenes: {
            title: 'QA Imagenes y Esquemas',
            subtitle: 'Auditoria visual de exportacion multimedia.',
            active: 'IMAGENES'
        },
        exportwp: {
            title: 'Exportacion WordPress',
            subtitle: 'Revision y exportacion para publicacion web.',
            active: 'EXPORT'
        }
    };

    if (ENABLE_EXPORT_VIEW) {
        pages.export = {
            title: 'Lista agrupada por PN',
            subtitle: 'Visualización de registros agrupados, estado de entidad y resumen rápido.',
            active: 'EXPORT'
        };
    }

    const pageConfig = pages[page] || pages.pdf;

    const topbar = document.createElement('header');
    topbar.className = 'a2-topbar';
    topbar.innerHTML = `
        <div class="a2-brand">
            <span class="a2-chip a2-chip--alentio" aria-label="Alentio">
                <svg viewBox="0 0 280 112" role="img" aria-hidden="true" focusable="false">
                    <defs>
                        <linearGradient id="alentioGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#ff8a00" />
                            <stop offset="100%" stop-color="#f97316" />
                        </linearGradient>
                    </defs>
                    <path d="M0 0 H260 L280 20 V112 H0 Z" fill="url(#alentioGrad)" />
                    <text x="14" y="78" fill="#ffffff" font-family="Manrope, Arial, sans-serif" font-size="60" font-weight="800" letter-spacing="0.5">ALENTIO</text>
                </svg>
            </span>
            <div class="a2-brand-text">
                <p class="a2-title">${pageConfig.title}</p>
                <p class="a2-sub">${pageConfig.subtitle}</p>
            </div>
        </div>
        <nav class="a2-nav" aria-label="Navegacion">
            <a href="${getNavTargetHref('importpdf')}" data-page="importpdf" class="${pageConfig.active === 'EXTRACT' ? 'active' : ''}">EXTRACT</a>
            <a href="${getNavTargetHref('pdf')}" data-page="pdf" class="${pageConfig.active === 'PDF' ? 'active' : ''}">PDF</a>
            <a href="${getNavTargetHref('analisis')}" data-page="analisis" class="${pageConfig.active === 'ANALISIS' ? 'active' : ''}">ANALISIS</a>
            <a href="${appUrl('/recompute_simple.html')}" data-page="recompute" class="${pageConfig.active === 'RECOMPUTE' ? 'active' : ''}">RECOMPUTE</a>
            <a href="${getNavTargetHref('imagenes')}" data-page="imagenes" class="${pageConfig.active === 'IMAGENES' ? 'active' : ''}">IMAGENES</a>
            <a href="${getNavTargetHref('exportwp')}" data-page="exportwp" class="${pageConfig.active === 'EXPORT' ? 'active' : ''}">EXPORT</a>
            ${ENABLE_EXPORT_VIEW ? `<a href="${getNavTargetHref('export')}" data-page="export" class="${pageConfig.active === 'EXPORT' ? 'active' : ''}">EXPORT</a>` : ''}
        </nav>
        <div class="backend-status-wrap">
            <div id="backendStatus" class="backend-status checking" aria-live="polite" title="Estado del backend de guardado">
                <span class="backend-status-dot" aria-hidden="true"></span>
                <span id="backendStatusText">Backend: comprobando...</span>
                <button id="backendStatusRetryBtn" type="button">Reintentar</button>
            </div>
            <span id="appVersion" class="a2-version a2-version--backend" title="Versión de la aplicación"></span>
        </div>
    `;

    return topbar;
}

export function initTopbar(page) {
    if (isEmbeddedMode()) {
        return null;
    }

    const body = document.querySelector('body');
    if (!body) return;

    // Eliminar header anterior si existe
    const oldHeader = document.querySelector('header.a2-topbar');
    if (oldHeader) {
        oldHeader.remove();
    }

    // Insertar nuevo header al principio del body
    const newHeader = createTopbar(page);
    body.insertBefore(newHeader, body.firstChild);

    // Inicializar monitor de estado del backend
    initBackendStatusMonitor();
    primeNavigationPrefetch();

    // Mostrar version siempre desde version.json para mantener el mismo flujo en local y produccion.
    const staticVersionUrl = new URL('version.json', new URL('.', window.location.href)).href;

    fetch(staticVersionUrl)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const el = document.getElementById('appVersion');
            if (el && data?.version) el.textContent = `v${data.version}`;
        })
        .catch(() => { });

    return newHeader;
}
