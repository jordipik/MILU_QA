#!/usr/bin/env node

const { main } = require('./scripts/analyze_missing_rebuild_rows');

process.exitCode = main(process.argv);
