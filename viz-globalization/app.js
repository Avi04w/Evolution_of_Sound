import { feature, mesh } from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

const d3 = window.d3;

const DATA_URL = '../data/processed/billboard_full.ndjson';
const WORLD_URL = './world-110m.json';
const START_DATE_STR = '1980-01-01';
const IGNORED_CODES = new Set(['XW', 'XE', 'AF', 'EU', 'AS', 'OC', 'NA', 'SA', 'XX', 'ZZ', 'AQ']);

const TOP_METRICS_N = 100;
const TOP_PIN_N = 10;
const WINDOW_WEEKS = 8;
const EXCLUDE_US = false;
// TODO: Add decade filter controls to focus the timeline and sparklines.
// TODO: Introduce country/genre filter controls to refine the map, pins, and metrics.

const ISO_TO_NUMERIC_ID = {
  US: 840,
  GB: 826,
  CA: 124,
  AU: 36,
  DE: 276,
  FR: 250,
  BR: 76,
  JP: 392,
  KR: 410,
  CN: 156,
  IN: 356,
  IT: 380,
  ES: 724,
  NL: 528,
  SE: 752,
  NO: 578,
  FI: 246,
  DK: 208,
  RU: 643,
  MX: 484,
  AR: 32,
  CL: 152,
  CO: 170,
  ZA: 710,
  NG: 566,
  EG: 818,
  SA: 682,
  TR: 792,
  IL: 376,
  IE: 372,
  NZ: 554,
};

const sparklineDefs = [
  {
    key: 'nonUSShare',
    label: 'Non-US Share',
    accessor: (metrics) => (metrics ? metrics.nonUSShare ?? null : null),
    formatter: (value) => formatPercent(value, 1),
    stroke: '#3a6fd8',
    fixedDomain: [0, 1],
  },
  {
    key: 'uniqueOrigins',
    label: 'Unique Origins',
    accessor: (metrics) => (metrics ? metrics.uniqueOrigins ?? null : null),
    formatter: (value) => formatInteger(value),
    stroke: '#1ca37a',
    paddingRatio: 0.08,
  },
  {
    key: 'entropy',
    label: 'Shannon Entropy H',
    accessor: (metrics) => (metrics ? metrics.entropy ?? null : null),
    formatter: (value) => formatNumber(value, 2),
    stroke: '#c25594',
    paddingRatio: 0.12,
  },
];

const weeks = [];
const weekIndex = new Map();
const rows = [];
const rowsByWeekIndex = new Map();
const metricsByWeekIndex = new Map();
const rawShareWeightsByWeekIndex = new Map();
const totalWeightByWeekIndex = new Map();
let sparklineSeriesByKey = new Map();
let sparklineDomains = new Map();
const sparklineStates = new Map();
const sparklineValueEls = new Map();

const START_DATE = new Date(`${START_DATE_STR}T00:00:00Z`);

let currentWeekIndex = 0;
let isPlaying = false;
const playSpeedMs = 200;
let playTimer = null;
let isScrubbing = false;

let timelineWeekLabelEl = null;
let timelineWeekIndexEl = null;
let timelineRangeEl = null;
let playPauseButtonEl = null;
let legendEl = null;
let tooltipEl = null;
let mapContainerEl = null;
let sparklineTooltipEl = null;

const statElements = {
  nonUSShare: null,
  uniqueOrigins: null,
  entropy: null,
  collabRate: null,
  cumulativeOrigins: null,
};

let mapSvgSelection = null;
let mapWidth = 960;
let mapHeight = 540;
let projection = null;
let pathGenerator = null;
let countryFeatures = [];
let countryFeatureByNumericId = new Map();
let choroplethLayer = null;
let choroplethSelection = null;
let borderLayer = null;
let pinLayer = null;

const choroplethColorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
const genreColorScale = d3.scaleOrdinal(d3.schemeTableau10).unknown('#888ba1');

