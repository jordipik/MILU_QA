#!/usr/bin/env node

const { main } = require('./scripts/compare_rebuild_vs_engine');

process.exitCode = main(process.argv);
