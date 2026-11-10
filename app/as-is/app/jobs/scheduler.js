// Runs the nightly import and the weekly report on a timer, inside the same container as the web app.
// If the process restarts, the timers restart too, so a run can be skipped.
const ingest = require('./ingest');
const report = require('./report');

const INGEST_EVERY = parseInt(process.env.INGEST_EVERY_SEC || '86400', 10) * 1000;
const REPORT_EVERY = parseInt(process.env.REPORT_EVERY_SEC || '604800', 10) * 1000;

function guarded(name, fn) {
  return () => fn().catch((e) => console.error(`${name} failed:`, e.message));
}

setInterval(guarded('ingest', ingest.run), INGEST_EVERY);
setInterval(guarded('report', report.run), REPORT_EVERY);
console.log(`scheduler: ingest every ${INGEST_EVERY / 1000}s, report every ${REPORT_EVERY / 1000}s`);
