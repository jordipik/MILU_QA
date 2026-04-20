/**
 * Helper para aplicar revisiones en bulk a registros con igual part number.
 * Se expone en window.qaRevisionBulk para acceso desde consola o botones.
 */

import { state } from './state.js';
import { applyRevisionToMatchingPartNumbers } from './revision.js';

export const qaRevisionBulk = {
    /**
     * Aplica el estado "revisado" del registro seleccionado a todos sus
     * hermanos (mismo part number) que estén en estado "copia".
     * Se invoca desde botón o consola.
     */
    async applySelectedToMatches() {
        try {
            // Obtener fila seleccionada por su índice en allData
            const selectedKey = state.selectedRevisionRowKey;
            if (!selectedKey) {
                alert('Por favor selecciona un registro de la tabla primero.');
                return;
            }

            // Buscar la fila en allData
            const selectedRow = state.allData.find(row => {
                const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
                const id = String(row?.ID ?? '').trim();
                // El selectedKey puede ser en formato "idx=N" o contener PN e ID
                return selectedKey.includes(pn) || selectedKey.includes(id);
            });

            if (!selectedRow) {
                alert('No se encontró el registro seleccionado en los datos.');
                return;
            }

            // Ejecutar la operación
            const result = await applyRevisionToMatchingPartNumbers(selectedRow);

            if (!result.success && result.errors?.length > 0) {
                console.warn('Hubo errores durante la actualización:', result.errors);
            }

            alert(result.message);
            console.log('Resultado de la operación:', result);

            // Re-render tabla si es necesario (disparar evento personalizado)
            document.dispatchEvent(new CustomEvent('qa:revision-bulk-applied', {
                detail: result
            }));

        } catch (error) {
            console.error('Error en applySelectedToMatches:', error);
            alert(`Error: ${error.message}`);
        }
    },

    /**
     * Aplica a un registro específico sin requerir selección en tabla.
     * Útil para llamadas programáticas.
     */
    async applyByPartNumber(partNumber, targetEstado = 'revisado', targetAccion = '') {
        try {
            const targetRows = state.allData.filter(row => {
                const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
                const estado = String(row?.qa_revision_estado || '').trim().toLowerCase();
                return pn === partNumber && estado === 'copia';
            });

            if (targetRows.length === 0) {
                const msg = `No hay registros con Part Number "${partNumber}" en estado "Copia".`;
                console.log(msg);
                return { success: true, message: msg, updated: 0, targetPn: partNumber };
            }

            // Aplicar cambios sin usar persistencia async (solo estado local)
            for (const row of targetRows) {
                row.qa_revision_estado = targetEstado;
                if (targetAccion) {
                    row.qa_revision_accion = targetAccion;
                }
                row.qa_revision_updated_at = new Date().toISOString();
            }

            const msg = `Se actualizaron ${targetRows.length} registros con Part Number "${partNumber}".`;
            console.log(msg);
            return { success: true, message: msg, updated: targetRows.length, targetPn: partNumber };

        } catch (error) {
            console.error('Error en applyByPartNumber:', error);
            throw error;
        }
    },

    /**
     * Muestra información del registro seleccionado (para debugging)
     */
    showSelectedInfo() {
        const selectedKey = state.selectedRevisionRowKey;
        if (!selectedKey) {
            console.log('No hay registro seleccionado.');
            return;
        }
        console.log('Clave seleccionada:', selectedKey);
        const selected = state.allData.find(row => {
            const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
            const id = String(row?.ID ?? '').trim();
            return selectedKey.includes(pn) || selectedKey.includes(id);
        });
        if (selected) {
            console.log('Registro seleccionado:', {
                id: selected.ID,
                pn: selected['PART NO.'] || selected.pn,
                estado: selected.qa_revision_estado,
                accion: selected.qa_revision_accion
            });
        } else {
            console.log('Registro seleccionado no encontrado en datos.');
        }
    }
};

// Exponer globalmente para consola del navegador
window.qaRevisionBulk = qaRevisionBulk;

export default qaRevisionBulk;
