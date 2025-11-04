import {
  feature,
  mesh,
} from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

const d3 = window.d3;

const DATA_URL = "../data/processed/billboard_full.ndjson";
const WORLD_URL = "./data/world-110m.json";
const START_DATE_STR = "1980-01-01";
const IGNORED_CODES = new Set([
  "XW",
  "XE",
  "AF",
  "EU",
  "AS",
  "OC",
  "NA",
  "SA",
  "XX",
  "ZZ",
  "AQ",
]);

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
    key: "nonUSShare",
    label: "Non-US Share",
    accessor: (metrics) => (metrics ? metrics.nonUSShare ?? null : null),
    formatter: (value) => formatPercent(value, 1),
    stroke: "#3a6fd8",
    fixedDomain: [0, 1],
  },
  {
    key: "uniqueOrigins",
    label: "Unique Origins",
    accessor: (metrics) => (metrics ? metrics.uniqueOrigins ?? null : null),
    formatter: (value) => formatInteger(value),
    stroke: "#1ca37a",
    paddingRatio: 0.08,
  },
  {
    key: "entropy",
    label: "Shannon Entropy H",
    accessor: (metrics) => (metrics ? metrics.entropy ?? null : null),
    formatter: (value) => formatNumber(value, 2),
    stroke: "#c25594",
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
const DEFAULT_PLAYBACK_SPEED_MS = 200;

let currentWeekIndex = 0;
let isPlaying = false;
let playSpeedMs = DEFAULT_PLAYBACK_SPEED_MS;
let playTimer = null;
let isScrubbing = false;

let timelineWeekLabelEl = null;
let timelineWeekIndexEl = null;
let timelineRangeEl = null;
let playPauseButtonEl = null;
let legendEl = null;
let pinLegendEl = null;
let tooltipEl = null;
let mapContainerEl = null;
let sparklineTooltipEl = null;
let choroplethModeSelectEl = null;
let pinColorModeSelectEl = null;
let excludeUsCheckboxEl = null;
let playbackSpeedSelectEl = null;
let topPinCountInputEl = null;
let windowWeeksInputEl = null;

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
let currentChoroplethMode = "weekly-share";
let currentPinColorMode = "origin-region";
let excludeUs = EXCLUDE_US;
let topPinN = TOP_PIN_N;
let windowWeeks = WINDOW_WEEKS;

const choroplethColorScale = d3
  .scaleSequential((t) => d3.interpolateBlues(0.15 + 0.85 * t))
  .domain([0, 1]);
const neutralPinColor = "#444";

const regionColors = {
  Africa: "#1f77b4",
  Americas: "#ff7f0e",
  Asia: "#2ca02c",
  Europe: "#d62728",
  Oceania: "#9467bd",
  "Middle East": "#8c564b",
  Other: "#7f7f7f",
};

const regionMapping = {
  US: "Americas",
  PR: "Americas",
  CA: "Americas",
  MX: "Americas",
  BR: "Americas",
  AR: "Americas",
  CL: "Americas",
  CO: "Americas",
  PE: "Americas",
  VE: "Americas",
  UY: "Americas",
  CR: "Americas",
  JM: "Americas",
  GB: "Europe",
  UK: "Europe",
  IE: "Europe",
  FR: "Europe",
  DE: "Europe",
  ES: "Europe",
  IT: "Europe",
  NL: "Europe",
  BE: "Europe",
  SE: "Europe",
  NO: "Europe",
  FI: "Europe",
  DK: "Europe",
  CH: "Europe",
  AT: "Europe",
  GR: "Europe",
  PT: "Europe",
  PL: "Europe",
  UA: "Europe",
  RU: "Europe",
  KR: "Asia",
  CN: "Asia",
  TW: "Asia",
  JP: "Asia",
  IN: "Asia",
  PK: "Asia",
  BD: "Asia",
  LK: "Asia",
  TH: "Asia",
  VN: "Asia",
  ID: "Asia",
  SG: "Asia",
  HK: "Asia",
  MY: "Asia",
  PH: "Asia",
  AU: "Oceania",
  NZ: "Oceania",
  SA: "Middle East",
  AE: "Middle East",
  QA: "Middle East",
  KW: "Middle East",
  BH: "Middle East",
  OM: "Middle East",
  IL: "Middle East",
  TR: "Middle East",
  ZA: "Africa",
  NG: "Africa",
  GH: "Africa",
  CI: "Africa",
  EG: "Africa",
  MA: "Africa",
  DZ: "Africa",
  TN: "Africa",
  ET: "Africa",
  KE: "Africa",
  SN: "Africa",
};

const superGenreOrder = [
  "Pop",
  "Hip-Hop/Rap",
  "Rock/Metal",
  "Electronic/Dance",
  "R&B/Soul/Funk",
  "Country/Folk/Americana",
  "Latin",
  "Reggae/Caribbean",
  "Jazz/Blues",
  "Other/Unknown",
];
const superGenreScale = d3
  .scaleOrdinal(
    superGenreOrder,
    d3.schemeTableau10.concat(["#999", "#c7a212", "#1f9393"])
  )
  .unknown("#888ba1");

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
    renderPinLegend();

    configureTimeline();
    renderForWeek(currentWeekIndex);

    console.log("Sample normalized rows:", rows.slice(0, 5));
    console.log("First three weeks:", weeks.slice(0, 3));
    console.log(
      "First three weekly metrics:",
      Array.from(metricsByWeekIndex.entries())
        .slice(0, 3)
        .map(([idx, metrics]) => ({ weekIndex: idx, metrics }))
    );

    exposeForDebugging();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

async function loadNdjson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch NDJSON (${response.status}): ${response.statusText}`
    );
  }
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn("Skipping invalid NDJSON line:", error);
        return null;
      }
    })
    .filter(Boolean);
}

async function loadWorldTopoJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch world topology (${response.status}): ${response.statusText}`
    );
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

    const name =
      typeof raw.name === "string" && raw.name.trim() ? raw.name : "Unknown";
    const artists = Array.isArray(raw.artists)
      ? raw.artists.filter((a) => typeof a === "string" && a.trim())
      : typeof raw.artist === "string" && raw.artist.trim()
      ? [raw.artist]
      : [];

    const genreCandidates = Array.isArray(raw.genres)
      ? raw.genres.filter((g) => typeof g === "string" && g.trim())
      : [];
    const genre = genreCandidates.length ? genreCandidates[0] : "Unknown";

    const originCandidates = Array.isArray(raw.country)
      ? raw.country
      : typeof raw.country === "string"
      ? [raw.country]
      : [];

    const origins = originCandidates
      .map((code) =>
        typeof code === "string" ? code.trim().toUpperCase() : null
      )
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
  const sortedWeekIndices = Array.from(rowsByWeekIndex.keys()).sort(
    (a, b) => a - b
  );

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

    const usShare = normalizedShares.get("US") ?? 0;
    const nonUSShare = totalWeight > 0 ? 1 - usShare : 0;
    const uniqueOrigins = normalizedShares.size;
    const entropy = computeShannonEntropy(normalizedShares);

    const collabRate =
      topRows.length > 0
        ? Math.round((collabCount / topRows.length) * 1000) / 10
        : 0;

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
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? rawValue
          : null;
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
  pinLegendEl = document.querySelector('[data-role="pin-legend"]');
  tooltipEl = document.querySelector('[data-role="map-tooltip"]');
  mapContainerEl = document.querySelector(".map-container");
  sparklineTooltipEl = document.querySelector(
    '[data-role="sparkline-tooltip"]'
  );
  choroplethModeSelectEl = document.querySelector(
    '[data-role="choropleth-mode"]'
  );
  pinColorModeSelectEl = document.querySelector('[data-role="pin-color-mode"]');
  excludeUsCheckboxEl = document.querySelector('[data-role="exclude-us"]');
  playbackSpeedSelectEl = document.querySelector(
    '[data-role="playback-speed"]'
  );
  topPinCountInputEl = document.querySelector('[data-role="top-pin-count"]');
  windowWeeksInputEl = document.querySelector('[data-role="window-weeks"]');

  statElements.nonUSShare = document.querySelector('[data-stat="nonUSShare"]');
  statElements.uniqueOrigins = document.querySelector(
    '[data-stat="uniqueOrigins"]'
  );
  statElements.entropy = document.querySelector('[data-stat="entropy"]');
  statElements.collabRate = document.querySelector('[data-stat="collabRate"]');
  statElements.cumulativeOrigins = document.querySelector(
    '[data-stat="cumulativeOrigins"]'
  );

  if (tooltipEl) {
    tooltipEl.hidden = true;
  }
  if (sparklineTooltipEl) {
    sparklineTooltipEl.hidden = true;
  }

  if (choroplethModeSelectEl) {
    choroplethModeSelectEl.value = currentChoroplethMode;
  }
  if (pinColorModeSelectEl) {
    pinColorModeSelectEl.value = currentPinColorMode;
  }
  if (excludeUsCheckboxEl) {
    excludeUsCheckboxEl.checked = excludeUs;
  }
  if (playbackSpeedSelectEl) {
    playbackSpeedSelectEl.value = String(playSpeedMs);
  }
  if (topPinCountInputEl) {
    topPinCountInputEl.value = String(topPinN);
  }
  if (windowWeeksInputEl) {
    windowWeeksInputEl.value = String(windowWeeks);
  }
}

