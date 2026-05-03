const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SYNTH_NEW = path.join(REPO_ROOT, 'data', 'output', 'export_review', 'synthetic_new_compacted.json');
const SYNTH_SUP = path.join(REPO_ROOT, 'data', 'output', 'export_review', 'synthetic_superseded_compacted.json');

function loadJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function buildReport(rows, label) {
    const decisionCounts = {};
    const severityCounts = { none: 0, low: 0, medium: 0, high: 0, unknown: 0 };
    const scoreBuckets = { '1.0': 0, '0.8-0.99': 0, '0.5-0.79': 0, '0.2-0.49': 0, '<0.2': 0 };
    const realConflictByField = { designation: 0, measure: 0, weight: 0 };
    const truncationByField = { designation: 0, measure: 0, weight: 0 };
    const examples = { pending_review: [], discard: [], importable_with_warning: [], import_new: [], import_superseded: [] };

    let totalScore = 0;
    let scoredCount = 0;

    for (const row of rows) {
        const decision = row.merge_decision || 'unknown';
        decisionCounts[decision] = (decisionCounts[decision] || 0) + 1;

        const mq = row.merge_quality || {};
        const severity = mq.conflict_severity || 'unknown';
        severityCounts[severity] = (severityCounts[severity] || 0) + 1;

        const score = typeof mq.consistency_score === 'number' ? mq.consistency_score : 0;
        totalScore += score; scoredCount += 1;
        if (score >= 1) scoreBuckets['1.0'] += 1;
        else if (score >= 0.8) scoreBuckets['0.8-0.99'] += 1;
        else if (score >= 0.5) scoreBuckets['0.5-0.79'] += 1;
        else if (score >= 0.2) scoreBuckets['0.2-0.49'] += 1;
        else scoreBuckets['<0.2'] += 1;

        for (const field of (mq.real_conflict_fields || [])) {
            if (realConflictByField[field] != null) realConflictByField[field] += 1;
        }
        for (const field of (mq.truncation_only_fields || [])) {
            if (truncationByField[field] != null) truncationByField[field] += 1;
        }

        if (examples[decision] && examples[decision].length < 3) {
            examples[decision].push({
                pn: row.pn,
                designation: row.designation,
                measurement: row.measurement,
                consistency_score: score,
                severity,
                reasons: row.merge_decision_reasons,
                real_conflict_fields: mq.real_conflict_fields
            });
        }
    }

    return {
        label,
        total: rows.length,
        avg_consistency_score: scoredCount ? Number((totalScore / scoredCount).toFixed(3)) : 0,
        decision_counts: decisionCounts,
        severity_counts: severityCounts,
        score_buckets: scoreBuckets,
        real_conflict_by_field: realConflictByField,
        truncation_by_field: truncationByField,
        examples
    };
}

const synthNew = loadJson(SYNTH_NEW);
const synthSup = loadJson(SYNTH_SUP);

console.log(JSON.stringify({
    new: buildReport(synthNew, 'synthetic_new'),
    superseded: buildReport(synthSup, 'synthetic_superseded')
}, null, 2));