async function init() {
  try {
    cacheDomReferences();
    setupControls();

    const dataPromise = loadNdjson(DATA_URL);
    const worldPromise = loadWorldTopoJSON(WORLD_URL);

    const ndjson = await dataPromise;
    normalizeRows(ndjson);
    buildWeekLookups();
    buildRowsByWeek();
    computeWeeklyMetrics();
    buildSparklineSeries();

    const worldTopo = await worldPromise;
    initializeMap(worldTopo);
    initializeSparklines();

    configureTimeline();
    renderForWeek(currentWeekIndex);

    console.log('Sample normalized rows:', rows.slice(0, 5));
    console.log('First three weeks:', weeks.slice(0, 3));
    console.log(
      'First three weekly metrics:',
      Array.from(metricsByWeekIndex.entries())
        .slice(0, 3)
        .map(([idx, metrics]) => ({ weekIndex: idx, metrics }))
    );

    exposeForDebugging();
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

async function loadNdjson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch NDJSON (${response.status}): ${response.statusText}`);
  }
  const text = await response.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn('Skipping invalid NDJSON line:', error);
        return null;
      }
    })
    .filter(Boolean);
}

async function loadWorldTopoJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch world topology (${response.status}): ${response.statusText}`);
  }
  return response.json();
}

function normalizeRows(rawRows) {
  for (const raw of rawRows) {
    if (!raw || !raw.date || raw.date < START_DATE_STR) continue;

    const date = parseUtcDate(raw.date);
    if (!date || Number.isNaN(date.getTime()) || date < START_DATE) continue;

    const rank = Number(raw.rank);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Unknown';
    const artists = Array.isArray(raw.artists)
      ? raw.artists.filter((a) => typeof a === 'string' && a.trim())
      : typeof raw.artist === 'string' && raw.artist.trim()
      ? [raw.artist]
      : [];

    const genreCandidates = Array.isArray(raw.genres)
      ? raw.genres.filter((g) => typeof g === 'string' && g.trim())
      : [];
    const genre = genreCandidates.length ? genreCandidates[0] : 'Unknown';

    const originCandidates = Array.isArray(raw.country)
      ? raw.country
      : typeof raw.country === 'string'
      ? [raw.country]
      : [];

    const origins = originCandidates
      .map((code) => (typeof code === 'string' ? code.trim().toUpperCase() : null))
      .filter((code) => Boolean(code) && !IGNORED_CODES.has(code));

    const isoDate = date.toISOString().slice(0, 10);

    rows.push({
      date,
      dateString: isoDate,
      weekIndex: -1,
      rank,
      name,
      artists,
      genre,
      origins,
    });

    if (!weekIndex.has(isoDate)) {
      weekIndex.set(isoDate, null);
      weeks.push(date);
    }
  }

  weeks.sort((a, b) => a - b);
}

function buildWeekLookups() {
  weeks.forEach((date, idx) => {
    const iso = date.toISOString().slice(0, 10);
    weekIndex.set(iso, idx);
  });

  for (const row of rows) {
    const idx = weekIndex.get(row.dateString);
    if (idx === undefined) continue;
    row.weekIndex = idx;
  }
}

function buildRowsByWeek() {
  for (const row of rows) {
    if (row.weekIndex === -1) continue;
    if (!rowsByWeekIndex.has(row.weekIndex)) {
      rowsByWeekIndex.set(row.weekIndex, []);
    }
    rowsByWeekIndex.get(row.weekIndex).push(row);
  }

  for (const weekRows of rowsByWeekIndex.values()) {
    weekRows.sort((a, b) => a.rank - b.rank);
  }
}