function setupControls() {
  if (playPauseButtonEl) {
    playPauseButtonEl.addEventListener("click", togglePlayback);
  }

  if (timelineRangeEl) {
    timelineRangeEl.addEventListener("input", (event) => {
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

    timelineRangeEl.addEventListener("pointerdown", handleScrubStart);
    timelineRangeEl.addEventListener("pointerup", handleScrubEnd);
    timelineRangeEl.addEventListener("touchstart", handleScrubStart, {
      passive: true,
    });
    timelineRangeEl.addEventListener("touchend", handleScrubEnd);
    timelineRangeEl.addEventListener("mousedown", handleScrubStart);
    timelineRangeEl.addEventListener("mouseup", handleScrubEnd);
  }

  if (choroplethModeSelectEl) {
    choroplethModeSelectEl.addEventListener("change", (event) => {
      currentChoroplethMode = event.target.value;
      updateMapForWeek(currentWeekIndex);
    });
  }

  if (pinColorModeSelectEl) {
    pinColorModeSelectEl.addEventListener("change", (event) => {
      currentPinColorMode = event.target.value;
      renderPinLegend();
      updatePinsForWeek(currentWeekIndex);
    });
  }

  if (excludeUsCheckboxEl) {
    excludeUsCheckboxEl.addEventListener("change", (event) => {
      excludeUs = event.target.checked;
      updateMapForWeek(currentWeekIndex);
    });
  }

  if (playbackSpeedSelectEl) {
    playbackSpeedSelectEl.addEventListener("change", (event) => {
      updatePlaybackSpeed(event.target.value);
    });
  }

  if (topPinCountInputEl) {
    const handleTopPinChange = () =>
      updateTopPinCount(topPinCountInputEl.value);
    topPinCountInputEl.addEventListener("change", handleTopPinChange);
    topPinCountInputEl.addEventListener("input", handleTopPinChange);
  }

  if (windowWeeksInputEl) {
    const handleWindowWeeksChange = () =>
      updateWindowWeeks(windowWeeksInputEl.value);
    windowWeeksInputEl.addEventListener("change", handleWindowWeeksChange);
    windowWeeksInputEl.addEventListener("input", handleWindowWeeksChange);
  }

  // TODO: Add keyboard controls (space to toggle, arrows to step through weeks).

  renderPinLegend();
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
  startPlaybackTimer();
}

function pause() {
  stopPlaybackTimer();

  if (!isPlaying) {
    updatePlayButton();
    return;
  }

  isPlaying = false;
  updatePlayButton();
}

function startPlaybackTimer() {
  stopPlaybackTimer();
  playTimer = window.setInterval(() => {
    if (isScrubbing) return;
    if (currentWeekIndex >= weeks.length - 1) {
      pause();
      return;
    }
    setWeekIndex(currentWeekIndex + 1);
  }, playSpeedMs);
}

function stopPlaybackTimer() {
  if (playTimer !== null) {
    window.clearInterval(playTimer);
    playTimer = null;
  }
}

function restartPlaybackTimer() {
  if (!isPlaying) return;
  startPlaybackTimer();
}

function updatePlaybackSpeed(newSpeed) {
  const next = clampNumber(
    Number(newSpeed) || DEFAULT_PLAYBACK_SPEED_MS,
    50,
    2000
  );
  playSpeedMs = next;
  if (playbackSpeedSelectEl) {
    playbackSpeedSelectEl.value = String(playSpeedMs);
  }
  if (isPlaying) {
    restartPlaybackTimer();
  }
  return playSpeedMs;
}

function updateTopPinCount(newValue) {
  const rounded = Math.round(Number(newValue));
  const next = clampNumber(
    Number.isFinite(rounded) ? rounded : TOP_PIN_N,
    1,
    50
  );
  topPinN = next;
  if (topPinCountInputEl) {
    topPinCountInputEl.value = String(topPinN);
  }
  renderPinLegend();
  updatePinsForWeek(currentWeekIndex);
  return topPinN;
}

function updateWindowWeeks(newValue) {
  const rounded = Math.round(Number(newValue));
  const next = clampNumber(
    Number.isFinite(rounded) ? rounded : WINDOW_WEEKS,
    0,
    26
  );
  windowWeeks = next;
  if (windowWeeksInputEl) {
    windowWeeksInputEl.value = String(windowWeeks);
  }
  updatePinsForWeek(currentWeekIndex);
  return windowWeeks;
}

function updatePlayButton() {
  if (!playPauseButtonEl) return;
  playPauseButtonEl.textContent = isPlaying ? "Pause" : "Play";
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
    timelineWeekLabelEl.textContent = "No data";
    timelineWeekIndexEl.textContent = "0 / 0";
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
  const hasMetrics = metrics !== null && typeof metrics === "object";

  if (statElements.nonUSShare) {
    statElements.nonUSShare.textContent = hasMetrics
      ? formatPercent(metrics.nonUSShare, 1)
      : "—";
  }

  if (statElements.uniqueOrigins) {
    statElements.uniqueOrigins.textContent = hasMetrics
      ? formatInteger(metrics.uniqueOrigins)
      : "—";
  }

  if (statElements.entropy) {
    statElements.entropy.textContent = hasMetrics
      ? formatNumber(metrics.entropy, 2)
      : "—";
  }

  if (statElements.collabRate) {
    statElements.collabRate.textContent = hasMetrics
      ? `${formatNumber(metrics.collabRate, 1)}%`
      : "—";
  }

  if (statElements.cumulativeOrigins) {
    statElements.cumulativeOrigins.textContent = hasMetrics
      ? formatInteger(metrics.cumulativeOriginsSoFar)
      : "—";
  }
}

function updateSparklineReadouts(weekIdx) {
  if (!weeks.length) {
    sparklineValueEls.forEach((el) => {
      if (el) el.textContent = "—";
    });
    return;
  }

  const metrics = metricsByWeekIndex.get(weekIdx) ?? null;
  for (const def of sparklineDefs) {
    const el = sparklineValueEls.get(def.key);
    if (!el) continue;
    const rawValue = def.accessor(metrics);
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      el.textContent = def.formatter(rawValue);
    } else {
      el.textContent = "—";
    }
  }
}

function updateSparklineCursors(weekIdx) {
  if (!sparklineStates.size) return;
  if (!weeks.length) {
    sparklineStates.forEach((state) => {
      state.cursorLine.attr("opacity", 0);
    });
    return;
  }

  const clamped = clampNumber(weekIdx, 0, weeks.length - 1);
  sparklineStates.forEach((state) => {
    const x = state.xScale(clamped);
    state.cursorLine.attr("x1", x).attr("x2", x).attr("opacity", 0.85);
  });
}

function updateMapForWeek(weekIdx) {
  updateChoroplethForWeek(weekIdx, currentChoroplethMode, excludeUs);
  updatePinsForWeek(weekIdx);
}

function initializeMap(worldTopo) {
  if (!d3 || !worldTopo) return;

  mapSvgSelection = d3.select("#map");
  if (mapSvgSelection.empty()) return;

  mapWidth = Number(mapSvgSelection.attr("width")) || 960;
  mapHeight = Number(mapSvgSelection.attr("height")) || 540;
  mapSvgSelection
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const geojson = feature(worldTopo, worldTopo.objects.countries);
  countryFeatures = geojson.features.filter((f) => {
    const id = String(f.id).padStart(3, "0");
    const name = f.properties?.name;
    return id !== "010" && name !== "Antarctica";
  });

  countryFeatureByNumericId = new Map(
    countryFeatures
      .map((f) => [Number(f.id), f])
      .filter(([id]) => Number.isFinite(id))
  );

  projection = d3.geoNaturalEarth1().precision(0.1);
  projection.scale(1).translate([0, 0]);
  pathGenerator = d3.geoPath(projection);

  const collection = { type: "FeatureCollection", features: countryFeatures };
  const bounds = pathGenerator.bounds(collection);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  const xMid = (bounds[0][0] + bounds[1][0]) / 2;
  const yMid = (bounds[0][1] + bounds[1][1]) / 2;

  const scale = 1.02 * Math.min(mapWidth / dx, mapHeight / dy);
  const translate = [mapWidth / 2 - scale * xMid, mapHeight / 2 - scale * yMid];

  projection = projection.scale(scale).translate(translate);
  pathGenerator = d3.geoPath(projection);

  choroplethLayer = mapSvgSelection.append("g").attr("data-layer", "countries");
  choroplethSelection = choroplethLayer
    .selectAll("path")
    .data(countryFeatures, (d) => d.id)
    .join("path")
    .attr("d", pathGenerator)
    .attr("fill", "#e9ecf5")
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.4)
    .attr("vector-effect", "non-scaling-stroke");

  borderLayer = mapSvgSelection.append("g").attr("data-layer", "borders");
  const borderMesh = mesh(
    worldTopo,
    worldTopo.objects.countries,
    (a, b) => a !== b
  );
  borderLayer
    .append("path")
    .attr("d", pathGenerator(borderMesh))
    .attr("fill", "none")
    .attr("stroke", "rgba(0,0,0,0.25)")
    .attr("stroke-width", 0.3)
    .attr("vector-effect", "non-scaling-stroke");

  pinLayer = mapSvgSelection.append("g").attr("data-layer", "pins");
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

    const svgElement = card.querySelector("svg");
    if (!svgElement) continue;

    const svg = d3.select(svgElement);
    const width = Number(svg.attr("width")) || 280;
    const height = Number(svg.attr("height")) || 60;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const margin = { top: 6, right: 8, bottom: 14, left: 24 };
    const xDomain = [0, Math.max(0, weeks.length - 1)];

    const xScale = d3.scaleLinear(xDomain, [margin.left, width - margin.right]);
    const domain = sparklineDomains.get(def.key) ?? [0, 1];
    const yScale = d3.scaleLinear(domain, [height - margin.bottom, margin.top]);

    const gridGroup = svg.append("g").attr("class", "sparkline-grid");
    const yTicks = yScale.ticks(3);
    gridGroup
      .selectAll("line.sparkline-gridline--y")
      .data(yTicks)
      .join("line")
      .attr("class", "sparkline-gridline sparkline-gridline--y")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d));

    const xTicks = xScale.ticks(Math.min(4, weeks.length || 1));
    gridGroup
      .selectAll("line.sparkline-gridline--x")
      .data(xTicks)
      .join("line")
      .attr("class", "sparkline-gridline sparkline-gridline--x")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    svg
      .append("line")
      .attr("class", "sparkline-baseline")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", yScale(domain[0]))
      .attr("y2", yScale(domain[0]));

    const lineGenerator = d3
      .line()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => xScale(d.weekIndex))
      .y((d) => yScale(d.value));

    const series = sparklineSeriesByKey.get(def.key) ?? [];

    svg
      .append("path")
      .datum(series)
      .attr("class", "sparkline-path")
      .attr("stroke", def.stroke)
      .attr("d", lineGenerator);

    const cursorLine = svg
      .append("line")
      .attr("class", "sparkline-cursor")
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .attr("x1", margin.left)
      .attr("x2", margin.left)
      .attr("opacity", weeks.length ? 0.85 : 0);

    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, height - margin.top - margin.bottom);

    const overlaySelection = svg
      .append("rect")
      .attr("class", "sparkline-overlay")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", innerWidth)
      .attr("height", innerHeight);

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
      .on("pointermove", (event) => handleSparklinePointer(event, state))
      .on("pointerleave", () => handleSparklinePointerLeave())
      .on("click", (event) => handleSparklineClick(event, state));

    sparklineStates.set(def.key, state);
  }
}

