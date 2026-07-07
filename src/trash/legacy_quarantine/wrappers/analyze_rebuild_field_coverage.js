#!/usr/bin/env node

const { main } = require('./scripts/analyze_rebuild_field_coverage');

process.exitCode = main(process.argv);
