'use strict';
const mod = require('./src/server/milu-demo/scripts/recompute_engine_errors');
if (require.main === module && typeof mod.main === 'function') {
    mod.main();
}
module.exports = mod;
