'use strict';

const { applyRevisionPayload } = require('./revision-apply-core');

function createRevisionApplyService(options = {}) {
    const repoRoot = options.repoRoot || process.cwd();
    const onApplied = typeof options.onApplied === 'function' ? options.onApplied : null;

    async function applyFromApi(payload) {
        const result = await applyRevisionPayload(payload, {
            repoRoot,
            sourceName: 'api:/apply-revision-to-engines'
        });

        if (onApplied) {
            onApplied(result, payload);
        }

        return result;
    }

    return {
        applyFromApi,
    };
}

module.exports = {
    createRevisionApplyService,
};
