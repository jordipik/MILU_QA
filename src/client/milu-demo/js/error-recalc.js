// js/error-recalc.js
// ============================================================
// Módulo centralizado de recálculo de errores en memoria.
// No escribe en disco ni llama al backend.
// Solo evalúa registros y devuelve resultados.
//
// Funciones exportadas:
//   shouldRecalculateErrors(record, mode) – filtra qué registros recalcular
//   detectRecordErrors(record, context)   – evalúa un registro y devuelve errores
//   runInMemoryRecalculation(records, mode, context) – orquesta todo
//
// Para ampliar reglas: añadir una entrada al array ERROR_RULES.
// Cada regla sigue el esquema:
//   { code, field, severity, message, check(record, context) → boolean }
//   donde check devuelve true si el error está presente.
// ============================================================

import { normalizeEstadoToNew, normalizeAccionToNew } from './revision.js';

// ── Utilidad interna ─────────────────────────────────────────
function txt(value) {
    return String(value ?? '').trim();
}

// ── shouldRecalculateErrors ──────────────────────────────────

/**
 * Indica si un registro debe incluirse en el recálculo según el modo.
 *
 * Modo "all"     → siempre recalcular.
 * Modo "pending" → omitir solo los registros ya cerrados (ok + importar/eliminar).
 *
 * Criterio "pending": un registro se recalcula si:
 *   - qa_revision_estado está vacío, "pendiente" o "revisar"
 *   - o qa_revision_accion está vacío o "revisar"
 * Se omite si:
 *   - qa_revision_estado === "ok"  Y  qa_revision_accion === "importar" o "eliminar"
 *
 * @param {object} record
 * @param {'all'|'pending'} mode
 * @returns {boolean}
 */
export function shouldRecalculateErrors(record, mode) {
    if (mode === 'all') return true;
    // mode === 'pending'
    const estado = txt(record?.qa_revision_estado).toLowerCase();
    const accion = txt(record?.qa_revision_accion).toLowerCase();
    if (estado === 'ok' && (accion === 'importar' || accion === 'eliminar')) return false;
    return true;
}

// ── Reglas de detección de errores ──────────────────────────
//
// Para ampliar: añadir un objeto al array con la estructura:
//   {
//     code:     string  – identificador único de la regla
//     field:    string  – campo principal al que aplica
//     severity: 'error'|'warning'
//     message:  string  – descripción legible
//     check:    (record, context) => boolean  – true = hay error
//   }
//
// El parámetro context es opcional y puede incluir:
//   knownFns        – string[] con FN conocidas
//   exportCandidateIds – Set<string> de IDs en candidatos de exportación
// ────────────────────────────────────────────────────────────

