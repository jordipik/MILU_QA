'use strict';
const mod = require('../src/server/milu-demo/scripts/update_gesa_fields_from_excel');
if (require.main === module && typeof mod.main === 'function') {
    const result = mod.main(process.argv);
    if (typeof result === 'number') process.exitCode = result;
}
module.exports = mod;
