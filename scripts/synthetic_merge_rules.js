// MILU — reglas de fusión inteligente Synthetic
// Fase 2-6: jerarquía de fuentes, normalización, conflictos reales y consistencia.

function safeText(value) {
    return String(value == null ? '' : value);
}

function trimText(value) {
    return safeText(value).trim();
}

function collapseSpaces(value) {
    return trimText(value).replace(/\s+/g, ' ');
}

// Normalización canónica para comparar strings (tolerante a OCR/espacios/casing).
function normCanon(value) {
    return collapseSpaces(value)
        .toUpperCase()
        // Espacios alrededor de X en medidas: "M6 X 12" -> "M6X12"
        .replace(/\s*X\s*/g, 'X')
        // Espacios alrededor de signos comunes en medidas
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s*-\s*/g, '-');
}

// Normalización compacta: sin espacios internos (tolerante a OCR que parte palabras).
function normCompact(value) {
    return normCanon(value).replace(/\s+/g, '');
}

function key(value) {
    return collapseSpaces(value).toLowerCase();
}

function uniqueNonEmpty(values) {
    return [...new Set((values || []).map((v) => trimText(v)).filter(Boolean))];
}

// Cuenta valores no vacíos por valor canónico, fusionando entradas cuando
// una es substring (compacta) de otra: tolera truncamientos OCR y particiones de palabras.
function countByCanon(values) {
    const initial = new Map(); // compact -> { count, best, canon }
    for (const raw of values) {
        const txt = collapseSpaces(raw);
        if (!txt) continue;
        const canon = normCanon(txt);
        const compact = normCompact(txt);
        if (!compact) continue;
        const existing = initial.get(compact);
        if (!existing) {
            initial.set(compact, { count: 1, best: txt, canon, compact });
        } else {
            existing.count += 1;
            if (txt.length > existing.best.length) {
                existing.best = txt;
                existing.canon = canon;
            }
        }
    }

    // Fusionar entradas donde un compact es substring de otro (más largo gana).
    const compacts = [...initial.keys()].sort((a, b) => b.length - a.length);
    const merged = new Map();
    const consumed = new Set();
    for (const longCompact of compacts) {
        if (consumed.has(longCompact)) continue;
        const longEntry = initial.get(longCompact);
        let totalCount = longEntry.count;
        let bestText = longEntry.best;
        let bestLen = longEntry.best.length;
        for (const shortCompact of compacts) {
            if (shortCompact === longCompact) continue;
            if (consumed.has(shortCompact)) continue;
            if (longCompact.includes(shortCompact)) {
                const shortEntry = initial.get(shortCompact);
                totalCount += shortEntry.count;
                if (shortEntry.best.length > bestLen) {
                    bestText = shortEntry.best;
                    bestLen = shortEntry.best.length;
                }
                consumed.add(shortCompact);
            }
        }
        consumed.add(longCompact);
        merged.set(longCompact, { count: totalCount, best: bestText, canon: normCanon(bestText) });
    }
    return merged;
}

// Detecta truncamiento: tras fusionar por inclusión, ¿queda solo un grupo?
function isLikelyTruncation(values) {
    const merged = countByCanon(values);
    return merged.size <= 1;
}

// Selección por jerarquía: lista de candidatos en orden de prioridad. Devuelve el primero no vacío.
function pickHierarchical(candidates) {
    for (const candidate of candidates) {
        const txt = collapseSpaces(candidate);
        if (txt) return txt;
    }
    return '';
}

// Valor dominante por frecuencia (con fusión por inclusión). Devuelve la versión más informativa.
function pickDominant(values) {
    const counts = countByCanon(values);
    if (!counts.size) return { value: '', canon: '', confidence: 0, agreement: 0, total: 0, distinct: 0 };
    let total = 0;
    for (const entry of counts.values()) total += entry.count;
    let bestEntry = null;
    let bestKey = '';
    for (const [keyCompact, entry] of counts.entries()) {
        if (!bestEntry
            || entry.count > bestEntry.count
            || (entry.count === bestEntry.count && entry.best.length > bestEntry.best.length)) {
            bestEntry = entry;
            bestKey = keyCompact;
        }
    }
    const agreement = total > 0 ? bestEntry.count / total : 0;
    return {
        value: bestEntry.best,
        canon: bestEntry.canon || bestKey,
        confidence: agreement,
        agreement,
        total,
        distinct: counts.size
    };
}

// Resolución mejorada para campos texto: jerarquía + dominante + tolerancia a truncamiento.
function resolveTextField(rawValuesByTier, allOccurrences) {
    // rawValuesByTier: array de arrays por nivel jerárquico (más prioritario primero).
    // allOccurrences: array de strings ya provenientes de los registros fuente.

    // Primero, intentar resolver dentro del tier más prioritario que tenga al menos un valor.
    for (const tierValues of rawValuesByTier) {
        const dominant = pickDominant(tierValues);
        if (dominant.value) {
            const occurrencesDominant = pickDominant(allOccurrences);
            const sameAsOccurrenceDominant = occurrencesDominant.canon
                && occurrencesDominant.canon === dominant.canon;
            const truncationLikely = isLikelyTruncation(uniqueNonEmpty(allOccurrences));
            const agreement = occurrencesDominant.agreement;
            const conflictReal = !truncationLikely && occurrencesDominant.distinct > 1;
            return {
                value: dominant.value,
                source_tier: rawValuesByTier.indexOf(tierValues) + 1,
                agreement,
                distinct_values: occurrencesDominant.distinct,
                truncation_likely: truncationLikely,
                conflict_real: conflictReal,
                same_as_occurrence_dominant: !!sameAsOccurrenceDominant
            };
        }
    }

    // Si ningún tier tiene valor, usar dominante global.
    const fallback = pickDominant(allOccurrences);
    return {
        value: fallback.value,
        source_tier: 0,
        agreement: fallback.agreement,
        distinct_values: fallback.distinct,
        truncation_likely: isLikelyTruncation(uniqueNonEmpty(allOccurrences)),
        conflict_real: fallback.distinct > 1 && !isLikelyTruncation(uniqueNonEmpty(allOccurrences)),
        same_as_occurrence_dominant: true
    };
}

