const { run } = require('./export_wordpress_milu');

function t(value) {
    return String(value == null ? '' : value).trim();
}

function key(value) {
    return t(value).toLowerCase();
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function collectDuplicatePns(rows) {
    const seen = new Set();
    const duplicates = new Set();
    for (const row of rows) {
        const pn = key(row?.sku || row?.pn_final || row?.['PART NO.']);
        if (!pn) continue;
        if (seen.has(pn)) duplicates.add(pn);
        else seen.add(pn);
    }
    return [...duplicates];
}

function validateSyntheticMarkers(rows, bucketName) {
    for (const row of rows) {
        const source = t(row.synthetic_source);
        if (!source) continue;
        assert(t(row.data_quality), `${bucketName}: synthetic row without data_quality (pn=${row.sku || row.pn_final || ''})`);
    }
}

function main() {
    const payload = run({ dryRun: true, writeAuditMirror: false });
    const report = payload?.report || {};

    const duplicateNew = collectDuplicatePns(payload.importRows || []);
    const duplicateSuperseded = collectDuplicatePns(payload.supersededRows || []);

    assert(duplicateNew.length === 0, `NEW export has duplicated PN(s): ${duplicateNew.join(', ')}`);
    assert(duplicateSuperseded.length === 0, `SUPERSEDED export has duplicated PN(s): ${duplicateSuperseded.join(', ')}`);

    validateSyntheticMarkers(payload.importRows || [], 'new');
    validateSyntheticMarkers(payload.supersededRows || [], 'superseded');

    const metrics = report?.superseded_audit || {};
    const hasExpectedMetrics = [
        'total_new_real',
        'total_new_synthetic',
        'total_superseded_real',
        'total_superseded_synthetic_from_list',
        'total_superseded_omitted_existing',
        'total_orphan_superseded_generated_new',
        'duplicates_avoided'
    ].every((name) => Number.isFinite(Number(metrics[name])));

    assert(hasExpectedMetrics, 'Audit report is missing one or more superseded metrics');

    console.log('WordPress superseded validation OK');
    console.log(JSON.stringify({
        totals: report?.totals || {},
        superseded_audit: metrics
    }, null, 2));
}

if (require.main === module) {
    main();
}