function computeWeeklyMetrics() {
  const seenOrigins = new Set();
  const sortedWeekIndices = Array.from(rowsByWeekIndex.keys()).sort((a, b) => a - b);

  for (const idx of sortedWeekIndices) {
    const weekRows = rowsByWeekIndex.get(idx) ?? [];
    const topRows = weekRows.slice(0, TOP_METRICS_N);

    const shares = new Map();
    let totalWeight = 0;
    let collabCount = 0;

    for (const row of topRows) {
      const weight = Math.max(0, 101 - row.rank);
      if (row.origins.length >= 2) {
        collabCount += 1;
      }
      if (!row.origins.length || weight === 0) continue;

      const fractionalWeight = weight / row.origins.length;
      for (const origin of row.origins) {
        shares.set(origin, (shares.get(origin) ?? 0) + fractionalWeight);
        seenOrigins.add(origin);
      }
      totalWeight += weight;
    }

    rawShareWeightsByWeekIndex.set(idx, shares);
    totalWeightByWeekIndex.set(idx, totalWeight);

    const normalizedShares = new Map();
    if (totalWeight > 0) {
      for (const [country, value] of shares.entries()) {
        normalizedShares.set(country, value / totalWeight);
      }
    }

    const usShare = normalizedShares.get('US') ?? 0;
    const nonUSShare = totalWeight > 0 ? 1 - usShare : 0;
    const uniqueOrigins = normalizedShares.size;
    const entropy = computeShannonEntropy(normalizedShares);

    const collabRate =
      topRows.length > 0 ? Math.round((collabCount / topRows.length) * 1000) / 10 : 0;

    metricsByWeekIndex.set(idx, {
      nonUSShare,
      uniqueOrigins,
      entropy,
      collabRate,
      cumulativeOriginsSoFar: seenOrigins.size,
    });
  }
}

function buildSparklineSeries() {
  sparklineSeriesByKey = new Map();
  sparklineDomains = new Map();

  for (const def of sparklineDefs) {
    const series = weeks.map((date, idx) => {
      const metrics = metricsByWeekIndex.get(idx) ?? null;
      const rawValue = def.accessor(metrics);
      const value =
        typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
      return {
        weekIndex: idx,
        date,
        isoDate: date.toISOString().slice(0, 10),
        value,
      };
    });

    sparklineSeriesByKey.set(def.key, series);

    if (def.fixedDomain) {
      sparklineDomains.set(def.key, [...def.fixedDomain]);
      continue;
    }

    let maxValue = 0;
    for (const point of series) {
      if (Number.isFinite(point.value)) {
        maxValue = Math.max(maxValue, point.value);
      }
    }

    const paddingRatio = def.paddingRatio ?? 0.05;
    const upper = maxValue > 0 ? maxValue * (1 + paddingRatio) : 1;
    sparklineDomains.set(def.key, [0, upper]);
  }
}

function getWeekRows(weekIdx) {
  return rowsByWeekIndex.get(weekIdx) ?? [];
}

function computeShannonEntropy(shares) {
  let entropy = 0;
  for (const value of shares.values()) {
    if (value <= 0) continue;
    entropy -= value * Math.log(value);
  }
  return entropy;
}

function parseUtcDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function cacheDomReferences() {
  timelineWeekLabelEl = document.querySelector('[data-role="week-label"]');
  timelineWeekIndexEl = document.querySelector('[data-role="week-index"]');
  timelineRangeEl = document.querySelector('[data-role="week-range"]');
  playPauseButtonEl = document.querySelector('[data-role="play-pause"]');
  legendEl = document.querySelector('[data-role="map-legend"]');
  tooltipEl = document.querySelector('[data-role="map-tooltip"]');
  mapContainerEl = document.querySelector('.map-container');
  sparklineTooltipEl = document.querySelector('[data-role="sparkline-tooltip"]');

  statElements.nonUSShare = document.querySelector('[data-stat="nonUSShare"]');
  statElements.uniqueOrigins = document.querySelector('[data-stat="uniqueOrigins"]');
  statElements.entropy = document.querySelector('[data-stat="entropy"]');
  statElements.collabRate = document.querySelector('[data-stat="collabRate"]');
  statElements.cumulativeOrigins = document.querySelector('[data-stat="cumulativeOrigins"]');

  if (tooltipEl) {
    tooltipEl.hidden = true;
  }
  if (sparklineTooltipEl) {
    sparklineTooltipEl.hidden = true;
  }
}

function setupControls() {
  if (playPauseButtonEl) {
    playPauseButtonEl.addEventListener('click', togglePlayback);
  }

  if (timelineRangeEl) {
    timelineRangeEl.addEventListener('input', (event) => {
      const requestedIndex = Number(event.target.value);
      pause();
      setWeekIndex(requestedIndex);
    });

    const handleScrubStart = () => {
      isScrubbing = true;
      pause();
    };

    const handleScrubEnd = () => {
      isScrubbing = false;
    };

    timelineRangeEl.addEventListener('pointerdown', handleScrubStart);
    timelineRangeEl.addEventListener('pointerup', handleScrubEnd);
    timelineRangeEl.addEventListener('touchstart', handleScrubStart, { passive: true });
    timelineRangeEl.addEventListener('touchend', handleScrubEnd);
    timelineRangeEl.addEventListener('mousedown', handleScrubStart);
    timelineRangeEl.addEventListener('mouseup', handleScrubEnd);
  }

  // TODO: Add keyboard controls (space to toggle, arrows to step through weeks).
  // TODO: Allow adjusting playback speed directly in the UI.
}

