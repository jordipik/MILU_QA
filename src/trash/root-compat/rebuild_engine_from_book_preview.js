#!/usr/bin/env node

const { main } = require('./scripts/rebuild_engine_from_book_preview');

process.exitCode = main(process.argv);
