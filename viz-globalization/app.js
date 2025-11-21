import {
  feature,
  mesh,
} from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import {
  DEFAULT_FEATURE_KEY,
  FEATURE_COLOR_MAP,
  FEATURE_GRADIENT_MAP,
} from "./config.js";

const d3 = window.d3;

const DATA_URL = "../data/processed/billboard_full.ndjson";
const WORLD_URL = "./data/world-110m.json";
const START_DATE = new Date("1980-01-01T00:00:00Z");
const END_DATE = new Date("2020-12-31T23:59:59Z");
const BASELINE_END = new Date("1989-12-31T23:59:59Z");
const DEFAULT_WINDOW = 52;
const DEFAULT_TOP_N = 8;
const PLAYBACK_INTERVAL_MS = 200;
const DEFAULT_TICK_INTERVAL_WEEKS = 26;
const VALID_TICK_INTERVALS = new Set([1, 4, 26, 52]);
const ENABLE_FEATURE_HOTSPOTS = false;
const NO_DATA_FILL = "#d8dce9";

const FEATURE_OPTIONS = [
  {
    key: "acousticness",
    label: "Acousticness",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.acousticness,
    gradient: getFeatureGradient("acousticness"),
  },
  {
    key: "danceability",
    label: "Danceability",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.danceability,
    gradient: getFeatureGradient("danceability"),
  },
  {
    key: "energy",
    label: "Energy",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.energy,
    gradient: getFeatureGradient("energy"),
  },
  {
    key: "loudness",
    label: "Loudness (dB)",
    domain: [-25, 5],
    formatter: (value) =>
      Number.isFinite(value) ? `${formatNumber(value, 1)} dB` : "—",
    color: FEATURE_COLOR_MAP.loudness,
    gradient: getFeatureGradient("loudness"),
  },
  {
    key: "valence",
    label: "Valence",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.valence,
    gradient: getFeatureGradient("valence"),
  },
  {
    key: "instrumentalness",
    label: "Instrumentalness",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 3),
    color: FEATURE_COLOR_MAP.instrumentalness,
    gradient: getFeatureGradient("instrumentalness"),
  },
  {
    key: "speechiness",
    label: "Speechiness",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.speechiness,
    gradient: getFeatureGradient("speechiness"),
  },
  {
    key: "liveness",
    label: "Liveness",
    domain: [0, 1],
    formatter: (value) => formatNumber(value, 2),
    color: FEATURE_COLOR_MAP.liveness,
    gradient: getFeatureGradient("liveness"),
  },
  {
    key: "tempo",
    label: "Tempo",
    domain: [60, 180],
    formatter: (value) =>
      Number.isFinite(value) ? `${Math.round(value)} BPM` : "—",
    color: FEATURE_COLOR_MAP.tempo,
    gradient: getFeatureGradient("tempo"),
  },
];

const FEATURE_LOOKUP = new Map(
  FEATURE_OPTIONS.map((option) => [option.key, option])
);

const sparklineDefs = [
  {
    key: "globalFeature",
    seriesKey: "global",
    label: "Global feature level",
    stroke: "#3a6fd8",
  },
  {
    key: "usFeature",
    seriesKey: "us",
    label: "US feature level",
    stroke: "#c25594",
  },
  {
    key: "spreadFeature",
    seriesKey: "spread",
    label: "Feature spread",
    stroke: "#1ca37a",
  },
];

const rows = [];
const weeks = [];
const weekIndex = new Map();
const rowsByWeekIndex = new Map();
const isoCodesInData = new Set();

let weeklyFeatureMetrics = new Map();
let featureSparklineSeries = new Map();
let baselinesByFeature = new Map();
let latestAggregation = null;

let mapSvgSelection = null;
let choroplethSelection = null;
let borderSelection = null;
let projection = null;
let pathGenerator = null;
let mapWidth = 960;
let mapHeight = 540;
let worldGeo = null;
let borderGeo = null;
let mapResizeObserver = null;
let hasWindowResizeListener = false;

const sparklineStates = new Map();
const sparklineValueEls = new Map();

let timelineRangeEl = null;
let timelineLabelEl = null;
let timelineIndexEl = null;
let playPauseButtonEl = null;
let tickIntervalSelectEl = null;

let mapSummaryEl = null;
let mapLegendEl = null;
let divergenceLegendEl = null;
let mapTooltipEl = null;
let hotspotDescriptionEl = null;
let hotspotContainerEl = null;
let mapContainerEl = null;

const statElements = {
  globalAverage: null,
  usAverage: null,
  activeCountries: null,
  topExporter: null,
  fastestMover: null,
};

const dom = {
  featureSelect: null,
  mapModeSelect: null,
  aggregationSelect: null,
  highlightInput: null,
  normalizeCheckbox: null,
  weekRange: null,
  playButton: null,
};

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const isoNameOverrides = {
  US: "United States of America",
  GB: "United Kingdom",
  KR: "South Korea",
  KP: "North Korea",
  TR: "Turkey",
  CI: "Côte d'Ivoire",
  CZ: "Czechia",
  CD: "Dem. Rep. Congo",
  CG: "Congo",
  PS: "Palestine",
  LA: "Laos",
  MM: "Myanmar",
  SY: "Syria",
  IR: "Iran",
  IQ: "Iraq",
  BO: "Bolivia",
  BN: "Brunei",
  TL: "Timor-Leste",
  TZ: "Tanzania",
  VE: "Venezuela",
  HK: "Hong Kong",
  SG: "Singapore",
};
const normalizedNameIndex = new Map();
const isoToFeatureId = new Map();
const featureIdToIso = new Map();
const featureIdToName = new Map();

const state = {
  selectedFeatureKey: DEFAULT_FEATURE_KEY,
  mapMode: "absolute",
  aggregationWindow: DEFAULT_WINDOW,
  highlightCount: DEFAULT_TOP_N,
  normalizeTracks: false,
  currentWeekIndex: 0,
  isPlaying: false,
  tickIntervalWeeks: DEFAULT_TICK_INTERVAL_WEEKS,
  playTimer: null,
  isScrubbing: false,
};