function updateChoroplethForWeek(
  weekIdx,
  mode = currentChoroplethMode,
  excludeUsCurrent = excludeUs
) {
  if (!choroplethSelection) return;

  const clamped = clampNumber(weekIdx, 0, Math.max(0, weeks.length - 1));
  const { normalizedShares, maxShare } = getNormalizedSharesForWeek(
    clamped,
    mode,
    excludeUsCurrent
  );
  const fillByNumericId = new Map();
  for (const [iso, share] of normalizedShares.entries()) {
    const numericId = ISO_TO_NUMERIC_ID[iso];
    if (numericId !== undefined) {
      fillByNumericId.set(numericId, share);
    }
  }

  const domainMax = maxShare > 0 ? maxShare : 0.01;
  if (mode !== "first-activation") {
    choroplethColorScale.domain([0, domainMax]);
  }

  const transition = d3.transition().duration(200);

  choroplethSelection.transition(transition).attr("fill", (d) => {
    const share = fillByNumericId.get(Number(d.id)) ?? 0;
    if (mode === "first-activation") {
      return share > 0 ? "#1f9393" : "#e9ecf5";
    }
    const clampedShare = Math.min(share, domainMax);
    return clampedShare > 0 ? choroplethColorScale(clampedShare) : "#e9ecf5";
  });

  updateLegend(maxShare, mode);
}

