const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');
const { recomputeQaErrorsInFile } = require('../qa_errors');

function main() {
    const repoRoot = path.join(__dirname, '..');
    const results = [];

    ENGINE_JSON_FILES.forEach((fileName) => {
        const absolutePath = path.join(repoRoot, fileName);
        const summary = recomputeQaErrorsInFile(absolutePath);
        results.push({ file: fileName, ...summary });
    });

    const totals = results.reduce((acc, item) => {
        acc.totalRows += item.totalRows;
        acc.rowsWithErrors += item.rowsWithErrors;
        acc.changedRows += item.changedRows;
        return acc;
    }, { totalRows: 0, rowsWithErrors: 0, changedRows: 0 });

    console.log(JSON.stringify({
        ok: true,
        files: results,
        totals
    }, null, 2));
}

if (require.main === module) {
    main();
}
