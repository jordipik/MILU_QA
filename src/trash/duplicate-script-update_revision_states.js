'use strict';
const mod = require('../src/server/milu-demo/scripts/update_revision_states');
if (require.main === module && typeof mod.main === 'function') {
    const result = mod.main(process.argv);
    if (typeof result === 'number') process.exitCode = result;
}
module.exports = mod;