function getWeeklyShares(weekIdx, excludeUsCurrent) {
  const weightMap = rawShareWeightsByWeekIndex.get(weekIdx);
  const totalWeight = totalWeightByWeekIndex.get(weekIdx) ?? 0;
  if (!weightMap || totalWeight <= 0) return null;

  let denominator = totalWeight;
  if (excludeUsCurrent) {
    denominator -= weightMap.get("US") ?? 0;
  }
  if (denominator <= 0) return null;

  const shares = new Map();
  weightMap.forEach((weight, iso) => {
    if (excludeUsCurrent && iso === "US") return;
    if (weight <= 0) return;
    shares.set(iso, weight / denominator);
  });

  return shares;
}

function getNormalizedSharesForWeek(
  weekIdx,
  mode = "weekly-share",
  excludeUsCurrent = false
) {
  if (mode === "first-activation") {
    const activated = new Map();
    for (let i = 0; i <= weekIdx; i += 1) {
      const weekShares = getWeeklyShares(i, excludeUsCurrent);
      if (!weekShares) continue;
      weekShares.forEach((share, iso) => {
        if (share > 0) {
          activated.set(iso, 1);
        }
      });
    }
    return { normalizedShares: activated, maxShare: 1 };
  }

  if (mode === "cumulative-share") {
    const cumulative = new Map();
    for (let i = 0; i <= weekIdx; i += 1) {
      const weekShares = getWeeklyShares(i, excludeUsCurrent);
      if (!weekShares) continue;
      weekShares.forEach((share, iso) => {
        cumulative.set(iso, (cumulative.get(iso) ?? 0) + share);
      });
    }

    if (!cumulative.size) {
      return { normalizedShares: new Map(), maxShare: 0 };
    }

    const values = Array.from(cumulative.values()).filter((value) => value > 0);
    if (!values.length) {
      return { normalizedShares: new Map(), maxShare: 0 };
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const percentileIndex = Math.floor(sorted.length * 0.95);
    const percentileValue =
      sorted[Math.min(sorted.length - 1, percentileIndex)];
    const maxShare = percentileValue || sorted[sorted.length - 1];

    return { normalizedShares: cumulative, maxShare };
  }

  const weeklyShares = getWeeklyShares(weekIdx, excludeUsCurrent);
  if (!weeklyShares || !weeklyShares.size) {
    return { normalizedShares: new Map(), maxShare: 0 };
  }

  let maxShare = 0;
  weeklyShares.forEach((share) => {
    maxShare = Math.max(maxShare, share);
  });
  return { normalizedShares: weeklyShares, maxShare };
}

function updateLegend(maxShare, mode = "weekly-share") {
  if (!legendEl) return;

  legendEl.textContent = "";

  if (mode === "first-activation") {
    const container = document.createElement("div");
    container.className = "legend-swatches";

    const offSwatch = document.createElement("span");
    offSwatch.className = "legend-swatch";
    offSwatch.style.width = "20px";
    offSwatch.style.height = "14px";
    offSwatch.style.background = "#e9ecf5";
    container.appendChild(offSwatch);

    const offLabel = document.createElement("span");
    offLabel.textContent = "Not activated";
    container.appendChild(offLabel);

    const onSwatch = document.createElement("span");
    onSwatch.className = "legend-swatch";
    onSwatch.style.width = "20px";
    onSwatch.style.height = "14px";
    onSwatch.style.background = "#1f9393";
    onSwatch.style.marginLeft = "0.75rem";
    container.appendChild(onSwatch);

    const onLabel = document.createElement("span");
    onLabel.textContent = "Activated";
    container.appendChild(onLabel);

    legendEl.appendChild(container);
    return;
  }

  if (!Number.isFinite(maxShare) || maxShare <= 0) {
    const placeholder = document.createElement("span");
    placeholder.textContent = "No origin data";
    legendEl.appendChild(placeholder);
    return;
  }

  const title = document.createElement("span");
  title.textContent =
    mode === "cumulative-share" ? "Cumulative share" : "Weekly share";

  const swatchContainer = document.createElement("div");
  swatchContainer.className = "legend-swatches";

  const steps = 5;
  const values = d3.range(steps).map((i) => (maxShare * i) / (steps - 1));
  values.forEach((value) => {
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = choroplethColorScale(value);
    swatchContainer.appendChild(swatch);
  });

  const minLabel = document.createElement("span");
  minLabel.textContent = mode === "cumulative-share" ? "0" : "0%";
  const maxLabel = document.createElement("span");
  maxLabel.textContent =
    mode === "cumulative-share"
      ? formatNumber(maxShare, 2)
      : formatPercent(maxShare, 1);

  legendEl.appendChild(title);
  legendEl.appendChild(minLabel);
  legendEl.appendChild(swatchContainer);
  legendEl.appendChild(maxLabel);
}

function updatePinsForWeek(targetWeekIdx) {
  if (!pinLayer || !pathGenerator) return;

  const pinsData = computePinsDataset(targetWeekIdx);
  const transition = d3.transition().duration(200);

  const pins = pinLayer.selectAll("circle").data(pinsData, (d) => d.id);

  pins
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("cx", (d) => d.position[0])
          .attr("cy", (d) => d.position[1])
          .attr("r", 0)
          .attr("fill", (d) => d.color)
          .attr("stroke", (d) => d.strokeColor)
          .attr("stroke-width", (d) => d.strokeWidth)
          .attr("vector-effect", "non-scaling-stroke")
          .attr("fill-opacity", 0),
      (update) => update,
      (exit) =>
        exit
          .transition(transition)
          .attr("fill-opacity", 0)
          .attr("r", 0)
          .remove()
    )
    .call(bindPinInteractions)
    .transition(transition)
    .attr("cx", (d) => d.position[0])
    .attr("cy", (d) => d.position[1])
    .attr("r", (d) => d.radius)
    .attr("fill", (d) => d.color)
    .attr("stroke", (d) => d.strokeColor)
    .attr("stroke-width", (d) => d.strokeWidth)
    .attr("fill-opacity", (d) => d.opacity);
}

