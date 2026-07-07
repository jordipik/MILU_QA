/**
 * Panel de debug para detección de cabecera PDF
 * Inicializa y gestiona la visualización de logs de detección de cabecera
 */

export function initHeaderDetectionDebugPanel() {
    const panel = document.getElementById('headerDetectionDebugPanel');
    const logContent = document.getElementById('headerDetectionDebugLog');
    const clearBtn = document.getElementById('headerDetectionDebugClear');
    const exportBtn = document.getElementById('headerDetectionDebugExport');
    const toggleBtn = document.getElementById('headerDetectionDebugToggle');
    const panelContent = document.getElementById('headerDetectionDebugContent');

    if (!panel || !logContent) return;

    // Mostrar el panel
    panel.removeAttribute('hidden');

    // Botón de limpiar logs
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            logContent.innerHTML = '<p style="color: #999; padding: 8px;">Logs limpiados. Realiza un análisis para ver nuevos datos.</p>';
            if (window.clearHeaderDetectionDebug) {
                window.clearHeaderDetectionDebug();
            }
        });
    }

    // Botón de exportar JSON
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const logs = window.getHeaderDetectionDebug ? window.getHeaderDetectionDebug() : [];
            const json = JSON.stringify(logs, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `header-detection-debug-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // Botón de minimizar/expandir
    if (toggleBtn) {
        let isMinimized = false;
        toggleBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;
            if (panelContent) {
                panelContent.style.display = isMinimized ? 'none' : 'flex';
                toggleBtn.textContent = isMinimized ? '+' : '−';
            }
        });
    }

    // Función global para actualizar el panel
    window.updateHeaderDetectionDebugPanel = function () {
        if (!window.getHeaderDetectionDebug) {
            logContent.innerHTML = '<p style="color: #999; padding: 8px;">ERROR: getHeaderDetectionDebug no disponible</p>';
            return;
        }

        const logs = window.getHeaderDetectionDebug();

        if (!logs || logs.length === 0) {
            logContent.innerHTML = '<p style="color: #999; padding: 8px;">Sin logs aún. Realiza un análisis...</p>';
            return;
        }

        try {
            const html = logs.map((log, idx) => {
                try {
                    const stage = String(log.stage || 'unknown').replace(/:/g, ': ');
                    const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '?';

                    let dataStr = '';
                    if (typeof log.data === 'object') {
                        try {
                            dataStr = JSON.stringify(log.data, null, 2);
                            if (dataStr.length > 800) {
                                dataStr = dataStr.substring(0, 800) + '\n...';
                            }
                        } catch (e) {
                            dataStr = '[Error serializando: ' + e.message + ']';
                        }
                    } else {
                        dataStr = String(log.data || '');
                    }

                    return `
                        <div class="header-debug-log-entry">
                            <div class="header-debug-log-stage">[${time}] ${escapeHtml(stage)}</div>
                            <div class="header-debug-log-data"><code>${escapeHtml(dataStr)}</code></div>
                        </div>
                    `;
                } catch (e) {
                    return `<div class="header-debug-log-entry" style="color: red;">Error procesando log #${idx}: ${escapeHtml(e.message)}</div>`;
                }
            }).reverse().slice(0, 20).join('');

            logContent.innerHTML = html;
            logContent.scrollTop = 0;
        } catch (e) {
            logContent.innerHTML = '<p style="color: red; padding: 8px;">ERROR: ' + escapeHtml(e.message) + '</p>';
        }
    };

    // Inicial empty
    logContent.innerHTML = `
        <p style="color: #999; padding: 8px;">Esperando actividad...</p>
        <p style="font-size: 10px; color: #bbb; padding: 0 8px 8px 8px;">
            window.updateHeaderDetectionDebugPanel: ${typeof window.updateHeaderDetectionDebugPanel}<br/>
            window.getHeaderDetectionDebug: ${typeof window.getHeaderDetectionDebug}<br/>
            window.clearHeaderDetectionDebug: ${typeof window.clearHeaderDetectionDebug}
        </p>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, (char) => map[char]);
}