function configureTimeline() {
  const totalWeeks = weeks.length;

  if (totalWeeks === 0) {
    currentWeekIndex = 0;
  } else {
    currentWeekIndex = Math.min(currentWeekIndex, totalWeeks - 1);
  }

  if (timelineRangeEl) {
    timelineRangeEl.min = 0;
    timelineRangeEl.max = totalWeeks > 0 ? totalWeeks - 1 : 0;
    timelineRangeEl.step = 1;
    timelineRangeEl.value = String(currentWeekIndex);
    timelineRangeEl.disabled = totalWeeks === 0;
  }

  if (playPauseButtonEl) {
    playPauseButtonEl.disabled = totalWeeks === 0;
  }

  updatePlayButton();
}

function togglePlayback() {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (weeks.length === 0) return;

  if (currentWeekIndex >= weeks.length - 1) {
    setWeekIndex(0);
  }

  if (isPlaying) return;

  isPlaying = true;
  updatePlayButton();

  playTimer = window.setInterval(() => {
    if (isScrubbing) return;
    if (currentWeekIndex >= weeks.length - 1) {
      pause();
      return;
    }
    setWeekIndex(currentWeekIndex + 1);
  }, playSpeedMs);
}

function pause() {
  if (playTimer !== null) {
    window.clearInterval(playTimer);
    playTimer = null;
  }

  if (!isPlaying) {
    updatePlayButton();
    return;
  }

  isPlaying = false;
  updatePlayButton();
}

function updatePlayButton() {
  if (!playPauseButtonEl) return;
  playPauseButtonEl.textContent = isPlaying ? 'Pause' : 'Play';
}

function setWeekIndex(nextIndex) {
  if (weeks.length === 0) {
    currentWeekIndex = 0;
    renderForWeek(currentWeekIndex);
    return;
  }

  const clamped = clampNumber(Number(nextIndex) || 0, 0, weeks.length - 1);
  currentWeekIndex = clamped;
  renderForWeek(currentWeekIndex);
}

function renderForWeek(targetWeekIndex) {
  const totalWeeks = weeks.length;
  if (!timelineWeekLabelEl || !timelineWeekIndexEl) return;

  if (totalWeeks === 0) {
    timelineWeekLabelEl.textContent = 'No data';
    timelineWeekIndexEl.textContent = '0 / 0';
    updateStatValues(null);
    updateSparklineReadouts(0);
    updateSparklineCursors(0);
    updateMapForWeek(targetWeekIndex);
    return;
  }

  const clamped = clampNumber(targetWeekIndex, 0, totalWeeks - 1);
  const weekDate = weeks[clamped];
  const isoDate = weekDate.toISOString().slice(0, 10);

  timelineWeekLabelEl.textContent = isoDate;
  timelineWeekIndexEl.textContent = `${clamped + 1} / ${totalWeeks}`;

  if (timelineRangeEl && String(timelineRangeEl.value) !== String(clamped)) {
    timelineRangeEl.value = String(clamped);
  }

  const metrics = metricsByWeekIndex.get(clamped) ?? null;
  updateStatValues(metrics);
  updateSparklineReadouts(clamped);
  updateSparklineCursors(clamped);
  updateMapForWeek(clamped);
}