function computePinsDataset(targetWeekIdx) {
  const results = [];
  if (!weeks.length) return results;

  const clampedTarget = clampNumber(targetWeekIdx, 0, weeks.length - 1);

  const start = Math.max(0, clampedTarget - windowWeeks);
  const end = Math.min(weeks.length - 1, clampedTarget + windowWeeks);

  for (let idx = start; idx <= end; idx += 1) {
    const weekRows = rowsByWeekIndex.get(idx) ?? [];
    const topRows = weekRows.slice(0, topPinN);

    for (const row of topRows) {
      if (!row.origins.length) continue;
      for (const origin of row.origins) {
        const numericId = ISO_TO_NUMERIC_ID[origin];
        if (numericId === undefined) continue;

        const feature = countryFeatureByNumericId.get(numericId);
        if (!feature) continue;

        const centroid = pathGenerator.centroid(feature);
        if (!centroid || centroid.some((value) => !Number.isFinite(value)))
          continue;

        const radius = Math.max(2, 10 - row.rank * 0.3);
        const weeksAway = Math.abs(idx - clampedTarget);
        const ghostOpacity =
          idx === clampedTarget
            ? 0.9
            : Math.max(0.05, 0.2 - (0.15 * weeksAway) / (windowWeeks + 1));

        const primaryOrigin = row.origins[0] ?? origin;
        const color = getPinColor(row, primaryOrigin, currentPinColorMode);
        const strokeColor = row.origins.length >= 2 ? "#ffffff" : "#222222";
        const strokeWidth = row.origins.length >= 2 ? 1.4 : 0.8;

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
          color,
          strokeColor,
          strokeWidth,
          opacity: ghostOpacity,
          isCurrentWeek: idx === clampedTarget,
        });
      }
    }
  }

  return results;
}