async function init() {
  try {
    cacheDomReferences();
    attachControlHandlers();
    setupFeatureSyncBridge();

    const [ndjson, worldTopo] = await Promise.all([
      loadNdjson(DATA_URL),
      loadWorldTopoJSON(WORLD_URL),
    ]);

    normalizeRows(ndjson);
    buildWeekLookups();
    buildRowsByWeek();
    buildWeeklyFeatureSummaries();
    computeBaselines();

    initializeMap(worldTopo);
    initializeSparklines();
    configureTimeline();
    updateMapSummary();

    if (weeks.length) {
      renderForWeek(state.currentWeekIndex);
    } else {
      updateTimelineLabels(null);
      updateStatPanel(null);
    }
  } catch (error) {
    console.error("Feature explorer failed to initialize", error);
  }
}

function cacheDomReferences() {
  dom.featureSelect = document.querySelector("[data-role=feature-select]");
  dom.mapModeSelect = document.querySelector("[data-role=map-mode]");
  dom.aggregationSelect = document.querySelector(
    "[data-role=aggregation-window]"
  );
  dom.highlightInput = document.querySelector("[data-role=top-exporter-count]");
  dom.normalizeCheckbox = document.querySelector(
    "[data-role=normalize-track-count]"
  );
  dom.weekRange = document.querySelector("[data-role=week-range]");
  dom.playButton = document.querySelector("[data-role=play-pause]");
  tickIntervalSelectEl = document.querySelector("[data-role=tick-interval]");
  timelineRangeEl = dom.weekRange;
  timelineLabelEl = document.querySelector("[data-role=week-label]");
  timelineIndexEl = document.querySelector("[data-role=week-index]");
  playPauseButtonEl = dom.playButton;
  mapSummaryEl = document.querySelector("[data-role=map-summary]");
  mapLegendEl = document.querySelector("[data-role=map-legend]");
  divergenceLegendEl = document.querySelector("[data-role=divergence-legend]");
  mapTooltipEl = document.querySelector("[data-role=map-tooltip]");
  mapContainerEl = document.querySelector(".map-container");
  hotspotDescriptionEl = document.querySelector(
    "[data-role=hotspot-description]"
  );
  hotspotContainerEl = document.querySelector("[data-role=pin-legend]");
  if (!ENABLE_FEATURE_HOTSPOTS && hotspotContainerEl) {
    hotspotContainerEl.style.display = "none";
  }

  statElements.globalAverage = document.querySelector(
    "[data-stat=globalAverage]"
  );
  statElements.usAverage = document.querySelector("[data-stat=usAverage]");
  statElements.activeCountries = document.querySelector(
    "[data-stat=activeCountries]"
  );
  statElements.topExporter = document.querySelector("[data-stat=topExporter]");
  statElements.fastestMover = document.querySelector(
    "[data-stat=fastestMover]"
  );

  sparklineDefs.forEach((def) => {
    const el = document.querySelector(`[data-sparkline-value=${def.key}]`);
    if (el) {
      sparklineValueEls.set(def.key, el);
    }
  });
}

function attachControlHandlers() {
  if (dom.featureSelect) {
    dom.featureSelect.value = state.selectedFeatureKey;
  }
  if (dom.mapModeSelect) {
    dom.mapModeSelect.value = state.mapMode;
    dom.mapModeSelect.disabled = true;
  }
  if (dom.aggregationSelect) {
    dom.aggregationSelect.value = String(state.aggregationWindow);
    dom.aggregationSelect.disabled = true;
  }
  if (dom.highlightInput) {
    dom.highlightInput.value = String(state.highlightCount);
  }
  if (dom.normalizeCheckbox) {
    dom.normalizeCheckbox.checked = state.normalizeTracks;
    dom.normalizeCheckbox.disabled = true;
  }

  if (dom.featureSelect) {
    dom.featureSelect.addEventListener("change", (event) => {
      setSelectedFeature(event.target.value);
    });
  }

  if (dom.mapModeSelect && !dom.mapModeSelect.disabled) {
    dom.mapModeSelect.addEventListener("change", (event) => {
      state.mapMode = event.target.value || "absolute";
      updateMapSummary();
      renderForWeek(state.currentWeekIndex);
    });
  }

  if (dom.aggregationSelect && !dom.aggregationSelect.disabled) {
    dom.aggregationSelect.addEventListener("change", (event) => {
      const value = Number(event.target.value) || DEFAULT_WINDOW;
      state.aggregationWindow = clampNumber(value, 1, 52);
      renderForWeek(state.currentWeekIndex);
    });
  }

  if (dom.highlightInput) {
    dom.highlightInput.addEventListener("change", (event) => {
      const next = Number(event.target.value) || DEFAULT_TOP_N;
      state.highlightCount = clampNumber(next, 3, 20);
      renderForWeek(state.currentWeekIndex);
    });
  }

  if (dom.normalizeCheckbox && !dom.normalizeCheckbox.disabled) {
    dom.normalizeCheckbox.addEventListener("change", (event) => {
      state.normalizeTracks = event.target.checked;
      renderForWeek(state.currentWeekIndex);
    });
  }

  if (dom.weekRange) {
    dom.weekRange.addEventListener("input", (event) => {
      state.isScrubbing = true;
      const idx = Number(event.target.value) || 0;
      setWeekIndex(idx);
    });
    dom.weekRange.addEventListener("change", () => {
      state.isScrubbing = false;
    });
  }

  if (dom.playButton) {
    dom.playButton.addEventListener("click", () => togglePlayback());
  }

  if (tickIntervalSelectEl) {
    tickIntervalSelectEl.addEventListener("change", (event) => {
      const interval = normalizeTickInterval(event.target.value);
      state.tickIntervalWeeks = interval;
      updateTimelineStep();
      if (state.isPlaying) {
        restartPlaybackTimer();
      }
    });
  }
}

function setupFeatureSyncBridge() {
  window.addEventListener("message", (event) => {
    if (!event || typeof event.data !== "object") return;
    const { type, feature: nextFeature } = event.data;
    if (type === "global-feature-change" && typeof nextFeature === "string") {
      setSelectedFeature(nextFeature);
    }
  });
}