function updateStatValues(metrics) {
  const hasMetrics = metrics !== null && typeof metrics === 'object';

  if (statElements.nonUSShare) {
    statElements.nonUSShare.textContent = hasMetrics
      ? formatPercent(metrics.nonUSShare, 1)
      : '—';
  }

  if (statElements.uniqueOrigins) {
    statElements.uniqueOrigins.textContent = hasMetrics
      ? formatInteger(metrics.uniqueOrigins)
      : '—';
  }

  if (statElements.entropy) {
    statElements.entropy.textContent = hasMetrics
      ? formatNumber(metrics.entropy, 2)
      : '—';
  }

  if (statElements.collabRate) {
    statElements.collabRate.textContent = hasMetrics
      ? `${formatNumber(metrics.collabRate, 1)}%`
      : '—';
  }

  if (statElements.cumulativeOrigins) {
    statElements.cumulativeOrigins.textContent = hasMetrics
      ? formatInteger(metrics.cumulativeOriginsSoFar)
      : '—';
  }
}

function updateSparklineReadouts(weekIdx) {
  if (!weeks.length) {
    sparklineValueEls.forEach((el) => {
      if (el) el.textContent = '—';
    });
    return;
  }

  const metrics = metricsByWeekIndex.get(weekIdx) ?? null;
  for (const def of sparklineDefs) {
    const el = sparklineValueEls.get(def.key);
    if (!el) continue;
    const rawValue = def.accessor(metrics);
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      el.textContent = def.formatter(rawValue);
    } else {
      el.textContent = '—';
    }
  }
}

function updateSparklineCursors(weekIdx) {
  if (!sparklineStates.size) return;
  if (!weeks.length) {
    sparklineStates.forEach((state) => {
      state.cursorLine.attr('opacity', 0);
    });
    return;
  }

  const clamped = clampNumber(weekIdx, 0, weeks.length - 1);
  sparklineStates.forEach((state) => {
    const x = state.xScale(clamped);
    state.cursorLine.attr('x1', x).attr('x2', x).attr('opacity', 0.85);
  });
}

function updateMapForWeek(weekIdx) {
  updateChoroplethForWeek(weekIdx);
  updatePinsForWeek(weekIdx);
}