function getPinColor(row, origin, mode) {
  if (mode === "none") {
    return neutralPinColor;
  }

  if (mode === "genre-supergroup") {
    const superGenre = toSuperGenre(row.genre);
    return superGenreScale(superGenre);
  }

  const region = regionMapping[origin] ?? "Other";
  return regionColors[region] ?? regionColors.Other;
}

function bindPinInteractions(selection) {
  selection
    .on("mouseenter", handlePinMouseEnter)
    .on("mouseleave", handlePinMouseLeave)
    .on("mousemove", handlePinMouseMove);
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
  sparklineTooltipEl.textContent = `${label}: ${state.def.formatter(
    point.value
  )} (${point.isoDate})`;
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
  const clampedPx = clampNumber(
    sx,
    state.margin.left,
    state.width - state.margin.right
  );
  const scaledIndex = state.xScale.invert(clampedPx);
  const nearestIdx = clampNumber(Math.round(scaledIndex), 0, weeks.length - 1);
  return nearestIdx;
}

function formatPinTooltip(pin) {
  const primaryArtist =
    pin.artists && pin.artists.length ? pin.artists[0] : "Unknown Artist";
  const originLabel =
    pin.origins && pin.origins.length ? pin.origins.join(", ") : "—";
  const genre = pin.genre || "Unknown";
  return `
    <strong>#${pin.rank} · ${pin.name}</strong><br />
    ${primaryArtist}<br />
    Origins: [${originLabel}]<br />
    Week: ${pin.dateString}<br />
    Genre: ${genre}
  `.trim();
}

