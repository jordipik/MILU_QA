'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('Revision apply module loading', () => {
    test('server revision-apply service loads with local core dependency', () => {
        const { createRevisionApplyService } = require('../../server/services/revision-apply');
        assert.equal(typeof createRevisionApplyService, 'function');

        const service = createRevisionApplyService({ repoRoot: process.cwd() });
        assert.equal(typeof service.applyFromApi, 'function');
    });

    test('root apply_revision_to_engines wrapper still exports contract', () => {
        const wrapper = require('../../apply_revision_to_engines');
        assert.equal(typeof wrapper.applyRevisionPayload, 'function');
        assert.equal(typeof wrapper.applyRevisionFile, 'function');
    });
});
