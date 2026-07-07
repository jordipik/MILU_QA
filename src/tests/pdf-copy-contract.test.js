const test = require('node:test');
const assert = require('node:assert/strict');

const { applyCanonicalPdfCopyToRow } = require('../scripts/qa_pdf_visual_copy');

function createBaselineRow() {
    return {
        ID: 'T-001',
        pos_pdf: 'OLD_POS',
        pn_pdf: 'OLD_PN',
        designation_pdf: 'OLD_DESIGNATION',
        qty_pdf: 'OLD_QTY',
        weight_pdf: 'OLD_WEIGHT',
        fn_pdf: 'OLD_FN',
        measure_pdf: 'OLD_MEASURE',
        norma_pdf: 'OLD_NORMA',
        normalizado_pdf: 'NO'
    };
}

test('PDF copy contract: total replacement clears stale *_pdf fields before writing new values', () => {
    const row = createBaselineRow();

    const changedFields = applyCanonicalPdfCopyToRow(
        row,
        {
            pos_pdf: '10',
            pn_pdf: '123456',
            designation_pdf: 'NEW PART'
        },
        { clearPdfBeforeCopy: true }
    );

    assert.equal(row.pos_pdf, '10');
    assert.equal(row.pn_pdf, '123456');
    assert.equal(row.designation_pdf, 'NEW PART');

    assert.equal(row.qty_pdf, '');
    assert.equal(row.weight_pdf, '');
    assert.equal(row.fn_pdf, '');
    assert.equal(row.measure_pdf, '');
    assert.equal(row.norma_pdf, '');
    assert.equal(row.normalizado_pdf, '');

    assert.ok(Array.isArray(changedFields));
    assert.equal(changedFields.length, 9);
    assert.ok(changedFields.includes('pos_pdf'));
    assert.ok(changedFields.includes('pn_pdf'));
    assert.ok(changedFields.includes('designation_pdf'));
    assert.ok(changedFields.includes('qty_pdf'));
    assert.ok(changedFields.includes('weight_pdf'));
    assert.ok(changedFields.includes('fn_pdf'));
    assert.ok(changedFields.includes('measure_pdf'));
    assert.ok(changedFields.includes('norma_pdf'));
    assert.ok(changedFields.includes('normalizado_pdf'));
});

test('PDF copy contract: norma_pdf implies normalizado_pdf = SI', () => {
    const row = {
        ID: 'T-002',
        norma_pdf: '',
        normalizado_pdf: 'NO'
    };

    const changedFields = applyCanonicalPdfCopyToRow(
        row,
        { norma_pdf: 'DIN 123' },
        { clearPdfBeforeCopy: true }
    );

    assert.equal(row.norma_pdf, 'DIN 123');
    assert.equal(row.normalizado_pdf, 'SI');
    assert.ok(changedFields.includes('norma_pdf'));
    assert.ok(changedFields.includes('normalizado_pdf'));
});

test('PDF copy contract: merge mode preserves old *_pdf fields not present in incoming values', () => {
    const row = createBaselineRow();

    const changedFields = applyCanonicalPdfCopyToRow(
        row,
        {
            pos_pdf: '10',
            pn_pdf: '123456',
            designation_pdf: 'NEW PART'
        },
        { clearPdfBeforeCopy: false }
    );

    assert.equal(row.pos_pdf, '10');
    assert.equal(row.pn_pdf, '123456');
    assert.equal(row.designation_pdf, 'NEW PART');

    assert.equal(row.qty_pdf, 'OLD_QTY');
    assert.equal(row.weight_pdf, 'OLD_WEIGHT');
    assert.equal(row.fn_pdf, 'OLD_FN');
    assert.equal(row.measure_pdf, 'OLD_MEASURE');
    assert.equal(row.norma_pdf, 'OLD_NORMA');

    assert.deepEqual([...changedFields].sort(), ['designation_pdf', 'pn_pdf', 'pos_pdf']);
});
