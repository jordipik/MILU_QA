'use strict';
const mod = require('../src/server/milu-demo/scripts/rebuild_engine_from_book_preview');
if (require.main === module && typeof mod.main === 'function') {
    const result = mod.main(process.argv);
    if (typeof result === 'number') process.exitCode = result;
}
module.exports = mod;
