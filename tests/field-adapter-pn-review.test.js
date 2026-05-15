'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTER_PATH = path.join(REPO_ROOT, 'js', 'fieldAdapter.js');
const PN_REVIEW_EMBEDDED_PATH = pathToFileURL(path.join(REPO_ROOT, 'js', 'pn-review-embedded.js')).href;

let getPnReviewFieldValue;

describe('pn review fieldAdapter read compatibility', () => {
    before(async () => {
        const adapter = require(ADAPTER_PATH);
        global.window = global.window || {};
        global.window.fieldAdapter = adapter;

        const pnReviewEmbedded = await import(PN_REVIEW_EMBEDDED_PATH);
        getPnReviewFieldValue = pnReviewEmbedded.getPnReviewFieldValue;
    });

    it('reads normalized fields directly', () => {
        const normalized = {
            pn_final: '70042500158',
            source_page: '12',
            hierarchie_final: 'SUPERSEDED',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
            designation_final: 'BOLT'
        };

        assert.equal(getPnReviewFieldValue(normalized, 'pn_final'), '70042500158');
        assert.equal(getPnReviewFieldValue(normalized, 'source_page'), '12');
        assert.equal(getPnReviewFieldValue(normalized, 'hierarchie_final'), 'SUPERSEDED');
        assert.equal(getPnReviewFieldValue(normalized, 'qa_revision_estado'), 'ok');
        assert.equal(getPnReviewFieldValue(normalized, 'qa_revision_accion'), 'importar');
        assert.equal(getPnReviewFieldValue(normalized, 'designation_final'), 'BOLT');
    });

    it('resolves legacy aliases for core PN Review fields', () => {
        const legacy = {
            'PART NO.': '0049976736',
            'Source Page': '33',
            sust_hierarchie: 'NEW',
            sust_status: 'OK_SUST_NEW',
            qa_revision_estado: 'pendiente',
            qa_revision_accion: 'revisar',
            DESIGNATION: 'NUT'
        };

        assert.equal(getPnReviewFieldValue(legacy, 'pn_final'), '0049976736');
        assert.equal(getPnReviewFieldValue(legacy, 'source_page'), '33');
        assert.equal(getPnReviewFieldValue(legacy, 'hierarchie_final'), 'NEW');
        assert.equal(getPnReviewFieldValue(legacy, 'is_subst_final'), 'OK_SUST_NEW');
        assert.equal(getPnReviewFieldValue(legacy, 'qa_revision_estado'), 'pendiente');
        assert.equal(getPnReviewFieldValue(legacy, 'qa_revision_accion'), 'revisar');
        assert.equal(getPnReviewFieldValue(legacy, 'designation_final'), 'NUT');
    });

    it('keeps qa_revision fields readable and independent from fallback chains', () => {
        const mixed = {
            'PART NO.': '1000000001',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'eliminar'
        };

        assert.equal(getPnReviewFieldValue(mixed, 'pn_final'), '1000000001');
        assert.equal(getPnReviewFieldValue(mixed, 'qa_revision_estado'), 'ok');
        assert.equal(getPnReviewFieldValue(mixed, 'qa_revision_accion'), 'eliminar');
    });
});
