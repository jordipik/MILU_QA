const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SYNTH_NEW = path.join(REPO_ROOT, 'data', 'output', 'export_review', 'synthetic_new_compacted.json');
const SYNTH_SUP = path.join(REPO_ROOT, 'data', 'output', 'export_review', 'synthetic_superseded_compacted.json');

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normCanon(value) {
    return String(value == null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function analyze(rows, label) {
    let totalPns = rows.length;
    let pnInvalid = 0;
    let pnEmpty = 0;
    let designationVariants = 0;
    let measureVariants = 0;
    let weightVariants = 0;
    let sustNewVariants = 0;
    let designationSpaceOnly = 0;
    let measureSpaceOnly = 0;
    let multiSourceMultipleEngine = 0;
    let bigConflictExamples = [];

    for (const row of rows) {
        const pn = String(row.pn || '').trim();
        if (!pn) { pnEmpty += 1; continue; }
        // PN anómalo (probablemente OCR ruidoso)
        if (/[ ]{2,}|[!@#$%^&*?]/.test(pn) || pn.length < 4 || pn.length > 40) {
            pnInvalid += 1;
        }

        const sources = Array.isArray(row.source_records) ? row.source_records : [];
        if (sources.length < 2) continue;

        const desigSet = new Set(sources.map((s) => String(s.designation_final || '').trim()).filter(Boolean));
        const desigCanon = new Set([...desigSet].map(normCanon));
        if (desigSet.size > 1) designationVariants += 1;
        if (desigSet.size > 1 && desigCanon.size === 1) designationSpaceOnly += 1;

        const measureSet = new Set(sources.map((s) => String(s.measure_final || '').trim()).filter(Boolean));
        const measureCanon = new Set([...measureSet].map(normCanon));
        if (measureSet.size > 1) measureVariants += 1;
        if (measureSet.size > 1 && measureCanon.size === 1) measureSpaceOnly += 1;

        const weightSet = new Set(sources.map((s) => String(s.weight_final || '').trim()).filter(Boolean));
        if (weightSet.size > 1) weightVariants += 1;

        const engines = new Set(sources.map((s) => String(s.engine_model || '').trim()).filter(Boolean));
        if (engines.size > 1) multiSourceMultipleEngine += 1;

        if (desigSet.size > 2 && bigConflictExamples.length < 5) {
            bigConflictExamples.push({
                pn,
                occurrences: sources.length,
                designations: [...desigSet]
            });
        }
    }

    return {
        label,
        totalPns,
        pnEmpty,
        pnInvalidLikelyOcrNoise: pnInvalid,
        designationVariants,
        designationSpaceOnly,
        measureVariants,
        measureSpaceOnly,
        weightVariants,
        multiSourceMultipleEngine,
        bigConflictExamples
    };
}

const synthNew = loadJson(SYNTH_NEW);
const synthSup = loadJson(SYNTH_SUP);

const report = {
    new: analyze(synthNew, 'synthetic_new_compacted'),
    superseded: analyze(synthSup, 'synthetic_superseded_compacted')
};

console.log(JSON.stringify(report, null, 2));