export const ERROR_RULES = [

    // ── Campos obligatorios ──────────────────────────────────

    {
        // Regla 1: falta pn_final
        code: 'missing_pn',
        field: 'pn_final',
        severity: 'error',
        message: 'Falta PN final',
        check: (r) => {
            const pnFinal = txt(r?.pn_final);
            const pnLegacy = txt(r?.['PART NO.']);
            return pnFinal === '' && pnLegacy === '';
        }
    },

    {
        // Regla 2: falta designation_final
        code: 'missing_designation',
        field: 'designation_final',
        severity: 'error',
        message: 'Falta designation final',
        check: (r) => {
            // Solo aplica si el registro tiene PN (final o legado)
            const pn = txt(r?.pn_final) || txt(r?.['PART NO.']);
            if (pn === '') return false;
            const designationFinal = txt(r?.designation_final);
            const designationLegacy = txt(r?.DESIGNATION);
            return designationFinal === '' && designationLegacy === '';
        }
    },

    {
        // Regla 3: falta qty_final cuando corresponde
        code: 'missing_qty',
        field: 'qty_final',
        severity: 'warning',
        message: 'Falta QTY final en registro con artículo',
        check: (r) => {
            // Solo aplica si hay PN (final o legado)
            const pn = txt(r?.pn_final) || txt(r?.['PART NO.']);
            if (pn === '') return false;
            const qty = txt(r?.qty_final ?? r?.QTY);
            return qty === '' || qty === '0';
        }
    },

    {
        // Regla 4: falta measurement_final cuando hay referencia PDF o GESA
        code: 'missing_measurement',
        field: 'measurement_final',
        severity: 'warning',
        message: 'Falta measurement/measure final cuando hay valor en PDF o GESA',
        check: (r) => {
            const measureFinal = txt(r?.measure_final ?? r?.measurement_final);
            if (measureFinal !== '') return false; // ya tiene valor
            const pdfVal = txt(r?.measure_pdf ?? r?.['MEASUREMENT / STANDARD']);
            const gesaVal = txt(r?.dimensions_gesa ?? r?.measure_gesa);
            // Error solo si hay referencia pero falta el final
            return pdfVal !== '' || gesaVal !== '';
        }
    },

    // ── Formato sospechoso ───────────────────────────────────

    {
        // Regla 5: PN con formato sospechoso (espacios internos o carácter inicial extraño)
        code: 'suspicious_pn_format',
        field: 'pn_final',
        severity: 'warning',
        message: 'PN con formato sospechoso (espacios internos o carácter inicial inusual)',
        check: (r) => {
            const pn = txt(r?.pn_final) || txt(r?.['PART NO.']);
            if (!pn) return false;
            return /\s/.test(pn) || /^[^A-Za-z0-9]/.test(pn);
        }
    },

    {
        // Regla 6: PN y designation posiblemente pegados en el mismo campo
        code: 'pn_designation_merged',
        field: 'pn_final',
        severity: 'warning',
        message: 'PN y designation posiblemente fusionados en el mismo campo (PN muy largo con espacios)',
        check: (r) => {
            const pn = txt(r?.pn_final) || txt(r?.['PART NO.']);
            if (!pn) return false;
            // Sospechoso si el PN supera 40 chars y contiene espacios (podría ser PN + designation pegados)
            return pn.length > 40 && /\s/.test(pn);
        }
    },

    // ── FN ──────────────────────────────────────────────────

    {
        // Regla 7: FN no reconocida (requiere context.knownFns)
        code: 'unknown_fn',
        field: 'FN',
        severity: 'warning',
        message: 'FN no reconocida en el catálogo conocido',
        check: (r, ctx) => {
            const fn = txt(r?.FN ?? r?.fn ?? r?.fn_pdf);
            if (!fn) return false;
            if (!Array.isArray(ctx?.knownFns) || ctx.knownFns.length === 0) return false;
            return !ctx.knownFns.includes(fn);
        }
    },

    {
        // Regla 8: FN posiblemente fusionada con valor de measurement
        code: 'fn_merged_measurement',
        field: 'FN',
        severity: 'warning',
        message: 'FN posiblemente pegada con valor de measurement (FN larga con dígitos y letras)',
        check: (r) => {
            const fn = txt(r?.FN ?? r?.fn);
            if (!fn) return false;
            // Sospechoso si el FN tiene más de 10 chars, contiene dígitos y letras y espacios
            return fn.length > 10 && /\d/.test(fn) && /[A-Za-z]/.test(fn) && fn.includes(' ');
        }
    },

    // ── Imagen ──────────────────────────────────────────────

    {
        // Regla 9: sin imagen real o con placeholder sin_imagen
        code: 'no_real_image',
        field: 'exp_imagenes',
        severity: 'warning',
        message: 'Sin imagen real (campo vacío o placeholder sin_imagen)',
        check: (r) => {
            const img = txt(r?.exp_imagenes);
            return img === '' || img.includes('sin_imagen');
        }
    },

    // ── Estado / Acción ──────────────────────────────────────

    {
        // Regla 10: combinación incoherente de estado y acción
        code: 'estado_accion_incoherence',
        field: 'qa_revision_estado',
        severity: 'warning',
        message: 'Combinación incoherente: estado=ok con acción=revisar',
        check: (r) => {
            const estado = normalizeEstadoToNew(r?.qa_revision_estado);
            const accion = normalizeAccionToNew(r?.qa_revision_accion);
            // ok+revisar es incoherente
            return estado === 'ok' && accion === 'revisar';
        }
    },

    {
        // Regla 11: marcado como importar pero tiene errores críticos almacenados
        code: 'import_with_errors',
        field: 'qa_revision_accion',
        severity: 'error',
        message: 'Marcado como importar pero tiene errores críticos (total_error > 0)',
        check: (r) => {
            const accion = normalizeAccionToNew(r?.qa_revision_accion);
            if (accion !== 'importar') return false;
            const total = Number(r?.total_error);
            return Number.isFinite(total) && total > 0;
        }
    },

    {
        // Regla 12: marcado como eliminar pero aparece en candidatos de exportación
        // Requiere context.exportCandidateIds (Set<string>)
        code: 'eliminar_in_export_candidates',
        field: 'qa_revision_accion',
        severity: 'warning',
        message: 'Marcado como eliminar pero aparece en candidatos de exportación',
        check: (r, ctx) => {
            const accion = normalizeAccionToNew(r?.qa_revision_accion);
            if (accion !== 'eliminar') return false;
            if (!(ctx?.exportCandidateIds instanceof Set)) return false;
            return ctx.exportCandidateIds.has(txt(r?.ID));
        }
    }

];