function setSelectedFeature(nextKey) {
  if (!FEATURE_LOOKUP.has(nextKey)) return;
  const changed = state.selectedFeatureKey !== nextKey;
  state.selectedFeatureKey = nextKey;
  if (dom.featureSelect && dom.featureSelect.value !== nextKey) {
    dom.featureSelect.value = nextKey;
  }
  if (!changed) return;
  updateMapSummary();
  updateSparklinesForFeature();
  renderForWeek(state.currentWeekIndex);
}

async function loadNdjson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch NDJSON ${response.status}`);
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
        console.warn("Skipping malformed NDJSON line", error);
        return null;
      }
    })
    .filter(Boolean);
}

async function loadWorldTopoJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load world map ${response.status}`);
  }
  return response.json();
}

function normalizeRows(rawRows) {
  for (const raw of rawRows) {
    if (!raw || !raw.date) continue;

    const date = new Date(`${raw.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date < START_DATE || date > END_DATE) {
      continue;
    }

    const rank = Number(raw.rank);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;

    const origins = Array.isArray(raw.country)
      ? raw.country
          .map((code) =>
            typeof code === "string" ? code.trim().toUpperCase() : null
          )
          .filter((code) => code && !code.startsWith("X"))
      : [];
    if (!origins.length) continue;
    origins.forEach((iso) => isoCodesInData.add(iso));

    const featureValues = {};
    FEATURE_OPTIONS.forEach((option) => {
      const rawValue = Number(raw[option.key]);
      featureValues[option.key] = Number.isFinite(rawValue) ? rawValue : null;
    });

    const dateString = date.toISOString().slice(0, 10);
    rows.push({
      date,
      dateString,
      weekIndex: -1,
      rank,
      origins,
      featureValues,
    });

    if (!weekIndex.has(dateString)) {
      weekIndex.set(dateString, null);
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
    if (idx !== undefined) {
      row.weekIndex = idx;
    }
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

  for (const [, weekRows] of rowsByWeekIndex.entries()) {
    weekRows.sort((a, b) => a.rank - b.rank);
  }
}

function buildWeeklyFeatureSummaries() {
  weeklyFeatureMetrics = new Map();
  featureSparklineSeries = new Map();

  FEATURE_OPTIONS.forEach((option) => {
    featureSparklineSeries.set(option.key, {
      global: [],
      us: [],
      spread: [],
    });
  });

  weeks.forEach((date, idx) => {
    const weekRows = rowsByWeekIndex.get(idx) ?? [];
    const summary = computeFeatureTotalsForRows(weekRows, false);
    weeklyFeatureMetrics.set(idx, summary);

    FEATURE_OPTIONS.forEach((option) => {
      const perFeature = summary.perFeature[option.key];
      const series = featureSparklineSeries.get(option.key);
      const point = {
        weekIndex: idx,
        date,
        value: perFeature.globalAvg,
      };
      series.global.push(point);
      series.us.push({ weekIndex: idx, date, value: perFeature.usAvg });
      series.spread.push({ weekIndex: idx, date, value: perFeature.spread });
    });
  });
}

function computeBaselines() {
  baselinesByFeature = new Map();
  FEATURE_OPTIONS.forEach((option) => {
    baselinesByFeature.set(option.key, new Map());
  });

  FEATURE_OPTIONS.forEach((option) => {
    const totals = new Map();
    for (const row of rows) {
      if (row.date > BASELINE_END) continue;
      const value = row.featureValues[option.key];
      if (!Number.isFinite(value)) continue;
      const weight = Math.max(1, 101 - row.rank);
      const perOriginWeight = weight / row.origins.length;
      row.origins.forEach((iso) => {
        if (iso.startsWith("X")) return;
        let bucket = totals.get(iso);
        if (!bucket) {
          bucket = { sum: 0, weight: 0 };
          totals.set(iso, bucket);
        }
        bucket.sum += value * perOriginWeight;
        bucket.weight += perOriginWeight;
      });
    }
    const baselineMap = baselinesByFeature.get(option.key);
    totals.forEach((bucket, iso) => {
      if (bucket.weight > 0) {
        baselineMap.set(iso, bucket.sum / bucket.weight);
      }
    });
  });
}

function initializeMap(worldTopo) {
  if (!d3) return;
  stripAntarctica(worldTopo);
  worldGeo = feature(worldTopo, worldTopo.objects.countries);
  mapSvgSelection = d3.select("#map");
  const { width, height } = getMapDimensions();
  mapWidth = width;
  mapHeight = height;
  mapSvgSelection
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  projection = d3.geoNaturalEarth1().fitSize([mapWidth, mapHeight], worldGeo);
  pathGenerator = d3.geoPath(projection);

  normalizedNameIndex.clear();
  worldGeo.features.forEach((feat) => {
    const normalized = normalizeName(feat.properties.name);
    normalizedNameIndex.set(normalized, feat);
    featureIdToName.set(feat.id, feat.properties.name);
  });

  choroplethSelection = mapSvgSelection
    .append("g")
    .selectAll("path")
    .data(worldGeo.features)
    .join("path")
    .attr("d", pathGenerator)
    .attr("fill", NO_DATA_FILL)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .on("pointermove", (event, d) => handleMapPointer(event, d))
    .on("pointerleave", () => hideMapTooltip());

  borderGeo = mesh(worldTopo, worldTopo.objects.countries, (a, b) => a !== b);
  borderSelection = mapSvgSelection
    .append("path")
    .attr("class", "map-borders")
    .attr("d", pathGenerator(borderGeo))
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,0.6)")
    .attr("stroke-width", 0.6);

  if (typeof ResizeObserver !== "undefined" && mapContainerEl) {
    if (mapResizeObserver) {
      mapResizeObserver.disconnect();
    }
    mapResizeObserver = new ResizeObserver(() => handleMapResize());
    mapResizeObserver.observe(mapContainerEl);
  } else if (!hasWindowResizeListener) {
    window.addEventListener("resize", handleMapResize);
    hasWindowResizeListener = true;
  }
}

function stripAntarctica(worldTopo) {
  const geometries = worldTopo?.objects?.countries?.geometries;
  if (!Array.isArray(geometries)) return;
  worldTopo.objects.countries.geometries = geometries.filter(
    (geom) => geom.properties?.name !== "Antarctica"
  );
}

function getMapDimensions() {
  if (!mapContainerEl) {
    return { width: 960, height: 540 };
  }
  const rect = mapContainerEl.getBoundingClientRect();
  const width = Math.max(320, rect.width || 0);
  const height = Math.max(240, rect.height || rect.width * 0.55 || 0);
  return { width, height };
}

function handleMapResize() {
  if (!mapSvgSelection || !worldGeo) return;
  const { width, height } = getMapDimensions();
  if (width === mapWidth && height === mapHeight) return;
  mapWidth = width;
  mapHeight = height;
  mapSvgSelection
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
  projection = d3.geoNaturalEarth1().fitSize([mapWidth, mapHeight], worldGeo);
  pathGenerator = d3.geoPath(projection);
  if (choroplethSelection) {
    choroplethSelection.attr("d", pathGenerator);
  }
  if (borderSelection && borderGeo) {
    borderSelection.attr("d", pathGenerator(borderGeo));
  }
}

function configureTimeline() {
  if (!timelineRangeEl) return;
  const total = weeks.length;
  timelineRangeEl.min = 0;
  timelineRangeEl.max = total > 0 ? total - 1 : 0;
  timelineRangeEl.value = String(state.currentWeekIndex);
  timelineRangeEl.disabled = total === 0;
  updateTimelineStep();

  if (playPauseButtonEl) {
    playPauseButtonEl.disabled = total === 0;
    updatePlayButton();
  }

  if (tickIntervalSelectEl) {
    tickIntervalSelectEl.value = String(state.tickIntervalWeeks);
  }
}

function updateTimelineStep() {
  if (!timelineRangeEl) return;
  timelineRangeEl.step = state.tickIntervalWeeks;
}

function updateMapSummary() {
  if (!mapSummaryEl) return;
  const feature = FEATURE_LOOKUP.get(state.selectedFeatureKey);
  const modeLabel =
    state.mapMode === "change"
      ? "Change since the 1980s baseline"
      : state.mapMode === "divergence"
      ? "Difference from US artists"
      : "Average level";
  mapSummaryEl.textContent = `Viewing ${
    feature?.label ?? "feature"
  } · ${modeLabel}`;
}

function renderForWeek(targetWeek) {
  if (!weeks.length) {
    updateTimelineLabels(null);
    updateStatPanel(null);
    updateSparklineReadouts(null);
    updateSparklineCursors(null);
    if (ENABLE_FEATURE_HOTSPOTS) {
      updateHotspots(null);
    }
    updateMap(null);
    return;
  }

  const clamped = clampNumber(targetWeek ?? 0, 0, weeks.length - 1);
  state.currentWeekIndex = clamped;

  if (timelineRangeEl && Number(timelineRangeEl.value) !== clamped) {
    timelineRangeEl.value = String(clamped);
  }

  updateTimelineLabels(weeks[clamped]);
  updateSparklineReadouts(clamped);
  updateSparklineCursors(clamped);
  updateMap(clamped);
}

function updateTimelineLabels(date) {
  if (!timelineLabelEl) return;
  if (!date) {
    timelineLabelEl.textContent = "No data";
    if (timelineIndexEl) {
      timelineIndexEl.textContent = "";
    }
    return;
  }

  const isoWeek = getIsoWeek(date);
  timelineLabelEl.textContent = `${isoWeek.year} · Week ${String(
    isoWeek.week
  ).padStart(2, "0")}`;
  if (timelineIndexEl) {
    timelineIndexEl.textContent = `${state.currentWeekIndex + 1}`;
  }
}

function getIsoWeek(date) {
  const tmp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week: weekNum };
}

function computeFeatureTotalsForRows(weekRows, useRankWeight) {
  const perFeature = {};
  const activeCountries = new Set();
  FEATURE_OPTIONS.forEach((option) => {
    perFeature[option.key] = {
      sum: 0,
      weight: 0,
      sumSquares: 0,
      usSum: 0,
      usWeight: 0,
      globalAvg: null,
      usAvg: null,
      spread: null,
    };
  });

  for (const row of weekRows) {
    const rowWeight = useRankWeight ? Math.max(1, 101 - row.rank) : 1;
    if (rowWeight <= 0) continue;
    row.origins.forEach((iso) => activeCountries.add(iso));
    for (const option of FEATURE_OPTIONS) {
      const value = row.featureValues[option.key];
      if (!Number.isFinite(value)) continue;
      const bucket = perFeature[option.key];
      bucket.sum += value * rowWeight;
      bucket.weight += rowWeight;
      bucket.sumSquares += value * value * rowWeight;
      if (row.origins.includes("US")) {
        bucket.usSum += value * rowWeight;
        bucket.usWeight += rowWeight;
      }
    }
  }

  FEATURE_OPTIONS.forEach((option) => {
    const bucket = perFeature[option.key];
    const globalAvg = bucket.weight > 0 ? bucket.sum / bucket.weight : null;
    const usAvg = bucket.usWeight > 0 ? bucket.usSum / bucket.usWeight : null;
    const spread =
      bucket.weight > 0
        ? Math.sqrt(
            Math.max(
              0,
              bucket.sumSquares / bucket.weight - (globalAvg ?? 0) ** 2
            )
          )
        : null;
    bucket.globalAvg = globalAvg;
    bucket.usAvg = usAvg;
    bucket.spread = spread;
  });

  return {
    perFeature,
    activeCountryCount: activeCountries.size,
  };
}

function computeFeatureWindowAggregation(weekIdx) {
  const featureKey = state.selectedFeatureKey;
  const option = FEATURE_LOOKUP.get(featureKey);
  const countryValues = new Map();
  let globalSum = 0;
  let globalWeight = 0;
  let sumSquares = 0;
  let usSum = 0;
  let usWeight = 0;

  const end = clampNumber(weekIdx, 0, weeks.length - 1);
  const start = Math.max(0, end - state.aggregationWindow + 1);

  for (let idx = start; idx <= end; idx += 1) {
    const weekRows = rowsByWeekIndex.get(idx) ?? [];
    for (const row of weekRows) {
      const value = row.featureValues[featureKey];
      if (!Number.isFinite(value)) continue;
      const baseWeight = state.normalizeTracks
        ? 1
        : Math.max(1, 101 - row.rank);
      if (baseWeight <= 0) continue;
      const origins = row.origins.filter((iso) => !iso.startsWith("X"));
      if (!origins.length) continue;

      globalSum += value * baseWeight;
      globalWeight += baseWeight;
      sumSquares += value * value * baseWeight;
      if (origins.includes("US")) {
        usSum += value * baseWeight;
        usWeight += baseWeight;
      }

      const perOriginWeight = baseWeight / origins.length;
      origins.forEach((iso) => {
        let entry = countryValues.get(iso);
        if (!entry) {
          entry = { valueSum: 0, weightSum: 0, trackCount: 0 };
          countryValues.set(iso, entry);
        }
        entry.valueSum += value * perOriginWeight;
        entry.weightSum += perOriginWeight;
        entry.trackCount += 1;
      });
    }
  }

  const normalized = new Map();
  countryValues.forEach((entry, iso) => {
    if (entry.weightSum <= 0) return;
    normalized.set(iso, {
      value: entry.valueSum / entry.weightSum,
      weight: entry.weightSum,
      trackCount: entry.trackCount,
    });
  });

  const globalAvg = globalWeight > 0 ? globalSum / globalWeight : null;
  const usAvg = usWeight > 0 ? usSum / usWeight : null;
  const spread =
    globalWeight > 0
      ? Math.sqrt(
          Math.max(0, sumSquares / globalWeight - (globalAvg ?? 0) ** 2)
        )
      : null;

  return {
    featureKey,
    option,
    start,
    end,
    globalAvg,
    usAvg,
    spread,
    countryValues: normalized,
  };
}

function updateMap(weekIdx) {
  if (weekIdx === null || weekIdx === undefined || !weeks.length) {
    latestAggregation = null;
    if (choroplethSelection) {
      choroplethSelection.attr("fill", NO_DATA_FILL);
    }
    updateLegend(null);
    updateStatPanel(null);
    if (ENABLE_FEATURE_HOTSPOTS) {
      updateHotspots(null);
    }
    return;
  }

  latestAggregation = computeFeatureWindowAggregation(weekIdx);
  const { countryValues } = latestAggregation;
  const mapValues = new Map();
  const baselineMap = baselinesByFeature.get(latestAggregation.featureKey);

  countryValues.forEach((entry, iso) => {
    let value = entry.value;
    if (state.mapMode === "change") {
      const baseline = baselineMap?.get(iso);
      if (Number.isFinite(baseline)) {
        value = entry.value - baseline;
      } else {
        value = null;
      }
    } else if (state.mapMode === "divergence") {
      if (Number.isFinite(latestAggregation.usAvg)) {
        value = entry.value - latestAggregation.usAvg;
      } else {
        value = null;
      }
    }
    if (Number.isFinite(value)) {
      mapValues.set(iso, value);
    }
  });

  if (!mapValues.size) {
    if (choroplethSelection) {
      choroplethSelection.attr("fill", NO_DATA_FILL);
    }
    updateLegend(null);
    updateStatPanel(latestAggregation);
    if (ENABLE_FEATURE_HOTSPOTS) {
      updateHotspots(null);
    }
    return;
  }

  const colorizer = buildColorScale(mapValues);
  const fillValues = new Map();

  mapValues.forEach((value, iso) => {
    const featureId = resolveFeatureIdForIso(iso);
    if (!featureId) return;
    fillValues.set(featureId, colorizer.scale(value));
  });

  if (choroplethSelection) {
    choroplethSelection.attr("fill", (d) => fillValues.get(d.id) ?? NO_DATA_FILL);
  }

  updateLegend(colorizer);
  updateStatPanel(latestAggregation);
  if (ENABLE_FEATURE_HOTSPOTS) {
    updateHotspots({ values: mapValues, colorizer });
  }
}

function buildColorScale(mapValues) {
  const option = FEATURE_LOOKUP.get(state.selectedFeatureKey);
  const values = Array.from(mapValues.values());
  const gradient = option?.gradient ?? getFeatureGradient(option?.key);
  const [gradientLow, gradientHigh] = gradient ?? ["#dbeafe", "#1d4e00"];

  if (state.mapMode === "absolute") {
    const baseDomain = option?.domain ?? [0, 1];
    const [minValue, maxValue] = deriveSequentialDomain(values, baseDomain);
    const scale = d3
      .scaleSequential()
      .domain([minValue, maxValue])
      .clamp(true)
      .interpolator((t) => {
        const eased = Math.max(0, Math.min(1, t));
        return d3.interpolateLab(gradientLow, gradientHigh)(eased);
      });
    return {
      type: "single",
      domain: [minValue, (minValue + maxValue) / 2, maxValue],
      scale,
      featureColor: gradientHigh,
    };
  }

  const rangeSpan = option ? option.domain[1] - option.domain[0] : 1;
  const fallback = rangeSpan > 0 ? rangeSpan * 0.25 : 0.25;
  const maxAbs = values.length
    ? Math.max(...values.map((v) => Math.abs(v)))
    : 0;
  const domainMax = maxAbs > 0 ? maxAbs : fallback;

  const positiveColor = gradientHigh;
  const negativeColor = gradientLow;
  const neutralColor = mixColors(gradientLow, gradientHigh, 0.5);

  const scale = d3
    .scaleDiverging([-domainMax, 0, domainMax])
    .interpolator((value) => {
      if (value <= 0) {
        return d3.interpolateLab(
          neutralColor,
          negativeColor
        )(Math.abs(value) / domainMax);
      }
      return d3.interpolateLab(
        neutralColor,
        positiveColor
      )(value / domainMax);
    })
    .clamp(true);
  return {
    type: "diverging",
    domain: [-domainMax, 0, domainMax],
    scale,
    featureColor,
  };
}

function updateLegend(config) {
  if (!mapLegendEl || !divergenceLegendEl) return;
  mapLegendEl.textContent = "";
  divergenceLegendEl.textContent = "";
  if (!config) {
    mapLegendEl.textContent = "No data";
    return;
  }

  const formatter =
    FEATURE_LOOKUP.get(state.selectedFeatureKey)?.formatter ??
    ((v) => formatNumber(v, 2));
  const labelFormatter =
    state.mapMode === "absolute" ? formatter : (value) => formatDelta(value);

  const [minValue, midValue, maxValue] = config.domain;
  const steps = 7;
  const swatchContainer = document.createElement("div");
  swatchContainer.className = "legend-swatches";
  d3.range(steps).forEach((idx) => {
    const value = minValue + (idx / (steps - 1)) * (maxValue - minValue);
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = config.scale(value);
    swatchContainer.appendChild(swatch);
  });

  const minLabel = document.createElement("span");
  minLabel.textContent = labelFormatter(minValue);
  const maxLabel = document.createElement("span");
  maxLabel.textContent = labelFormatter(maxValue);

  const gradientRow = document.createElement("div");
  gradientRow.className = "legend-gradient";
  gradientRow.appendChild(minLabel);
  gradientRow.appendChild(swatchContainer);
  gradientRow.appendChild(maxLabel);

  const noDataLegend = document.createElement("div");
  noDataLegend.className = "legend-no-data";
  const noDataSwatch = document.createElement("span");
  noDataSwatch.className = "legend-swatch legend-swatch--no-data";
  noDataSwatch.style.background = NO_DATA_FILL;
  const noDataLabel = document.createElement("span");
  noDataLabel.textContent = "No data";
  noDataLegend.appendChild(noDataSwatch);
  noDataLegend.appendChild(noDataLabel);

  mapLegendEl.appendChild(gradientRow);
  mapLegendEl.appendChild(noDataLegend);

  const additionalText =
    state.mapMode === "absolute"
      ? ""
      : state.mapMode === "divergence"
      ? "Cooler colors = lower vs US · Warmer = higher"
      : "Cooler colors = below 1980s · Warmer = above";
  divergenceLegendEl.textContent = additionalText;
}

function updateStatPanel(aggregation) {
  if (!aggregation) {
    Object.values(statElements).forEach((el) => {
      if (el) el.textContent = "—";
    });
    return;
  }

  const option = FEATURE_LOOKUP.get(aggregation.featureKey);
  const formatter = option?.formatter ?? ((value) => formatNumber(value, 2));

  if (statElements.globalAverage) {
    statElements.globalAverage.textContent = formatter(aggregation.globalAvg);
  }
  if (statElements.usAverage) {
    statElements.usAverage.textContent = formatter(aggregation.usAvg);
  }
  if (statElements.activeCountries) {
    statElements.activeCountries.textContent = String(
      aggregation.countryValues.size
    );
  }

  const entries = Array.from(aggregation.countryValues.entries()).filter(
    ([iso]) => Boolean(resolveFeatureIdForIso(iso))
  );

  if (statElements.topExporter) {
    if (entries.length) {
      entries.sort(
        (a, b) => (b[1].value ?? -Infinity) - (a[1].value ?? -Infinity)
      );
      const [iso, info] = entries[0];
      statElements.topExporter.textContent = `${formatCountryName(
        iso
      )} · ${formatter(info.value)}`;
    } else {
      statElements.topExporter.textContent = "—";
    }
  }

  if (statElements.fastestMover) {
    statElements.fastestMover.textContent = "—";
  }
}

function updateHotspots(payload) {
  if (!hotspotDescriptionEl) return;
  hotspotDescriptionEl.textContent = "";
  if (!payload || !payload.values || !payload.values.size) {
    hotspotDescriptionEl.textContent = "No active origins in this window.";
    return;
  }
  const entries = Array.from(payload.values.entries())
    .map(([iso, value]) => ({
      iso,
      value,
      sortValue: state.mapMode === "absolute" ? value : Math.abs(value),
    }))
    .filter((entry) => Boolean(resolveFeatureIdForIso(entry.iso)))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, state.highlightCount);

  const valueFormatter =
    state.mapMode === "absolute"
      ? (value) => formatFeatureValue(value)
      : formatDelta;

  entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "pin-legend-item";
    item.textContent = `${index + 1}. ${formatCountryName(
      entry.iso
    )} · ${valueFormatter(entry.value)}`;
    hotspotDescriptionEl.appendChild(item);
  });
}

function updateSparklineReadouts(weekIdx) {
  const perFeatureSeries = featureSparklineSeries.get(state.selectedFeatureKey);
  if (!perFeatureSeries) {
    sparklineDefs.forEach((def) => {
      const el = sparklineValueEls.get(def.key);
      if (el) el.textContent = "—";
    });
    return;
  }
  sparklineDefs.forEach((def) => {
    const el = sparklineValueEls.get(def.key);
    if (!el) return;
    if (weekIdx === null || weekIdx === undefined) {
      el.textContent = "—";
      return;
    }
    const series = perFeatureSeries[def.seriesKey];
    const point = series[weekIdx];
    el.textContent = point ? formatFeatureValue(point.value) : "—";
  });
}

function formatFeatureValue(value) {
  const option = FEATURE_LOOKUP.get(state.selectedFeatureKey);
  if (!option) return formatNumber(value, 2);
  return option.formatter ? option.formatter(value) : formatNumber(value, 2);
}

function initializeSparklines() {
  if (!d3 || !weeks.length) return;
  sparklineDefs.forEach((def) => {
    const card = document.querySelector(`[data-sparkline=${def.key}]`);
    if (!card) return;
    const svg = d3.select(card).select("svg");
    const chartEl = card.querySelector(".sparkline-chart");
    const chartRect = chartEl?.getBoundingClientRect();
    const width =
      chartRect && chartRect.width && Number.isFinite(chartRect.width)
        ? chartRect.width
        : Number(svg.attr("width")) || 320;
    const height =
      chartRect && chartRect.height && Number.isFinite(chartRect.height)
        ? chartRect.height
        : Number(svg.attr("height")) || 64;
    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 4, right: 8, bottom: 4, left: 8 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(0, weeks.length - 1)])
      .range([margin.left, margin.left + innerWidth]);
    const yScale = d3
      .scaleLinear()
      .domain(getSparklineDomain(def.seriesKey))
      .range([margin.top + innerHeight, margin.top]);

    const lineGenerator = d3
      .line()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => xScale(d.weekIndex))
      .y((d) => yScale(d.value ?? 0));

    const series = featureSparklineSeries.get(state.selectedFeatureKey)[
      def.seriesKey
    ];

    svg
      .append("path")
      .datum(series)
      .attr("class", "sparkline-path")
      .attr("stroke", def.stroke)
      .attr("d", lineGenerator)
      .attr("fill", "none");

    const cursor = svg
      .append("line")
      .attr("class", "sparkline-cursor")
      .attr("y1", margin.top)
      .attr("y2", margin.top + innerHeight)
      .attr("x1", margin.left)
      .attr("x2", margin.left)
      .attr("opacity", 0);

    const overlay = svg
      .append("rect")
      .attr("class", "sparkline-overlay")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .on("pointermove", (event) => handleSparklinePointer(event, def))
      .on("pointerleave", () => hideSparklineTooltip())
      .on("click", (event) => handleSparklineClick(event, def));

    sparklineStates.set(def.key, {
      def,
      svg,
      xScale,
      yScale,
      lineGenerator,
      cursor,
      margin,
      width,
      height,
    });
  });
}

function updateSparklinesForFeature() {
  const perFeatureSeries = featureSparklineSeries.get(state.selectedFeatureKey);
  if (!perFeatureSeries) return;
  sparklineStates.forEach((stateObj) => {
    const { def, svg, lineGenerator, yScale } = stateObj;
    const series = perFeatureSeries[def.seriesKey];
    yScale.domain(getSparklineDomain(def.seriesKey));
    svg.selectAll(".sparkline-path").datum(series).attr("d", lineGenerator);
  });
  updateSparklineReadouts(state.currentWeekIndex);
  updateSparklineCursors(state.currentWeekIndex);
}

function getSparklineDomain(seriesKey) {
  const option = FEATURE_LOOKUP.get(state.selectedFeatureKey);
  const perFeature = featureSparklineSeries.get(state.selectedFeatureKey);
  if (!option || !perFeature) {
    return [0, 1];
  }

  const series = perFeature[seriesKey] ?? [];
  const values = series
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    if (seriesKey === "spread") {
      return [0, Math.max(0.01, (option.domain[1] - option.domain[0]) * 0.6)];
    }
    return option.domain.slice();
  }

  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);

  if (seriesKey === "spread") {
    if (maxValue <= 0) {
      maxValue = (option.domain[1] - option.domain[0]) * 0.25 || 0.25;
    }
    return [0, maxValue * 1.1];
  }

  if (minValue === maxValue) {
    const span = option.domain[1] - option.domain[0] || 1;
    const padding = span * 0.05;
    minValue -= padding;
    maxValue += padding;
  } else {
    const padding = (maxValue - minValue) * 0.1;
    minValue -= padding;
    maxValue += padding;
  }

  return [minValue, maxValue];
}

function updateSparklineCursors(weekIdx) {
  if (!Number.isFinite(weekIdx)) {
    sparklineStates.forEach((stateObj) => {
      stateObj.cursor.attr("opacity", 0);
    });
    return;
  }
  sparklineStates.forEach((stateObj) => {
    const x = stateObj.xScale(clampNumber(weekIdx, 0, weeks.length - 1));
    stateObj.cursor.attr("x1", x).attr("x2", x).attr("opacity", 0.85);
  });
}

function handleSparklinePointer(event, def) {
  const stateObj = sparklineStates.get(def.key);
  if (!stateObj || !weeks.length) return;
  const [pointerX] = d3.pointer(event, stateObj.svg.node());
  const clamped = clampNumber(
    Math.round(stateObj.xScale.invert(pointerX)),
    0,
    weeks.length - 1
  );
  const series = featureSparklineSeries.get(state.selectedFeatureKey)[
    def.seriesKey
  ];
  const point = series[clamped];
  showSparklineTooltip(event, point);
  updateSparklineCursors(clamped);
  updateSparklineReadouts(clamped);
}

function handleSparklineClick(event, def) {
  const stateObj = sparklineStates.get(def.key);
  if (!stateObj || !weeks.length) return;
  const [pointerX] = d3.pointer(event, stateObj.svg.node());
  const clamped = clampNumber(
    Math.round(stateObj.xScale.invert(pointerX)),
    0,
    weeks.length - 1
  );
  setWeekIndex(clamped);
}

function showSparklineTooltip(event, point) {
  const tooltip = document.querySelector("[data-role=sparkline-tooltip]");
  if (!tooltip || !point) return;
  tooltip.hidden = false;
  tooltip.innerHTML = `${point.date
    .toISOString()
    .slice(0, 10)}<br />${formatFeatureValue(point.value)}`;
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

function hideSparklineTooltip() {
  const tooltip = document.querySelector("[data-role=sparkline-tooltip]");
  if (tooltip) {
    tooltip.hidden = true;
  }
  updateSparklineReadouts(state.currentWeekIndex);
  updateSparklineCursors(state.currentWeekIndex);
}

function handleMapPointer(event, feature) {
  if (!mapTooltipEl || !mapContainerEl || !latestAggregation) return;
  const iso = featureIdToIso.get(feature.id);
  const name = featureIdToName.get(feature.id) ?? "Unknown";
  let content = `<strong>${name}</strong><br />No data available`;
  if (iso && latestAggregation.countryValues.has(iso)) {
    const info = latestAggregation.countryValues.get(iso);
    const baseline =
      baselinesByFeature.get(latestAggregation.featureKey)?.get(iso) ?? null;
    const divergence = Number.isFinite(latestAggregation.usAvg)
      ? info.value - latestAggregation.usAvg
      : null;
    content = `
      <strong>${name}</strong><br />
      ${
        FEATURE_LOOKUP.get(latestAggregation.featureKey)?.label ?? "Feature"
      }: ${formatFeatureValue(info.value)}<br />
      Δ vs 1980s: ${formatDelta(
        Number.isFinite(baseline) ? info.value - baseline : null
      )}<br />
      Δ vs US: ${formatDelta(divergence)}
    `;
  }
  mapTooltipEl.innerHTML = content;
  const rect = mapContainerEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  mapTooltipEl.style.left = `${offsetX}px`;
  mapTooltipEl.style.top = `${offsetY}px`;
  mapTooltipEl.hidden = false;
}

function hideMapTooltip() {
  if (mapTooltipEl) {
    mapTooltipEl.hidden = true;
  }
}

function setWeekIndex(nextIndex) {
  if (!weeks.length) {
    state.currentWeekIndex = 0;
    renderForWeek(state.currentWeekIndex);
    return;
  }
  const clamped = clampNumber(Number(nextIndex) || 0, 0, weeks.length - 1);
  state.currentWeekIndex = clamped;
  renderForWeek(state.currentWeekIndex);
}

function togglePlayback() {
  if (state.isPlaying) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (!weeks.length) return;
  if (state.currentWeekIndex >= weeks.length - 1) {
    state.currentWeekIndex = 0;
  }
  state.isPlaying = true;
  updatePlayButton();
  startPlaybackTimer();
}

function pause() {
  stopPlaybackTimer();
  state.isPlaying = false;
  updatePlayButton();
}

function startPlaybackTimer() {
  stopPlaybackTimer();
  state.playTimer = window.setInterval(() => {
    if (state.isScrubbing) return;
    if (state.currentWeekIndex >= weeks.length - 1) {
      pause();
      return;
    }
    setWeekIndex(state.currentWeekIndex + state.tickIntervalWeeks);
  }, PLAYBACK_INTERVAL_MS);
}

function stopPlaybackTimer() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
}

function restartPlaybackTimer() {
  if (!state.isPlaying) return;
  startPlaybackTimer();
}

function updatePlayButton() {
  if (!playPauseButtonEl) return;
  playPauseButtonEl.textContent = state.isPlaying ? "Pause" : "Play";
}

function resolveFeatureIdForIso(iso) {
  if (!iso) return null;
  if (isoToFeatureId.has(iso)) {
    return isoToFeatureId.get(iso);
  }
  const displayName = isoNameOverrides[iso] ?? displayNames.of(iso);
  if (!displayName) {
    isoToFeatureId.set(iso, null);
    return null;
  }
  const normalized = normalizeName(displayName);
  const feature = normalizedNameIndex.get(normalized);
  if (feature) {
    isoToFeatureId.set(iso, feature.id);
    featureIdToIso.set(feature.id, iso);
    return feature.id;
  }
  isoToFeatureId.set(iso, null);
  return null;
}

function normalizeName(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatCountryName(iso) {
  if (!iso) return "Unknown";
  return isoNameOverrides[iso] ?? displayNames.of(iso) ?? iso;
}

function getFeatureGradient(featureKey) {
  if (!featureKey) {
    return ["#f0f2ff", "#1c2d5a"];
  }
  const gradient = FEATURE_GRADIENT_MAP?.[featureKey];
  if (Array.isArray(gradient) && gradient.length === 2) {
    return gradient;
  }
  const fallback = FEATURE_COLOR_MAP?.[featureKey] ?? "#556bce";
  const base = d3.color(fallback) ?? d3.color("#556bce");
  const baseHex = base.formatHex();
  const lighter = d3.interpolateLab("#f7f7fb", baseHex)(0.5);
  const darker = base.darker(1).formatHex();
  return [lighter, darker];
}

function mixColors(colorA, colorB, t = 0.5) {
  const interpolator = d3.interpolateLab(colorA ?? "#ffffff", colorB ?? "#000000");
  return interpolator(Math.min(1, Math.max(0, t)));
}

function deriveSequentialDomain(values, baseDomain) {
  if (!Array.isArray(baseDomain) || baseDomain.length < 2) {
    return [0, 1];
  }
  const [baseMin, baseMax] = baseDomain;
  if (!values.length) {
    return baseDomain.slice();
  }
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return baseDomain.slice();
  }
  let minValue = Math.min(...finiteValues);
  let maxValue = Math.max(...finiteValues);
  const baseSpan = Math.max(0.001, baseMax - baseMin || 1);
  minValue = clampNumber(minValue, baseMin, baseMax);
  maxValue = clampNumber(maxValue, baseMin, baseMax);
  if (minValue === maxValue) {
    const padding = baseSpan * 0.05;
    minValue = clampNumber(minValue - padding, baseMin, baseMax);
    maxValue = clampNumber(maxValue + padding, baseMin, baseMax);
  }
  const minSpan = Math.max(baseSpan * 0.12, 0.05);
  if (maxValue - minValue < minSpan) {
    const mid = (minValue + maxValue) / 2 || baseMin;
    minValue = clampNumber(mid - minSpan / 2, baseMin, baseMax);
    maxValue = clampNumber(mid + minSpan / 2, baseMin, baseMax);
  }
  return [minValue, maxValue];
}

function normalizeTickInterval(value) {
  const numeric = Math.round(Number(value));
  if (VALID_TICK_INTERVALS.has(numeric)) {
    return numeric;
  }
  return DEFAULT_TICK_INTERVAL_WEEKS;
}

function formatDelta(value) {
  if (!Number.isFinite(value)) return "—";
  const formatted = formatFeatureValue(value);
  if (typeof formatted === "string" && /BPM$/.test(formatted)) {
    return (value >= 0 ? "+" : "") + formatted;
  }
  return `${value >= 0 ? "+" : ""}${formatted}`;
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

init();
