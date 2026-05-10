// Synchronized vertical-crosshair plugin for Chart.js. Module-level
// state shares the cursor's x value across every Chart.js instance
// that registers the plugin, so hovering one chart draws a reference
// line at the same time on every other chart on the page and
// activates each peer's tooltip at the matching x.
//
// Used by SignalChart (every instance, dashboard + log + future pages).

import { ref } from 'vue';

const crosshairTime = ref(null);
const crosshairCharts = new Set();

function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Find the index in each visible dataset whose x is closest to time `t`.
// Skips hidden helper datasets (`_injection:` markers) since the
// tooltip would filter them anyway.
function nearestItemsAtTime(chart, t) {
  const items = [];
  chart.data.datasets.forEach((ds, datasetIndex) => {
    if (!chart.isDatasetVisible(datasetIndex)) return;
    if (String(ds?.label || '').startsWith('_injection')) return;
    if (!ds.data?.length) return;
    let closestIndex = -1;
    let minDist = Infinity;
    ds.data.forEach((pt, i) => {
      const ptT = pt?.x instanceof Date ? pt.x.getTime() : pt?.x;
      if (!Number.isFinite(ptT)) return;
      const d = Math.abs(ptT - t);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    });
    if (closestIndex >= 0) items.push({ datasetIndex, index: closestIndex });
  });
  return items;
}

function syncPeerTooltip(chart, t) {
  if (!chart.tooltip?.setActiveElements) return;
  if (t == null) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    return;
  }
  const items = nearestItemsAtTime(chart, t);
  const xScale = chart.scales.x;
  if (!items.length || !xScale) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    return;
  }
  const px = xScale.getPixelForValue(t);
  const firstMeta = chart.getDatasetMeta(items[0].datasetIndex);
  const firstEl = firstMeta?.data?.[items[0].index];
  const py = firstEl?.y ?? chart.chartArea.top + 20;
  chart.tooltip.setActiveElements(items, { x: px, y: py });
}

function setCrosshair(t, origin) {
  if (crosshairTime.value === t) return;
  crosshairTime.value = t;
  // Schedule peer updates so the originating chart's event handler can
  // finish before re-entering its render cycle. Peers use
  // `update('none')` (no animation, full update pass) — `draw()` alone
  // doesn't drive the tooltip controller through show/move/hide, which
  // causes peer tooltips to drift / not appear / not clear on mouseout.
  // The originating chart only needs a redraw — its native event flow
  // already updated its tooltip from the real mouse event.
  requestAnimationFrame(() => {
    for (const c of crosshairCharts) {
      if (c === origin) {
        c.draw();
      } else {
        syncPeerTooltip(c, t);
        c.update('none');
      }
    }
  });
}

export const crosshairPlugin = {
  id: 'crosshair',
  install(chart) {
    crosshairCharts.add(chart);
  },
  uninstall(chart) {
    crosshairCharts.delete(chart);
  },
  afterEvent(chart, args) {
    const event = args.event;
    if (!event) return;
    const xScale = chart.scales.x;
    if (!xScale) return;
    const move = ['mousemove', 'touchmove', 'touchstart', 'pointermove', 'pointerdown'];
    const exit = ['mouseout', 'mouseleave', 'touchend', 'touchcancel', 'pointerleave'];
    if (move.includes(event.type)) {
      const px = Math.max(chart.chartArea.left, Math.min(chart.chartArea.right, event.x));
      const v = xScale.getValueForPixel(px);
      if (Number.isFinite(v)) setCrosshair(v, chart);
    } else if (exit.includes(event.type)) {
      setCrosshair(null, chart);
    }
  },
  afterDraw(chart) {
    if (crosshairTime.value == null) return;
    const xScale = chart.scales.x;
    if (!xScale) return;
    const px = xScale.getPixelForValue(crosshairTime.value);
    if (!Number.isFinite(px)) return;
    if (px < chart.chartArea.left || px > chart.chartArea.right) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = cssVar('--text-tertiary', '#9ca3af');
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, chart.chartArea.top);
    ctx.lineTo(px, chart.chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