function formatPercent(value, decimals = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value * 100, decimals)}%`;
}

function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatInteger(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toString();
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function renderPinLegend() {
  if (!pinLegendEl) return;
  pinLegendEl.textContent = "";

  const heading = document.createElement("div");
  heading.className = "legend-heading";
  if (currentPinColorMode === "origin-region") {
    heading.textContent = "Pin color · Origin region";
  } else if (currentPinColorMode === "genre-supergroup") {
    heading.textContent = "Pin color · Genre supergroup";
  } else {
    heading.textContent = "Pin color · None";
  }
  pinLegendEl.appendChild(heading);

  let items = [];
  if (currentPinColorMode === "genre-supergroup") {
    items = superGenreOrder.map((label) => ({
      label,
      color: superGenreScale(label),
    }));
  } else if (currentPinColorMode === "origin-region") {
    items = Object.keys(regionColors).map((label) => ({
      label,
      color: regionColors[label],
    }));
  } else {
    items = [{ label: "Neutral", color: neutralPinColor }];
  }

  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "pin-legend-item";

    const swatch = document.createElement("span");
    swatch.className = "pin-legend-swatch";
    swatch.style.background = item.color;

    const label = document.createElement("span");
    label.textContent = item.label;

    el.appendChild(swatch);
    el.appendChild(label);
    pinLegendEl.appendChild(el);
  });
}

function toSuperGenre(genre) {
  const s = (genre || "Unknown").toLowerCase();
  if (
    s.includes("hip hop") ||
    s.includes("rap") ||
    s.includes("drill") ||
    s.includes("trap") ||
    s.includes("grime")
  ) {
    return "Hip-Hop/Rap";
  }
  if (
    s.includes("rock") ||
    s.includes("metal") ||
    s.includes("punk") ||
    s.includes("grunge") ||
    s.includes("emo")
  ) {
    return "Rock/Metal";
  }
  if (
    s.includes("edm") ||
    s.includes("electro") ||
    s.includes("house") ||
    s.includes("trance") ||
    s.includes("techno") ||
    s.includes("dance") ||
    s.includes("dubstep") ||
    s.includes("euro")
  ) {
    return "Electronic/Dance";
  }
  if (
    s.includes("r&b") ||
    s.includes("soul") ||
    s.includes("motown") ||
    s.includes("funk") ||
    s.includes("quiet storm")
  ) {
    return "R&B/Soul/Funk";
  }
  if (
    s.includes("country") ||
    s.includes("americana") ||
    s.includes("bluegrass") ||
    s.includes("folk")
  ) {
    return "Country/Folk/Americana";
  }
  if (
    s.includes("latin") ||
    s.includes("reggaeton") ||
    s.includes("bachata") ||
    s.includes("merengue") ||
    s.includes("cumbia") ||
    s.includes("vallenato") ||
    s.includes("español")
  ) {
    return "Latin";
  }
  if (
    s.includes("reggae") ||
    s.includes("dancehall") ||
    s.includes("soca") ||
    s.includes("calypso") ||
    s.includes("ragga")
  ) {
    return "Reggae/Caribbean";
  }
  if (s.includes("jazz") || s.includes("swing") || s.includes("bossa")) {
    return "Jazz/Blues";
  }
  if (s.includes("pop")) {
    return "Pop";
  }
  return "Other/Unknown";
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
      defaultPlaybackSpeedMs: DEFAULT_PLAYBACK_SPEED_MS,
      EXCLUDE_US,
    },
    state: {
      getChoroplethMode: () => currentChoroplethMode,
      setChoroplethMode: (mode) => {
        currentChoroplethMode = mode;
        if (choroplethModeSelectEl) {
          choroplethModeSelectEl.value = mode;
        }
        updateMapForWeek(currentWeekIndex);
      },
      getPinColorMode: () => currentPinColorMode,
      setPinColorMode: (mode) => {
        currentPinColorMode = mode;
        if (pinColorModeSelectEl) {
          pinColorModeSelectEl.value = mode;
        }
        renderPinLegend();
        updatePinsForWeek(currentWeekIndex);
      },
      getExcludeUs: () => excludeUs,
      setExcludeUs: (value) => {
        excludeUs = Boolean(value);
        if (excludeUsCheckboxEl) {
          excludeUsCheckboxEl.checked = excludeUs;
        }
        updateMapForWeek(currentWeekIndex);
      },
      getPlaybackSpeed: () => playSpeedMs,
      setPlaybackSpeed: (value) => updatePlaybackSpeed(value),
      getTopPinCount: () => topPinN,
      setTopPinCount: (value) => updateTopPinCount(value),
      getWindowWeeks: () => windowWeeks,
      setWindowWeeks: (value) => updateWindowWeeks(value),
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