// Heurística de PN sospechoso por ruido OCR.
function isSuspiciousPn(pn) {
    const txt = trimText(pn);
    if (!txt) return true;
    if (txt.length < 4 || txt.length > 40) return true;
    if (/[!@#$%^&*?]/.test(txt)) return true;
    if (/\s{2,}/.test(txt)) return true;
    // PN solo letras o solo símbolos.
    if (!/[0-9]/.test(txt) && !/^[A-Z0-9.\-_/]+$/i.test(txt)) return true;
    return false;
}

// Calcula score de consistencia agregado para un PN.
function computeConsistencyMetrics(fieldResolutions) {
    const fields = Object.values(fieldResolutions);
    if (!fields.length) {
        return {
            consistency_score: 0,
            field_agreement_ratio: 0,
            conflict_severity: 'unknown',
            real_conflict_fields: [],
            truncation_only_fields: []
        };
    }

    const realConflictFields = [];
    const truncationOnlyFields = [];
    let agreementSum = 0;
    let agreementCount = 0;

    for (const [name, info] of Object.entries(fieldResolutions)) {
        if (info.distinct_values >= 1) {
            agreementSum += info.agreement;
            agreementCount += 1;
        }
        if (info.conflict_real) realConflictFields.push(name);
        if (!info.conflict_real && info.distinct_values > 1 && info.truncation_likely) {
            truncationOnlyFields.push(name);
        }
    }

    const fieldAgreementRatio = agreementCount > 0 ? agreementSum / agreementCount : 0;
    const realConflictPenalty = Math.min(0.6, realConflictFields.length * 0.2);
    const consistencyScore = Math.max(0, Math.min(1, fieldAgreementRatio - realConflictPenalty));

    let conflictSeverity = 'none';
    if (realConflictFields.length >= 2) conflictSeverity = 'high';
    else if (realConflictFields.length === 1) conflictSeverity = 'medium';
    else if (truncationOnlyFields.length > 0) conflictSeverity = 'low';

    return {
        consistency_score: Number(consistencyScore.toFixed(3)),
        field_agreement_ratio: Number(fieldAgreementRatio.toFixed(3)),
        conflict_severity: conflictSeverity,
        real_conflict_fields: realConflictFields,
        truncation_only_fields: truncationOnlyFields
    };
}

// Decisión preliminar pn-level basada en métricas + jerarquía superseded.
function computeMergeDecision({
    pn,
    consistency,
    hasDesignation,
    hasMeasure,
    hasSupersededSignal,
    hasClearSupersededRelation,
    qaActions,
    qaStates
}) {
    const reasons = [];

    if (isSuspiciousPn(pn)) {
        reasons.push('pn_sospechoso_ocr');
        return { decision: 'discard', reasons };
    }
    if (!hasDesignation) {
        reasons.push('designation_ausente');
        return { decision: 'discard', reasons };
    }

    if (qaActions.includes('eliminar') || qaActions.includes('descartar')) {
        reasons.push('qa_marcado_eliminar');
        return { decision: 'discard', reasons };
    }

    if (consistency.conflict_severity === 'high') {
        reasons.push('conflictos_reales_multiples');
        return { decision: 'pending_review', reasons };
    }

    if (qaActions.includes('revisar') || qaStates.includes('pendiente')) {
        reasons.push('qa_revision_manual_marcada');
        return { decision: 'pending_review', reasons };
    }

    if (consistency.conflict_severity === 'medium') {
        reasons.push('conflicto_real_menor');
        return { decision: 'importable_with_warning', reasons };
    }

    if (hasSupersededSignal) {
        if (hasClearSupersededRelation) {
            reasons.push('superseded_con_relacion_clara');
            return { decision: 'import_superseded', reasons };
        }
        reasons.push('superseded_sin_relacion_clara');
        return { decision: 'pending_review', reasons };
    }

    if (consistency.conflict_severity === 'low') {
        reasons.push('truncamiento_ocr_resuelto');
        return { decision: 'importable_with_warning', reasons };
    }

    reasons.push('consistente');
    if (!hasMeasure) reasons.push('measure_vacio_warning');
    return { decision: hasMeasure ? 'import_new' : 'importable_with_warning', reasons };
}

module.exports = {
    safeText,
    trimText,
    collapseSpaces,
    normCanon,
    key,
    uniqueNonEmpty,
    countByCanon,
    isLikelyTruncation,
    pickHierarchical,
    pickDominant,
    resolveTextField,
    isSuspiciousPn,
    computeConsistencyMetrics,
    computeMergeDecision
};
