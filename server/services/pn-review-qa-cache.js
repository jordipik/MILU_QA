/**
 * PN Review QA Cache Service
 * 
 * Encapsulates state and logic for building/maintaining the cached index of PN reviews
 * from engine JSON data. Handles fingerprinting to detect file changes and rebuilds
 * the cache (list + index) on demand.
 * 
 * Factory receives:
 * - repoRoot: directory root to resolve engine JSON files
 * - buildQaSummaryFromExport: function to build QA summary from rows
 * - decideByQa: function to decide PN decision (Export/Discard/Pending)
 * - engineJsonFiles: list of engine JSON file names
 * 
 * Public API:
 * - load() -> {list, index} - loads/rebuilds cache if needed
 * - invalidate() -> void - clears cache (forces rebuild on next load())
 * - getLoadedAt() -> string | null - returns ISO timestamp of last successful load
 */

const fs = require('fs');
const path = require('path');

function createPnReviewQaCacheService(options = {}) {
    const {
        repoRoot,
        buildQaSummaryFromExport,
        decideByQa,
        engineJsonFiles = []
    } = options;

    // Cache state
    const cache = {
        loadedAt: null,
        engineFingerprints: {},
        payload: null
    };

    // ===== Helper Functions =====

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function lowerKey(value) {
        return normalizeText(value).toLowerCase();
    }

    function collapseSpaces(value) {
        return normalizeText(value).replace(/\s+/g, ' ');
    }

    function splitCsvUnique(value) {
        const parts = normalizeText(value)
            .split(',')
            .map((part) => normalizeText(part))
            .filter(Boolean);
        return [...new Set(parts)];
    }

    function pnKey(value) {
        return lowerKey(value);
    }

    function uniq(values) {
        return [...new Set((values || []).filter(Boolean))];
    }

    function pickMostFrequent(values) {
        const counts = new Map();
        let bestKey = '';
        let bestValue = '';
        let bestCount = 0;

        for (const raw of values || []) {
            const value = collapseSpaces(raw);
            if (!value) continue;
            const key = lowerKey(value);
            const current = counts.get(key) || { count: 0, value };
            current.count += 1;
            if (value.length > current.value.length) current.value = value;
            counts.set(key, current);

            if (
                current.count > bestCount
                || (current.count === bestCount && current.value.length > bestValue.length)
            ) {
                bestCount = current.count;
                bestValue = current.value;
                bestKey = key;
            }
        }

        return bestKey ? bestValue : '';
    }

    function toNumber(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function getRowPn(row) {
        return normalizeText(row?.pn_final || row?.['PART NO.'] || row?.pn);
    }

    function getRowDesignation(row) {
        return pickMostFrequent([
            row?.designation_final,
            row?.designation_gesa,
            row?.designation_pdf,
            row?.DESIGNATION
        ]);
    }

    function getRowMeasure(row) {
        return pickMostFrequent([
            row?.measure_final,
            row?.measurement_final,
            row?.dimensions_gesa,
            row?.measure_pdf,
            row?.['MEASUREMENT / STANDARD']
        ]);
    }

    function getRowWeight(row) {
        return pickMostFrequent([
            row?.weight_final,
            row?.weight_gesa,
            row?.weight_pdf,
            row?.WEIGHT
        ]);
    }

    function parseImagesFromValue(value) {
        if (Array.isArray(value)) {
            return uniq(value.map((item) => normalizeText(item)).filter(Boolean));
        }

        const text = normalizeText(value);
        if (!text) return [];

        return uniq(text
            .split(/[\n,;|]/)
            .map((part) => normalizeText(part))
            .filter(Boolean));
    }

    function rowHasAnySust(row) {
        return Boolean(
            normalizeText(row?.sust_status)
            || normalizeText(row?.sust_hierarchie)
            || normalizeText(row?.sust_new_part_number)
            || normalizeText(row?.sust_superseded_list)
        );
    }

    function uniqueValues(rows, picker) {
        return uniq((rows || [])
            .map((row) => collapseSpaces(picker(row)))
            .filter(Boolean)
        );
    }

    function uniqueNormalizedValues(rows, picker) {
        return uniq((rows || [])
            .map((row) => lowerKey(collapseSpaces(picker(row))))
            .filter(Boolean)
        );
    }

    function normalizeQaSummary(qaSummary) {
        return {
            total_rows: toNumber(qaSummary?.total_rows, 0),
            ok_importar: toNumber(qaSummary?.count_ok_importar, 0),
            ok_eliminar: toNumber(qaSummary?.count_ok_eliminar, 0),
            pendiente: toNumber(qaSummary?.count_pending, 0),
            revisar: toNumber(qaSummary?.count_review_action, 0),
            otros: toNumber(qaSummary?.count_other, 0)
        };
    }

    function buildMergedFields(rows) {
        const designationFinal = pickMostFrequent(rows.map(getRowDesignation));
        const measureFinal = pickMostFrequent(rows.map(getRowMeasure));
        const weightFinal = pickMostFrequent(rows.map(getRowWeight));
        const sustNewPartNumber = pickMostFrequent(rows.map((row) => row?.sust_new_part_number));
        const sustSupersededList = pickMostFrequent(rows.map((row) => row?.sust_superseded_list));
        const categories = uniq(rows.map((row) => normalizeText(row?.categoria)).filter(Boolean));
        const tags = uniq(rows.flatMap((row) => splitCsvUnique(row?.tags)).filter(Boolean));
        const images = uniq(rows.flatMap((row) => parseImagesFromValue(row?.exp_imagenes)));

        return {
            designation_final: designationFinal,
            measure_final: measureFinal,
            weight_final: weightFinal,
            images,
            sust_new_part_number: sustNewPartNumber,
            sust_superseded_list: sustSupersededList,
            categories,
            tags
        };
    }

    function buildPnValidation(sku, rows, mergedFields) {
        const distinctDesignation = uniqueNormalizedValues(rows, getRowDesignation);
        const distinctMeasure = uniqueNormalizedValues(rows, getRowMeasure);
        const distinctWeight = uniqueNormalizedValues(rows, getRowWeight);
        const distinctSustNew = uniqueNormalizedValues(rows, (row) => row?.sust_new_part_number);
        const conflictCodes = [];

        if (distinctDesignation.length > 1) conflictCodes.push('designation_conflict');
        if (distinctWeight.length > 1) conflictCodes.push('weight_conflict');
        if (distinctMeasure.length > 1) conflictCodes.push('measure_conflict');
        if (distinctSustNew.length > 1) conflictCodes.push('sust_new_part_number_conflict');

        return {
            has_pn: Boolean(normalizeText(sku)),
            has_designation: Boolean(normalizeText(mergedFields?.designation_final)),
            has_image: Array.isArray(mergedFields?.images) && mergedFields.images.length > 0,
            has_measure: Boolean(normalizeText(mergedFields?.measure_final)),
            has_weight: Boolean(normalizeText(mergedFields?.weight_final)),
            has_sust: rows.some((row) => rowHasAnySust(row)),
            has_conflicts: conflictCodes.length > 0,
            conflict_codes: conflictCodes
        };
    }

    function buildMappedSourceRow(row) {
        return {
            ID: normalizeText(row?.ID),
            engine_model: normalizeText(row?.engine_model || row?.model || row?.engine),
            source_file: normalizeText(row?.__engine_file || row?.source_file),
            'Source Page': normalizeText(row?.['Source Page']),
            POS: normalizeText(row?.POS || row?.pos_final),
            'PART NO.': normalizeText(row?.['PART NO.']),
            pn_final: normalizeText(row?.pn_final),
            DESIGNATION: normalizeText(row?.DESIGNATION),
            designation_final: getRowDesignation(row),
            designation_gesa: normalizeText(row?.designation_gesa),
            designation_pdf: normalizeText(row?.designation_pdf),
            measure_final: getRowMeasure(row),
            dimensions_gesa: normalizeText(row?.dimensions_gesa),
            measure_pdf: normalizeText(row?.measure_pdf),
            weight_final: getRowWeight(row),
            weight_gesa: normalizeText(row?.weight_gesa),
            weight_pdf: normalizeText(row?.weight_pdf),
            sust_status: normalizeText(row?.sust_status),
            sust_hierarchie: normalizeText(row?.sust_hierarchie),
            sust_new_part_number: normalizeText(row?.sust_new_part_number),
            sust_superseded_list: normalizeText(row?.sust_superseded_list),
            qa_revision_estado: normalizeText(row?.qa_revision_estado),
            qa_revision_accion: normalizeText(row?.qa_revision_accion),
            exp_imagenes: normalizeText(row?.exp_imagenes)
        };
    }

    function buildSustSummary(rows) {
        return {
            statuses: uniqueValues(rows, (row) => row?.sust_status),
            hierarchies: uniqueValues(rows, (row) => row?.sust_hierarchie),
            new_part_numbers: uniqueValues(rows, (row) => row?.sust_new_part_number),
            superseded_lists: uniqueValues(rows, (row) => row?.sust_superseded_list)
        };
    }

    function buildConflictSummary(rows, validation) {
        return {
            has_conflicts: Boolean(validation?.has_conflicts),
            conflict_codes: Array.isArray(validation?.conflict_codes) ? validation.conflict_codes : [],
            distinct_values: {
                designation_final: uniqueValues(rows, getRowDesignation),
                measure_final: uniqueValues(rows, getRowMeasure),
                weight_final: uniqueValues(rows, getRowWeight),
                sust_new_part_number: uniqueValues(rows, (row) => row?.sust_new_part_number)
            }
        };
    }

    function readJsonFileSafe(filePath, fallback = null) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (_) {
            return fallback;
        }
    }

    function getFileFingerprint(filePath) {
        try {
            const stat = fs.statSync(filePath);
            return { mtimeMs: stat.mtimeMs, size: stat.size };
        } catch (_) {
            return null;
        }
    }

    function fingerprintsEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.mtimeMs === b.mtimeMs && a.size === b.size;
    }

    function getEngineFingerprints() {
        const fingerprints = {};
        for (const file of engineJsonFiles) {
            fingerprints[file] = getFileFingerprint(path.join(repoRoot, file));
        }
        return fingerprints;
    }

    function fingerprintsByFileEqual(a, b) {
        const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const key of keys) {
            if (!fingerprintsEqual(a?.[key], b?.[key])) return false;
        }
        return true;
    }

    // ===== Public API =====

    function load() {
        const fingerprints = getEngineFingerprints();
        const upToDate = cache.payload && fingerprintsByFileEqual(cache.engineFingerprints, fingerprints);

        if (upToDate) {
            return cache.payload;
        }

        const index = new Map();
        const list = [];

        for (const file of engineJsonFiles) {
            const filePath = path.join(repoRoot, file);
            const rows = readJsonFileSafe(filePath, []);
            if (!Array.isArray(rows)) continue;

            const engineModel = String(file).replace(/^engine_/, '').replace(/\.json$/i, '');
            for (const row of rows) {
                const sku = getRowPn(row);
                if (!sku) continue;
                const key = pnKey(sku);
                if (!index.has(key)) {
                    index.set(key, { sku, rows: [] });
                }
                index.get(key).rows.push({ ...row, __engine_file: file, __engine_model: engineModel });
            }
        }

        for (const group of index.values()) {
            const rows = group.rows;
            const qaSummaryRaw = buildQaSummaryFromExport(rows);
            const qaSummary = normalizeQaSummary(qaSummaryRaw);
            const decisionMeta = decideByQa(rows, qaSummaryRaw);
            const mergedFields = buildMergedFields(rows);
            const validation = buildPnValidation(group.sku, rows, mergedFields);
            const engineModels = uniq(rows.map((row) => normalizeText(row?.__engine_model || row?.engine_model || row?.model || row?.engine)).filter(Boolean));
            const sourcePages = uniq(rows.map((row) => normalizeText(row?.['Source Page'])).filter(Boolean));
            const sourceRows = rows.map((row) => buildMappedSourceRow(row));

            const detail = {
                sku: group.sku,
                decision: decisionMeta.decision,
                reason: decisionMeta.reason,
                export_row: {
                    sku: group.sku,
                    designation_final: mergedFields.designation_final,
                    measure_final: mergedFields.measure_final,
                    weight_final: mergedFields.weight_final,
                    decision: decisionMeta.decision,
                    reason: decisionMeta.reason,
                    occurrences: rows.length,
                    engine_models: engineModels
                },
                qa_summary: qaSummary,
                validation,
                merged_fields: mergedFields,
                source_rows_preview: sourceRows.slice(0, 120),
                source_row_ids: uniq(sourceRows.map((row) => row.ID).filter(Boolean)),
                engine_models_all: engineModels,
                source_pages_all: sourcePages,
                images_all: mergedFields.images,
                sust_summary: buildSustSummary(rows),
                conflict_summary: buildConflictSummary(rows, validation),
                source_rows_all: sourceRows
            };

            list.push({
                sku: group.sku,
                decision: decisionMeta.decision,
                reason: decisionMeta.reason,
                designation_final: mergedFields.designation_final,
                measure_final: mergedFields.measure_final,
                weight_final: mergedFields.weight_final,
                occurrences: rows.length,
                engine_models: engineModels,
                source_pages_count: sourcePages.length,
                images_count: mergedFields.images.length,
                qa_summary: qaSummary,
                validation
            });

            index.set(pnKey(group.sku), detail);
        }

        list.sort((a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true, sensitivity: 'base' }));

        cache.engineFingerprints = fingerprints;
        cache.loadedAt = new Date().toISOString();
        cache.payload = { list, index };
        return cache.payload;
    }

    function invalidate() {
        cache.loadedAt = null;
        cache.engineFingerprints = {};
        cache.payload = null;
    }

    function getLoadedAt() {
        return cache.loadedAt;
    }

    return {
        load,
        invalidate,
        getLoadedAt
    };
}

module.exports = {
    createPnReviewQaCacheService
};
