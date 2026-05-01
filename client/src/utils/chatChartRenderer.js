// Post-render pass that turns ```chart fenced code blocks emitted by the
// agent into inline images of small Chart.js charts. Used by the chat
// drawer to upgrade an already-displayed assistant message after streaming
// completes — the user first sees the text reply, then the charts pop in
// once the underlying series data finishes loading.
//
// The agent emits something like:
//   ```chart
//   { "series": ["weight", "dosage:abc"], "from": "2026-01-01", "to": "2026-04-30", "title": "Weight + Reta" }
//   ```
//
// `marked` parses this into:
//   <pre><code class="language-chart">{...}</code></pre>
//
// We replace each such block with:
//   <figure class="chat-chart">
//     <img src="data:image/png;base64,...">
//     <figcaption>{title}</figcaption>
//   </figure>
//
// Errors per-block don't fail the whole pass — a broken spec just renders
// a small error caption in place of the chart.

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LineController,
  LinearScale,
  TimeScale,
  Tooltip,
  Filler,
  Legend,
  Title,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { getSeriesDaily } from '../api/analysis.js';

// Idempotent — Chart.js's register() is safe to call repeatedly. We don't
// rely on the dashboard having loaded first, so register here too.
ChartJS.register(
  LineElement, PointElement, LineController,
  LinearScale, TimeScale, Tooltip, Filler, Legend, Title,
);

// Default palette — matches the dashboard CORE_SERIES vibe but reads from
// CSS vars so the chart respects the user's theme.
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const SERIES_COLORS = {
  weight: '--color-weight',
  waist: '--color-waist',
  calories: '--color-cal',
  protein: '--color-protein',
  fat: '--color-fat',
  carbs: '--color-carbs',
  score: '--color-score',
};

function colorForSeriesId(id, fallback = '#6b7280') {
  if (SERIES_COLORS[id]) return cssVar(SERIES_COLORS[id], fallback);
  if (id.startsWith('dosage:')) return cssVar('--color-dose', '#f59e0b');
  if (id.startsWith('symptom:')) return cssVar('--color-symptom-1', '#8b5cf6');
  return fallback;
}

// Parse the JSON spec from a `code.language-chart` element. Returns null
// (with a console warning) if the spec is malformed — the caller swaps in
// an error caption rather than rendering a broken chart.
function parseSpec(text) {
  try {
    const spec = JSON.parse(text);
    if (!spec || !Array.isArray(spec.series) || !spec.series.length) return null;
    if (!spec.from || !spec.to) return null;
    return spec;
  } catch (err) {
    console.warn('[chat-chart] bad spec', err, text?.slice?.(0, 200));
    return null;
  }
}

// Renders a single spec to a PNG data URL. Creates a hidden canvas in
// the DOM (Chart.js needs a layout-attached canvas to size correctly),
// draws synchronously with animations off, captures, then disposes.
async function renderSpecToDataUrl(spec, datasets) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 280;
  // Off-screen but still in the DOM so Chart.js can measure layout.
  canvas.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;width:720px;height:280px;';
  document.body.appendChild(canvas);
  let chart;
  try {
    chart = new ChartJS(canvas, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: false,
        animation: false,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom' },
          tooltip: { enabled: false },
          title: spec.title
            ? { display: true, text: spec.title, color: cssVar('--text', '#111827') }
            : { display: false },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' },
            grid: { display: false },
            ticks: { color: cssVar('--chart-axis', '#9ca3af'), maxTicksLimit: 6 },
            border: { color: cssVar('--border', '#e5e7eb') },
          },
          y: {
            position: 'right',
            grid: { color: cssVar('--chart-grid', '#f3f4f6') },
            ticks: { color: cssVar('--chart-axis', '#9ca3af'), maxTicksLimit: 6 },
            border: { color: cssVar('--border', '#e5e7eb') },
          },
        },
      },
    });
    chart.draw();
    return canvas.toDataURL('image/png');
  } finally {
    if (chart) try { chart.destroy(); } catch { /* ignore */ }
    canvas.remove();
  }
}

// Build Chart.js datasets from the spec's series + the data the analysis
// API returned. Each series is fetched in parallel to keep latency low.
async function buildDatasets(spec) {
  const responses = await Promise.all(
    spec.series.map(async (id) => {
      try {
        const res = await getSeriesDaily({ series: id, from: spec.from, to: spec.to });
        return { id, label: res.label || id, points: Array.isArray(res.points) ? res.points : [] };
      } catch (err) {
        console.warn('[chat-chart] series fetch failed', id, err);
        return { id, label: id, points: [] };
      }
    }),
  );
  return responses
    .filter((r) => r.points.length)
    .map((r) => {
      const color = colorForSeriesId(r.id);
      return {
        label: r.label,
        data: r.points.map((p) => ({ x: new Date(`${p.date}T00:00:00.000Z`), y: p.value })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.25,
      };
    });
}

// Process every chart block in the given HTML string. Returns the upgraded
// HTML; if there are no chart blocks (or none can be rendered), returns
// the input unchanged so callers can short-circuit equality checks.
export async function renderChartsInHtml(html) {
  if (typeof html !== 'string' || !html.includes('language-chart')) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('_root');
  const blocks = root.querySelectorAll('pre > code.language-chart');
  if (!blocks.length) return html;

  let mutated = false;
  // Process sequentially — the offscreen canvas trick only works for one
  // chart at a time. Charts are small + the data fetches are typically
  // already cached from the dashboard, so the sequential cost is fine.
  for (const code of Array.from(blocks)) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== 'PRE') continue;
    const spec = parseSpec(code.textContent || '');
    if (!spec) {
      pre.replaceWith(makeErrorFigure(doc, 'Could not parse chart spec'));
      mutated = true;
      continue;
    }
    let datasets;
    try {
      datasets = await buildDatasets(spec);
    } catch (err) {
      console.warn('[chat-chart] dataset build failed', err);
      pre.replaceWith(makeErrorFigure(doc, 'Could not load chart data'));
      mutated = true;
      continue;
    }
    if (!datasets.length) {
      pre.replaceWith(makeErrorFigure(doc, 'No data for the requested range'));
      mutated = true;
      continue;
    }
    let dataUrl;
    try {
      dataUrl = await renderSpecToDataUrl(spec, datasets);
    } catch (err) {
      console.warn('[chat-chart] render failed', err);
      pre.replaceWith(makeErrorFigure(doc, 'Chart render failed'));
      mutated = true;
      continue;
    }
    pre.replaceWith(makeFigure(doc, dataUrl, spec.title || ''));
    mutated = true;
  }
  if (!mutated) return html;
  return root.innerHTML;
}

function makeFigure(doc, dataUrl, title) {
  const figure = doc.createElement('figure');
  figure.className = 'chat-chart';
  const img = doc.createElement('img');
  img.src = dataUrl;
  img.alt = title || 'Inline chart';
  figure.appendChild(img);
  if (title) {
    const cap = doc.createElement('figcaption');
    cap.textContent = title;
    figure.appendChild(cap);
  }
  return figure;
}

function makeErrorFigure(doc, message) {
  const figure = doc.createElement('figure');
  figure.className = 'chat-chart chat-chart-error';
  const cap = doc.createElement('figcaption');
  cap.textContent = message;
  figure.appendChild(cap);
  return figure;
}