// ── detectRecordErrors ───────────────────────────────────────

/**
 * Evalúa todos los ERROR_RULES sobre un registro y devuelve los errores detectados.
 *
 * @param {object} record – registro a evaluar
 * @param {object} [context] – contexto adicional (knownFns, exportCandidateIds, …)
 * @returns {{ hasErrors: boolean, errors: Array<{field, code, severity, message}> }}
 */
export function detectRecordErrors(record, context = {}) {
    const errors = [];

    for (const rule of ERROR_RULES) {
        let triggered = false;
        try {
            triggered = rule.check(record, context);
        } catch (_e) {
            // Defensivo: si una regla lanza, no interrumpir el resto
        }
        if (triggered) {
            errors.push({
                field: rule.field,
                code: rule.code,
                severity: rule.severity,
                message: rule.message
            });
        }
    }

    return { hasErrors: errors.length > 0, errors };
}

// ── runInMemoryRecalculation ─────────────────────────────────

/**
 * Orquesta el recálculo en memoria para una lista de registros.
 * NO modifica los JSON en disco ni llama al backend.
 *
 * @param {Array}  records – lista de registros a procesar
 * @param {'all'|'pending'} mode – modo de filtrado
 * @param {object} [context] – contexto adicional para las reglas
 * @returns {{
 *   mode: string,
 *   total: number,
 *   recalculated: number,
 *   skipped: number,
 *   errorCount: number,
 *   results: Array<{id, pn, hasErrors, errors}>,
 *   timestamp: string
 * }}
 */
export function runInMemoryRecalculation(records, mode, context = {}) {
    const total = Array.isArray(records) ? records.length : 0;
    let recalculated = 0;
    let skipped = 0;
    let errorCount = 0;
    const results = [];

    if (Array.isArray(records)) {
        for (const record of records) {
            if (!shouldRecalculateErrors(record, mode)) {
                skipped++;
                continue;
            }
            recalculated++;
            const detection = detectRecordErrors(record, context);
            if (detection.hasErrors) {
                errorCount++;
                results.push({
                    id: txt(record?.ID),
                    pn: txt(record?.pn_final),
                    hasErrors: true,
                    errors: detection.errors
                });
            }
        }
    }

    console.group('[MILU][ERROR-RECALC]');
    console.log('Modo:', mode);
    console.log('Total registros:', total);
    console.log('Registros recalculados:', recalculated);
    console.log('Registros saltados:', skipped);
    console.log('Errores detectados:', errorCount);
    console.groupEnd();

    return {
        mode,
        total,
        recalculated,
        skipped,
        errorCount,
        results,
        timestamp: new Date().toISOString()
    };
}
