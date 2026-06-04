const { applyRevisionFile, applyRevisionPayload } = require('./server/services/revision-apply-core');

async function main() {
    const revisionArg = process.argv[2] || 'qa_revision_2026-04-09T10-11-31-442Z.json';
    const result = await applyRevisionFile(revisionArg);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    applyRevisionFile,
    applyRevisionPayload
};