function initializeMap(worldTopo) {
  if (!d3 || !worldTopo) return;

  mapSvgSelection = d3.select('#map');
  if (mapSvgSelection.empty()) return;

  mapWidth = Number(mapSvgSelection.attr('width')) || 960;
  mapHeight = Number(mapSvgSelection.attr('height')) || 540;
  mapSvgSelection.attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`);

  const geojson = feature(worldTopo, worldTopo.objects.countries);
  countryFeatures = geojson.features.filter((f) => {
    const id = String(f.id).padStart(3, '0');
    const name = f.properties?.name;
    return id !== '010' && name !== 'Antarctica';
  });

  countryFeatureByNumericId = new Map(
    countryFeatures
      .map((f) => [Number(f.id), f])
      .filter(([id]) => Number.isFinite(id))
  );

  projection = d3.geoNaturalEarth1().fitSize([mapWidth, mapHeight], { type: 'Sphere' });
  pathGenerator = d3.geoPath(projection);

  choroplethLayer = mapSvgSelection.append('g').attr('data-layer', 'countries');
  choroplethSelection = choroplethLayer
    .selectAll('path')
    .data(countryFeatures, (d) => d.id)
    .join('path')
    .attr('d', pathGenerator)
    .attr('fill', '#e9ecf5')
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.4)
    .attr('vector-effect', 'non-scaling-stroke');

  borderLayer = mapSvgSelection.append('g').attr('data-layer', 'borders');
  const borderMesh = mesh(worldTopo, worldTopo.objects.countries, (a, b) => a !== b);
  borderLayer
    .append('path')
    .attr('d', pathGenerator(borderMesh))
    .attr('fill', 'none')
    .attr('stroke', 'rgba(0,0,0,0.25)')
    .attr('stroke-width', 0.3)
    .attr('vector-effect', 'non-scaling-stroke');

  pinLayer = mapSvgSelection.append('g').attr('data-layer', 'pins');
}

function initializeSparklines() {
  const container = document.querySelector('[data-role="sparklines"]');
  if (!container) return;

  sparklineStates.clear();
  sparklineValueEls.clear();

  for (const def of sparklineDefs) {
    const card = container.querySelector(`[data-sparkline="${def.key}"]`);
    if (!card) continue;

    const valueEl = card.querySelector(`[data-sparkline-value="${def.key}"]`);
    if (valueEl) {
      sparklineValueEls.set(def.key, valueEl);
    }

    const svgElement = card.querySelector('svg');
    if (!svgElement) continue;

    const svg = d3.select(svgElement);
    const width = Number(svg.attr('width')) || 280;
    const height = Number(svg.attr('height')) || 60;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const margin = { top: 6, right: 8, bottom: 14, left: 24 };
    const xDomain = [0, Math.max(0, weeks.length - 1)];

    const xScale = d3.scaleLinear(xDomain, [margin.left, width - margin.right]);
    const domain = sparklineDomains.get(def.key) ?? [0, 1];
    const yScale = d3.scaleLinear(domain, [height - margin.bottom, margin.top]);

    const gridGroup = svg.append('g').attr('class', 'sparkline-grid');
    const yTicks = yScale.ticks(3);
    gridGroup
      .selectAll('line.sparkline-gridline--y')
      .data(yTicks)
      .join('line')
      .attr('class', 'sparkline-gridline sparkline-gridline--y')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d));

    const xTicks = xScale.ticks(Math.min(4, weeks.length || 1));
    gridGroup
      .selectAll('line.sparkline-gridline--x')
      .data(xTicks)
      .join('line')
      .attr('class', 'sparkline-gridline sparkline-gridline--x')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom);

    svg
      .append('line')
      .attr('class', 'sparkline-baseline')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', yScale(domain[0]))
      .attr('y2', yScale(domain[0]));

    const lineGenerator = d3
      .line()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => xScale(d.weekIndex))
      .y((d) => yScale(d.value));

    const series = sparklineSeriesByKey.get(def.key) ?? [];

    svg
      .append('path')
      .datum(series)
      .attr('class', 'sparkline-path')
      .attr('stroke', def.stroke)
      .attr('d', lineGenerator);

    const cursorLine = svg
      .append('line')
      .attr('class', 'sparkline-cursor')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('x1', margin.left)
      .attr('x2', margin.left)
      .attr('opacity', weeks.length ? 0.85 : 0);

    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, height - margin.top - margin.bottom);

    const overlaySelection = svg
      .append('rect')
      .attr('class', 'sparkline-overlay')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    const state = {
      def,
      svg,
      width,
      height,
      margin,
      xScale,
      yScale,
      cursorLine,
    };

    overlaySelection
      .on('pointermove', (event) => handleSparklinePointer(event, state))
      .on('pointerleave', () => handleSparklinePointerLeave())
      .on('click', (event) => handleSparklineClick(event, state));

    sparklineStates.set(def.key, state);
  }
}

function updateChoroplethForWeek(weekIdx) {
  if (!choroplethSelection) return;

  const { normalizedShares, maxShare } = getNormalizedSharesForWeek(weekIdx, EXCLUDE_US);
  const fillByNumericId = new Map();
  for (const [iso, share] of normalizedShares.entries()) {
    const numericId = ISO_TO_NUMERIC_ID[iso];
    if (numericId !== undefined) {
      fillByNumericId.set(numericId, share);
    }
  }

  const domainMax = maxShare > 0 ? maxShare : 0.01;
  choroplethColorScale.domain([0, domainMax]);
  const transition = d3.transition().duration(200);

  choroplethSelection
    .transition(transition)
    .attr('fill', (d) => {
      const share = fillByNumericId.get(Number(d.id)) ?? 0;
      return share > 0 ? choroplethColorScale(share) : '#e9ecf5';
    });

  updateLegend(maxShare);
}

function getNormalizedSharesForWeek(weekIdx, excludeUS = false) {
  const weightMap = rawShareWeightsByWeekIndex.get(weekIdx);
  const totalWeight = totalWeightByWeekIndex.get(weekIdx) ?? 0;

  if (!weightMap || totalWeight <= 0) {
    return { normalizedShares: new Map(), maxShare: 0 };
  }

  let normalizingTotal = totalWeight;
  if (excludeUS) {
    const usWeight = weightMap.get('US') ?? 0;
    normalizingTotal -= usWeight;
  }

  if (normalizingTotal <= 0) {
    return { normalizedShares: new Map(), maxShare: 0 };
  }

  const normalizedShares = new Map();
  let maxShare = 0;

  for (const [iso, weight] of weightMap.entries()) {
    if (excludeUS && iso === 'US') continue;
    const share = weight / normalizingTotal;
    if (share <= 0) continue;
    normalizedShares.set(iso, share);
    maxShare = Math.max(maxShare, share);
  }

  return { normalizedShares, maxShare };
}

function updateLegend(maxShare) {
  if (!legendEl) return;

  legendEl.textContent = '';

  if (!Number.isFinite(maxShare) || maxShare <= 0) {
    const placeholder = document.createElement('span');
    placeholder.textContent = 'No weekly origin data';
    legendEl.appendChild(placeholder);
    return;
  }

  const title = document.createElement('span');
  title.textContent = 'Share';

  const swatchContainer = document.createElement('div');
  swatchContainer.className = 'legend-swatches';

  const steps = 5;
  const values = d3.range(steps).map((i) => (maxShare * i) / (steps - 1));
  values.forEach((value) => {
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = choroplethColorScale(value);
    swatchContainer.appendChild(swatch);
  });

  const minLabel = document.createElement('span');
  minLabel.textContent = '0%';
  const maxLabel = document.createElement('span');
  maxLabel.textContent = formatPercent(maxShare, 1);

  legendEl.appendChild(title);
  legendEl.appendChild(minLabel);
  legendEl.appendChild(swatchContainer);
  legendEl.appendChild(maxLabel);
}

function updatePinsForWeek(targetWeekIdx) {
  if (!pinLayer || !pathGenerator) return;

  const pinsData = computePinsDataset(targetWeekIdx);
  const transition = d3.transition().duration(200);

  const pins = pinLayer.selectAll('circle').data(pinsData, (d) => d.id);

  pins
    .join(
      (enter) =>
        enter
          .append('circle')
          .attr('cx', (d) => d.position[0])
          .attr('cy', (d) => d.position[1])
          .attr('r', 0)
          .attr('fill', (d) => d.color)
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.8)
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('fill-opacity', 0),
      (update) => update,
      (exit) =>
        exit
          .transition(transition)
          .attr('fill-opacity', 0)
          .attr('r', 0)
          .remove()
    )
    .call(bindPinInteractions)
    .transition(transition)
    .attr('cx', (d) => d.position[0])
    .attr('cy', (d) => d.position[1])
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => d.color)
    .attr('fill-opacity', (d) => d.opacity);
}

function computePinsDataset(targetWeekIdx) {
  const results = [];
  if (!weeks.length) return results;

  const start = Math.max(0, targetWeekIdx - WINDOW_WEEKS);
  const end = Math.min(weeks.length - 1, targetWeekIdx + WINDOW_WEEKS);

  for (let idx = start; idx <= end; idx += 1) {
    const weekRows = rowsByWeekIndex.get(idx) ?? [];
    const topRows = weekRows.slice(0, TOP_PIN_N);

    for (const row of topRows) {
      if (!row.origins.length) continue;
      for (const origin of row.origins) {
        const numericId = ISO_TO_NUMERIC_ID[origin];
        if (numericId === undefined) continue;

        const feature = countryFeatureByNumericId.get(numericId);
        if (!feature) continue;

        const centroid = pathGenerator.centroid(feature);
        if (!centroid || centroid.some((value) => !Number.isFinite(value))) continue;

        const radius = Math.max(2, 10 - row.rank * 0.3);
        const weeksAway = Math.abs(idx - targetWeekIdx);
        const ghostOpacity =
          idx === targetWeekIdx
            ? 0.9
            : Math.max(0.05, 0.2 - (0.15 * weeksAway) / (WINDOW_WEEKS + 1));

        results.push({
          id: `${idx}|${row.rank}|${row.name}|${origin}`,
          weekIndex: idx,
          rank: row.rank,
          name: row.name,
          artists: row.artists,
          origins: row.origins,
          origin,
          dateString: row.dateString,
          genre: row.genre,
          radius,
          position: centroid,
          color: genreColorScale(row.genre || 'Unknown'),
          opacity: ghostOpacity,
          isCurrentWeek: idx === targetWeekIdx,
        });
      }
    }
  }

  return results;
}

function bindPinInteractions(selection) {
  selection
    .on('mouseenter', handlePinMouseEnter)
    .on('mouseleave', handlePinMouseLeave)
    .on('mousemove', handlePinMouseMove);
}

function handlePinMouseEnter(event, pin) {
  if (!tooltipEl) return;
  tooltipEl.hidden = false;
  tooltipEl.innerHTML = formatPinTooltip(pin);
  positionTooltip(event);
}

function handlePinMouseMove(event) {
  if (!tooltipEl || tooltipEl.hidden) return;
  positionTooltip(event);
}

function handlePinMouseLeave() {
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
}

function positionTooltip(event) {
  if (!tooltipEl || !mapContainerEl) return;
  const [x, y] = d3.pointer(event, mapContainerEl);
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function handleSparklinePointer(event, state) {
  if (!sparklineTooltipEl || !sparklineSeriesByKey.size) return;
  const weekIdx = findWeekIndexForPointer(event, state);
  if (weekIdx === null) {
    sparklineTooltipEl.hidden = true;
    return;
  }

  const series = sparklineSeriesByKey.get(state.def.key);
  const point = series ? series[weekIdx] : null;
  if (!point || !Number.isFinite(point.value)) {
    sparklineTooltipEl.hidden = true;
    return;
  }

  const label = state.def.label;
  sparklineTooltipEl.hidden = false;
  sparklineTooltipEl.textContent = `${label}: ${state.def.formatter(point.value)} (${point.isoDate})`;
  sparklineTooltipEl.style.left = `${event.clientX + 12}px`;
  sparklineTooltipEl.style.top = `${event.clientY - 16}px`;
}

function handleSparklinePointerLeave() {
  if (sparklineTooltipEl) {
    sparklineTooltipEl.hidden = true;
  }
  updateSparklineCursors(currentWeekIndex);
}

function handleSparklineClick(event, state) {
  const weekIdx = findWeekIndexForPointer(event, state);
  if (weekIdx === null) return;
  setWeekIndex(weekIdx);
}

function findWeekIndexForPointer(event, state) {
  if (!weeks.length) return null;
  const [sx] = d3.pointer(event, state.svg.node());
  const clampedPx = clampNumber(sx, state.margin.left, state.width - state.margin.right);
  const scaledIndex = state.xScale.invert(clampedPx);
  const nearestIdx = clampNumber(Math.round(scaledIndex), 0, weeks.length - 1);
  return nearestIdx;
}

function formatPinTooltip(pin) {
  const primaryArtist = pin.artists && pin.artists.length ? pin.artists[0] : 'Unknown Artist';
  const originLabel = pin.origins && pin.origins.length ? pin.origins.join(', ') : '—';
  return `
    <strong>#${pin.rank} · ${pin.name}</strong><br />
    ${primaryArtist}<br />
    Origins: [${originLabel}]<br />
    Week: ${pin.dateString}
  `.trim();
}

function formatPercent(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value * 100, decimals)}%`;
}

function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}

function formatInteger(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toString();
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function exposeForDebugging() {
  window.BillboardOrigins = {
    weeks,
    weekIndex,
    rows,
    rowsByWeekIndex,
    metricsByWeekIndex,
    rawShareWeightsByWeekIndex,
    totalWeightByWeekIndex,
    sparklineDefs,
    sparklineSeriesByKey,
    constants: {
      TOP_METRICS_N,
      TOP_PIN_N,
      WINDOW_WEEKS,
      playSpeedMs,
      EXCLUDE_US,
    },
    getWeekRows,
    setWeekIndex,
    play,
    pause,
    renderForWeek,
    updateMapForWeek,
    ISO_TO_NUMERIC_ID,
  };
}

init();

export {
  weeks,
  weekIndex,
  rows,
  rowsByWeekIndex,
  metricsByWeekIndex,
  rawShareWeightsByWeekIndex,
  totalWeightByWeekIndex,
  sparklineDefs,
  sparklineSeriesByKey,
  TOP_METRICS_N,
  TOP_PIN_N,
  WINDOW_WEEKS,
  EXCLUDE_US,
  getWeekRows,
  renderForWeek,
  setWeekIndex,
  play,
  pause,
};
