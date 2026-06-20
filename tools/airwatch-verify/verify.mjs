// ============================================================================
// AirWatch air-quality card — exhaustive synthetic verification gate
// ============================================================================
// Renders the REAL compiled oriel-air-quality-card in real Chromium against an
// engineered synthetic AirWatch dataset, and asserts rendered-vs-injected per
// path — the paths David's prod CAN'T exercise (no divergence, no CO coverage,
// not yet on v1.1.0). Prints a pass/fail matrix. Any FAIL blocks the release.
//
// Run: node tools/airwatch-verify/verify.mjs   (after `npm run build`)
// ============================================================================

import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');
const PUBLIC = '/hacsfiles/oriel-dashboard/';

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script>
  // Stub ha-card / ha-icon as transparent elements so the card's own template
  // (.headline/.row/.differ/.row-sources/.co-note) renders without HA frontend.
  for (const t of ['ha-card','ha-icon']) {
    if (!customElements.get(t)) customElements.define(t, class extends HTMLElement {});
  }
</script>
<script src="${PUBLIC}oriel.js"></script>
</head><body></body></html>`;

// -- engineered dataset: one scenario hitting every path ---------------------
// Canonical order: pm2_5, pm10, nitrogen_dioxide, ozone, sulphur_dioxide,
// carbon_monoxide, european_aqi.
const POLLUTANTS = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'sulphur_dioxide',
  'carbon_monoxide',
  'european_aqi',
];

// per pollutant: [consensusState, source_count|null, max|null, source_levels, divergenceBinaryState|null]
const SCEN = {
  // high, cross-validated, divergence binary present & OFF → NO flag despite high
  pm2_5: ['high', 3, 3, { open_meteo: 2, sensor_community: 2, land_steiermark: 2 }, 'off'],
  // good → hidden when show_good off
  pm10: ['good', 2, 3, { open_meteo: 0, land_steiermark: 0 }, 'off'],
  // degraded: consensus unavailable → level unknown ("—"), shown (not fake-good)
  nitrogen_dioxide: ['unavailable', null, null, {}, null],
  // mixed + divergence binary ON → EXPLICIT divergence path
  ozone: ['mixed', 3, 3, { open_meteo: 0, sensor_community: 2, land_steiermark: 1 }, 'on'],
  // mixed + NO divergence binary → MIXED-STATE FALLBACK divergence path
  sulphur_dioxide: ['mixed', 2, 2, { open_meteo: 0, land_steiermark: 2 }, null],
  // elevated, CO → real level + no-EAQI note + no band, no flag
  carbon_monoxide: ['elevated', 2, 2, { open_meteo: 1, land_steiermark: 1 }, null],
  // high, single-source (1/M); a parallel composite → EXCLUDED from the worst-of
  european_aqi: ['high', 1, 1, { open_meteo: 2 }, null],
};

// Worst-of truth (exclude european_aqi; mixed excluded from max, listed as diverged):
//   agreed: pm2_5=high(2), pm10=good(0), co=elevated(1); no2 null skip; ozone+so2 diverged.
//   → worst level high, worst_pollutant pm2_5 (first at high in canonical order).
//   → diverged_pollutants [ozone, sulphur_dioxide].
const TRUTH = {
  overall_level: 'high',
  worst_pollutant: 'pm2_5',
  diverged: ['ozone', 'sulphur_dioxide'],
  flagged: ['ozone', 'sulphur_dioxide'], // rows that must show the divergence flag
  co_row: 'carbon_monoxide',
  hidden_when_show_good_off: ['pm10'], // good + not diverged
  sources: {
    pm2_5: '3/3',
    pm10: '2/3',
    ozone: '3/3',
    sulphur_dioxide: '2/2',
    carbon_monoxide: '2/2',
    european_aqi: '1/1',
  },
};

const LABELS = {
  pm2_5: 'PM2.5',
  pm10: 'PM10',
  nitrogen_dioxide: 'Nitrogen dioxide',
  ozone: 'Ozone',
  sulphur_dioxide: 'Sulphur dioxide',
  carbon_monoxide: 'Carbon monoxide',
  european_aqi: 'European AQI',
};

function buildStates({ withOverall }) {
  const states = {};
  for (const p of POLLUTANTS) {
    const [state, count, max, levels, div] = SCEN[p];
    const attrs = {};
    if (count !== null) attrs.source_count = count;
    if (max !== null) attrs.max_possible_sources = max;
    if (Object.keys(levels).length) attrs.source_levels = levels;
    states[`sensor.airwatch_analytics_${p}_consensus`] = { state, attributes: attrs };
    if (div !== null) {
      states[`binary_sensor.airwatch_analytics_${p}_divergence`] = { state: div, attributes: {} };
    }
  }
  if (withOverall) {
    states['sensor.airwatch_analytics_overall'] = {
      state: TRUTH.overall_level,
      attributes: {
        level_label: TRUTH.overall_level,
        worst_pollutant: TRUTH.worst_pollutant,
        diverged_pollutants: TRUTH.diverged,
      },
    };
  }
  return states;
}

// Render the card in the page and extract the rendered facts.
async function renderFacts(page, { withOverall, showGood }) {
  const states = buildStates({ withOverall });
  return page.evaluate(
    async ({ states, pollutants, showGood }) => {
      document.body.innerHTML = '';
      const el = document.createElement('oriel-air-quality-card');
      el.setConfig({ pollutants, show_good: showGood });
      el.hass = { states, locale: { language: 'en' } };
      document.body.appendChild(el);
      await el.updateComplete;
      const root = el.shadowRoot;
      const headline = root.querySelector('.headline')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const rows = [...root.querySelectorAll('.row')].map((r) => ({
        name: r.querySelector('.row-name')?.textContent?.trim() ?? '',
        level: r.querySelector('.row-level')?.textContent?.trim() ?? '',
        sources: r.querySelector('.row-sources')?.textContent?.trim() ?? null,
        differ: !!r.querySelector('.differ'),
        differTitle: r.querySelector('.differ')?.getAttribute('title') ?? null,
        coNote: !!r.querySelector('.co-note'),
      }));
      const empty = !!root.querySelector('.empty');
      return { headline, rows, empty };
    },
    { states, pollutants: POLLUTANTS, showGood },
  );
}

// -- assertions → matrix -----------------------------------------------------
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

async function main() {
  // static server
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url.split('?')[0];
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end(HOST_HTML);
      }
      if (url.startsWith(PUBLIC)) {
        const file = path.join(DIST, url.slice(PUBLIC.length));
        const body = await readFile(file);
        const type = file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        return res.end(body);
      }
      res.writeHead(404).end('not found');
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  // wait for the real compiled card to register
  await page.waitForFunction(() => !!customElements.get('oriel-air-quality-card'), null, {
    timeout: 30000,
  });

  // Scenario A: overall entity PRESENT, show_good ON (all rows visible)
  const A = await renderFacts(page, { withOverall: true, showGood: true });
  // Scenario B: overall entity ABSENT (compute fallback), show_good ON
  const B = await renderFacts(page, { withOverall: false, showGood: true });
  // Scenario C: show_good OFF (good pollutant hidden)
  const C = await renderFacts(page, { withOverall: true, showGood: false });

  const rowByName = (facts, pollutant) => facts.rows.find((r) => r.name === LABELS[pollutant]);

  // 1. divergence flag on EXACTLY the diverged pollutants (explicit + fallback)
  const flagged = A.rows.filter((r) => r.differ).map((r) => r.name).sort();
  const expectFlagged = TRUTH.flagged.map((p) => LABELS[p]).sort();
  check(
    'divergence flag on exactly diverged pollutants (ozone=explicit binary ON, SO2=mixed fallback)',
    JSON.stringify(flagged) === JSON.stringify(expectFlagged),
    `rendered flagged=${JSON.stringify(flagged)} expected=${JSON.stringify(expectFlagged)}`,
  );
  // pm2_5 is high with binary OFF → must NOT be flagged
  check(
    'high pollutant with binary_sensor OFF is NOT flagged (pm2_5)',
    rowByName(A, 'pm2_5')?.differ === false,
    `pm2_5.differ=${rowByName(A, 'pm2_5')?.differ}`,
  );
  // divergence title carries which-sources-disagree detail
  const ozTitle = rowByName(A, 'ozone')?.differTitle ?? '';
  check(
    'divergence flag title carries per-source detail (ozone)',
    ozTitle.includes('sensor community: high') && ozTitle.includes('open meteo: good'),
    `ozone title="${ozTitle}"`,
  );

  // 2. mixed pollutant EXCLUDED from headline max, carried as divergence note
  check(
    'headline level = worst AGREED (high), mixed pollutants excluded from the max',
    /high/i.test(A.headline),
    `headline="${A.headline}"`,
  );
  check(
    'headline names the worst pollutant (PM2.5), not a mixed one',
    A.headline.includes(LABELS[TRUTH.worst_pollutant]),
    `headline="${A.headline}"`,
  );

  // 3. CO honest: real level + no-EAQI note + no divergence flag
  const co = rowByName(A, 'carbon_monoxide');
  check(
    'CO renders real level (elevated), no-EAQI note present, NO divergence flag',
    co && /elevated/i.test(co.level) && co.coNote === true && co.differ === false,
    `co=${JSON.stringify(co)}`,
  );
  // only CO carries the note
  const noteRows = A.rows.filter((r) => r.coNote).map((r) => r.name);
  check(
    'the no-EAQI note appears on CO only',
    JSON.stringify(noteRows) === JSON.stringify([LABELS.carbon_monoxide]),
    `note rows=${JSON.stringify(noteRows)}`,
  );

  // 4. N-of-M per pollutant (1/1 single-source ... 3/3 cross-validated)
  let nmOk = true;
  const nmDetail = [];
  for (const [p, expect] of Object.entries(TRUTH.sources)) {
    const got = rowByName(A, p)?.sources;
    nmDetail.push(`${p}:${got}`);
    if (got !== expect) nmOk = false;
  }
  check('N-of-M source badge correct per pollutant (incl. 1/1 single-source, 3/3 cross-validated)', nmOk, nmDetail.join(' '));

  // 5. overall PRESENT vs ABSENT → identical headline + rows
  check(
    'overall entity PRESENT and ABSENT produce IDENTICAL headline (read vs compute fallback)',
    A.headline === B.headline,
    `present="${A.headline}"  absent="${B.headline}"`,
  );
  check(
    'overall PRESENT and ABSENT produce identical rows',
    JSON.stringify(A.rows) === JSON.stringify(B.rows),
    A.headline === B.headline ? 'rows match' : 'rows differ',
  );

  // 6. degraded/unavailable renders honestly (unknown, never fake-good) and stays visible
  const no2 = rowByName(A, 'nitrogen_dioxide');
  check(
    'degraded consensus (unavailable) renders as unknown "—", never fake-good',
    no2 && (no2.level === '—' || /unknown/i.test(no2.level)) && !/good/i.test(no2.level),
    `no2.level="${no2?.level}"`,
  );

  // 7. show_good off hides good (non-diverged) pollutants; keeps the rest
  const cNames = C.rows.map((r) => r.name);
  const pm10Hidden = !cNames.includes(LABELS.pm10);
  const keptDiverged = cNames.includes(LABELS.ozone) && cNames.includes(LABELS.sulphur_dioxide);
  const keptUnknown = cNames.includes(LABELS.nitrogen_dioxide);
  check(
    'show_good OFF hides good non-diverged (pm10); keeps diverged + unknown + non-good',
    pm10Hidden && keptDiverged && keptUnknown,
    `show_good=off rows=${JSON.stringify(cNames)}`,
  );

  await browser.close();
  await new Promise((r) => server.close(r));

  // -- report ---------------------------------------------------------------
  if (pageErrors.length) {
    console.log('⚠ page errors during load:\n  ' + pageErrors.join('\n  ') + '\n');
  }
  console.log('AirWatch air-quality card — synthetic verification matrix\n');
  let fails = 0;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) fails++;
    console.log(`  [${tag}] ${r.name}`);
    if (!r.pass) console.log(`         → ${r.detail}`);
  }
  console.log(`\n${results.length - fails}/${results.length} checks passed.`);
  if (fails > 0) {
    console.log('GATE: FAIL');
    process.exit(1);
  }
  console.log('GATE: PASS');
}

main().catch((e) => {
  console.error('verify harness error:', e);
  process.exit(2);
});
