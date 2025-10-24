(function () {
  const LAT_RANGE = [-60, 75];
  const LON_RANGE = [-170, 170];
  const VALID_RANK_MIN = 1;
  const VALID_RANK_MAX = 100;
  const DATA_PATHS = ["temp_dataset.csv", "data/processed/temp_dataset.csv"];
  const WORLD_PATHS = [
    "world-110m.json",
    // CDN fallbacks keep prototype portable when local asset is absent.
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
    "https://unpkg.com/world-atlas@2/countries-110m.json",
  ];
  const MAP_WIDTH = 960;
  const MAP_HEIGHT = 540;
  const GENRE_PALETTE = [
    "#386cb0",
    "#fdb462",
    "#7fc97f",
    "#ef3b2c",
    "#984ea3",
    "#ff7f00",
    "#a6cee3",
    "#fb9a99",
  ];

  const dom = {
    slider: document.getElementById("weekSlider"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    prevYearBtn: document.getElementById("prevYearBtn"),
    nextYearBtn: document.getElementById("nextYearBtn"),
    timelineLabel: document.getElementById("timelineLabel"),
    tracksTitle: document.getElementById("tracksTitle"),
    tracksNote: document.getElementById("tracksNote"),
    topTracksBody: document.getElementById("topTracksBody"),
    startYearSelect: document.getElementById("startYearSelect"),
    endYearSelect: document.getElementById("endYearSelect"),
    speedSelect: document.getElementById("speedSelect"),
    mapContainer: document.getElementById("mapContainer"),
    mapTooltip: document.getElementById("mapTooltip"),
    mapLegend: document.getElementById("mapLegend"),
    mapSvg: document.getElementById("worldMap"),
  };

  const uiState = {
    weekIndex: 0,
    filteredPosition: 0,
    filteredWeekIndices: [],
    filteredIndexLookup: new Map(),
    filteredYearPositions: new Map(),
    filteredYears: [],
    timelineStartYear: null,
    timelineEndYear: null,
    isPlaying: false,
    playSpeedMs: 200, // TODO Step 2: Provide reactive speed select for playback speed adjustments.
    windowSizeWeeks: 8,
    timerId: null,
  };

  const dataStore = {
    sourcePath: "",
    records: [],
    weeks: [],
    weekBuckets: new Map(),
    yearToFirstWeek: new Map(),
    yearsAscending: [],
    geoLookupSize: 0,
  };

  // TODO Step 2: Add keyboard controls (Space/Arrow keys) for playback interaction.
  // TODO Step 2: Implement zoom-to-show-more behaviour for dense week spans.
  // TODO Step 4: Keyboard focus/ARIA enhancements for map controls and pins.

  /**
   * Deterministic string hash → unsigned 32-bit int.
   * Simple djb2-style variant keeps the logic compact and stable.
   */
  function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return hash >>> 0;
  }

  function projectHashToRange(hash, min, max) {
    const normalized = hash / 4294967295;
    return min + normalized * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  async function loadDataset() {
    for (const path of DATA_PATHS) {
      try {
        const rows = await d3.csv(path);
        return { path, rows };
      } catch (error) {
        console.warn(`[geographical] Failed loading ${path}`, error);
      }
    }
    throw new Error(
      "Unable to load temp_dataset.csv. Ensure it is served alongside geographical.html."
    );
  }

  function prepareData(rows) {
    const coordCache = new Map();
    const parsedRecords = [];
    const dateKeys = new Set();

    for (const row of rows) {
      const parsedDate = row.date ? new Date(row.date) : null;
      const rank = Number.parseInt(row.rank, 10);

      if (
        !parsedDate ||
        Number.isNaN(parsedDate.getTime()) ||
        !Number.isFinite(rank) ||
        rank < VALID_RANK_MIN ||
        rank > VALID_RANK_MAX
      ) {
        continue;
      }

      const trackKey = `${row.artists || ""}|||${row.track_name || ""}`;
      let geo = coordCache.get(trackKey);
      if (!geo) {
        const baseHash = hashString(trackKey);
        const lat = projectHashToRange(baseHash, LAT_RANGE[0], LAT_RANGE[1]);
        const lon = projectHashToRange(
          (baseHash * 2654435761) >>> 0,
          LON_RANGE[0],
          LON_RANGE[1]
        );
        geo = { lat, lon };
        coordCache.set(trackKey, geo);
      }

      const isoDate = parsedDate.toISOString().split("T")[0];
      dateKeys.add(isoDate);

      parsedRecords.push({
        trackKey,
        artists: row.artists || "",
        track_name: row.track_name || "",
        track_genre: row.track_genre || "",
        rank,
        date: parsedDate,
        isoDate,
        year: parsedDate.getUTCFullYear(),
        geo,
      });
    }

    parsedRecords.sort((a, b) => a.date - b.date);
    const sortedIsoDates = Array.from(dateKeys).sort();
    const weekIndexLookup = new Map(
      sortedIsoDates.map((iso, index) => [iso, index])
    );
    const weekBuckets = new Map();
    const yearToFirstWeek = new Map();

    for (const record of parsedRecords) {
      const index = weekIndexLookup.get(record.isoDate);
      record.weekIndex = index;

      if (!weekBuckets.has(index)) {
        weekBuckets.set(index, []);
      }
      weekBuckets.get(index).push(record);

      if (!yearToFirstWeek.has(record.year)) {
        yearToFirstWeek.set(record.year, index);
      }
    }

    const yearsAscending = Array.from(yearToFirstWeek.keys()).sort(
      (a, b) => a - b
    );

    return {
      records: parsedRecords,
      uniqueWeeks: sortedIsoDates,
      geoLookupSize: coordCache.size,
      weekBuckets,
      yearToFirstWeek,
      yearsAscending,
    };
  }

  function getWeekRows(weekIndex) {
    return dataStore.weekBuckets.get(weekIndex) || [];
  }

  function getTop10(rows) {
    const sorted = [...rows].sort((a, b) => a.rank - b.rank);
    const uniqueTopEntries = [];
    const seenTracks = new Set();

    for (const entry of sorted) {
      const dedupeKey = `${entry.track_name}|||${entry.artists}`;
      if (seenTracks.has(dedupeKey)) {
        continue;
      }
      seenTracks.add(dedupeKey);
      uniqueTopEntries.push(entry);
      if (uniqueTopEntries.length === 10) {
        break;
      }
    }
    return uniqueTopEntries;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toISOString().split("T")[0];
  }

  function renderTopTracks(weekIndex) {
    const bodyEl = dom.topTracksBody;
    if (!bodyEl) {
      return;
    }

    bodyEl.innerHTML = "";
    const weekRows = getWeekRows(weekIndex);
    const topTen = getTop10(weekRows);

    const isoDate = dataStore.weeks[weekIndex];
    if (dom.tracksTitle) {
      dom.tracksTitle.textContent = isoDate
        ? `Top 10 this week (${formatDate(isoDate)})`
        : "Top 10 this week";
    }

    if (!topTen.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "tracks-table__placeholder";
      cell.textContent = "No rankings for this week.";
      row.appendChild(cell);
      bodyEl.appendChild(row);
      if (dom.tracksNote) {
        dom.tracksNote.textContent = "";
        dom.tracksNote.hidden = true;
      }
      return;
    }

    for (const entry of topTen) {
      const row = document.createElement("tr");
      row.dataset.trackKey = entry.trackKey;
      row.title = `${entry.track_name} by ${entry.artists}`;

      const cells = [
        `#${entry.rank}`,
        entry.track_name || "—",
        entry.artists || "—",
        entry.track_genre || "unknown",
      ];

      for (const value of cells) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }

      bodyEl.appendChild(row);
    }

    if (dom.tracksNote) {
      if (topTen.length < 10) {
        dom.tracksNote.textContent = `Only ${topTen.length} entr${
          topTen.length === 1 ? "y" : "ies"
        } this week.`;
        dom.tracksNote.hidden = false;
      } else {
        dom.tracksNote.hidden = true;
      }
    }
    // TODO Step 4: Clicking a track row should highlight and center the matching map pin.
    // TODO Step 3: Add a genre filter dropdown to adjust the visible list.
  }

  const mapState = {
    ready: false,
    svg: null,
    baseLayer: null,
    pinLayer: null,
    projection: null,
    pathGenerator: null,
    tooltipSelection: null,
    legendSelection: null,
    colorScale: d3.scaleOrdinal(GENRE_PALETTE).unknown("#9aa0b5"),
  };

  function createPinDatum(row, delta) {
    return {
      ...row,
      delta,
      opacityTarget: clamp(Math.exp(-delta / 6), 0.2, 1),
      radius: Math.max(4, 16 - row.rank * 0.8),
    };
  }

  function getPinsForMap(centerIndex) {
    if (!dataStore.weeks.length) {
      return [];
    }

    const anchorRows = getTop10(getWeekRows(centerIndex));
    if (!anchorRows.length) {
      return [];
    }

    const anchorKeys = new Set(anchorRows.map((row) => row.trackKey));

    const minWeek = Math.max(0, centerIndex - uiState.windowSizeWeeks);
    const maxWeek = Math.min(
      dataStore.weeks.length - 1,
      centerIndex + uiState.windowSizeWeeks
    );

    const trackMap = new Map();

    for (const row of anchorRows) {
      trackMap.set(row.trackKey, createPinDatum(row, 0));
    }

    for (let week = minWeek; week <= maxWeek; week += 1) {
      const rows = getWeekRows(week);
      for (const row of rows) {
        if (!row.geo || row.rank > 10 || !anchorKeys.has(row.trackKey)) {
          continue;
        }
        const key = row.trackKey;
        const delta = Math.abs(centerIndex - row.weekIndex);
        if (delta > uiState.windowSizeWeeks) {
          continue;
        }
        const existing = trackMap.get(key);
        if (
          !existing ||
          delta < existing.delta ||
          (delta === existing.delta && row.rank < existing.rank)
        ) {
          trackMap.set(key, createPinDatum(row, delta));
        }
      }
    }

    return Array.from(trackMap.values());
  }

  function projectPoint(row) {
    if (!mapState.projection || !row.geo) {
      return [NaN, NaN];
    }
    return mapState.projection([row.geo.lon, row.geo.lat]) || [NaN, NaN];
  }

  function updateLegend(genreValues) {
    if (!mapState.legendSelection) {
      return;
    }

    const genres = Array.from(
      new Set(
        genreValues
          .map((value) => value || "unknown")
          .filter((value) => value && value.trim().length)
      )
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, GENRE_PALETTE.length);

    if (!genres.length) {
      mapState.legendSelection
        .attr("aria-hidden", "true")
        .style("display", "none")
        .html("");
      return;
    }

    mapState.colorScale.domain(genres);
    mapState.legendSelection
      .attr("aria-hidden", "false")
      .style("display", "flex");

    const items = mapState.legendSelection
      .selectAll(".map-legend__item")
      .data(genres, (d) => d);

    const itemsEnter = items
      .enter()
      .append("div")
      .attr("class", "map-legend__item");

    itemsEnter
      .append("span")
      .attr("class", "map-legend__swatch")
      .style("background-color", (d) => mapState.colorScale(d));

    itemsEnter
      .append("span")
      .attr("class", "map-legend__label")
      .text((d) => d);

    items
      .select(".map-legend__swatch")
      .style("background-color", (d) => mapState.colorScale(d));

    items.select(".map-legend__label").text((d) => d);

    items.exit().remove();
  }

  function showTooltip(event, datum) {
    if (!mapState.tooltipSelection || !dom.mapContainer) {
      return;
    }

    const [x, y] = d3.pointer(event, dom.mapContainer);
    mapState.tooltipSelection
      .attr("hidden", null)
      .style("opacity", 1)
      .style("left", `${x + 16}px`)
      .style("top", `${y - 12}px`)
      .html(
        `<strong>#${datum.rank}</strong> · ${datum.track_name}<br />${
          datum.artists
        }<br /><span style="opacity:0.7">${formatDate(datum.isoDate)}</span>`
      );
  }

  function moveTooltip(event, datum) {
    if (!mapState.tooltipSelection || !dom.mapContainer) {
      return;
    }
    const [x, y] = d3.pointer(event, dom.mapContainer);
    mapState.tooltipSelection
      .style("left", `${x + 16}px`)
      .style("top", `${y - 12}px`)
      .html(
        `<strong>#${datum.rank}</strong> · ${datum.track_name}<br />${
          datum.artists
        }<br /><span style="opacity:0.7">${formatDate(datum.isoDate)}</span>`
      );
  }

  function hideTooltip() {
    if (!mapState.tooltipSelection) {
      return;
    }
    mapState.tooltipSelection.attr("hidden", "true").style("opacity", 0);
  }

  async function loadWorldAtlas() {
    for (const path of WORLD_PATHS) {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.warn(
          `[geographical] Failed loading world map from ${path}`,
          error
        );
      }
    }
    throw new Error(
      "Unable to load world-110m.json. Provide it locally or ensure CDN access."
    );
  }

  async function initMap() {
    if (!dom.mapSvg) {
      return;
    }

    try {
      if (typeof topojson === "undefined") {
        throw new Error("TopoJSON client library is not available.");
      }
      const worldData = await loadWorldAtlas();
      const svg = d3
        .select(dom.mapSvg)
        .attr("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      svg.selectAll("*").remove();

      const landObject = worldData.objects.land || worldData.objects.countries;
      const countriesObject = worldData.objects.countries;
      const landFeature = topojson.feature(worldData, landObject);
      const bordersMesh = countriesObject
        ? topojson.mesh(worldData, countriesObject, (a, b) => a !== b)
        : null;

      const projection = d3
        .geoNaturalEarth1()
        .fitSize([MAP_WIDTH, MAP_HEIGHT], landFeature);
      const pathGenerator = d3.geoPath(projection);

      const baseLayer = svg.append("g").attr("class", "map-base");
      baseLayer
        .append("path")
        .datum(landFeature)
        .attr("class", "map-land")
        .attr("d", pathGenerator);

      if (bordersMesh) {
        baseLayer
          .append("path")
          .datum(bordersMesh)
          .attr("class", "map-borders")
          .attr("d", pathGenerator);
      }

      const pinLayer = svg.append("g").attr("class", "map-pins");

      mapState.svg = svg;
      mapState.baseLayer = baseLayer;
      mapState.pinLayer = pinLayer;
      mapState.projection = projection;
      mapState.pathGenerator = pathGenerator;
      mapState.tooltipSelection = dom.mapTooltip
        ? d3.select(dom.mapTooltip)
        : null;
      mapState.legendSelection = dom.mapLegend
        ? d3.select(dom.mapLegend)
        : null;
      if (mapState.tooltipSelection) {
        mapState.tooltipSelection.attr("hidden", "true").style("opacity", 0);
      }
      mapState.ready = true;
    } catch (error) {
      console.error("[geographical] Map initialisation failed:", error);
      if (dom.mapContainer) {
        dom.mapContainer.innerHTML =
          "<p style='text-align:center;color:#c0392b;font-weight:600'>World map failed to load.</p>";
      }
    }
  }

  function renderMap(weekIndex) {
    if (!mapState.ready || !mapState.pinLayer) {
      return;
    }

    const pinData = getPinsForMap(weekIndex);
    updateLegend(pinData.map((item) => item.track_genre || "unknown"));
    if (!pinData.length) {
      hideTooltip();
    }

    const transition = mapState.svg.transition().duration(450);

    const pins = mapState.pinLayer
      .selectAll("circle.map-pin")
      .data(pinData, (d) => d.trackKey);

    const pinsEnter = pins
      .enter()
      .append("circle")
      .attr("class", "map-pin")
      .attr("fill", (d) => mapState.colorScale(d.track_genre || "unknown"))
      .attr("opacity", 0)
      .attr("r", 0)
      .attr("cx", (d) => projectPoint(d)[0])
      .attr("cy", (d) => projectPoint(d)[1])
      .on("mouseenter", (event, d) => showTooltip(event, d))
      .on("mousemove", (event, d) => moveTooltip(event, d))
      .on("mouseleave", () => hideTooltip());
    // TODO Step 4: Clicking a side-panel item should highlight and center the corresponding pin.

    pinsEnter
      .transition(transition)
      .attr("opacity", (d) => d.opacityTarget)
      .attr("r", (d) => d.radius);

    pins
      .transition(transition)
      .attr("fill", (d) => mapState.colorScale(d.track_genre || "unknown"))
      .attr("opacity", (d) => d.opacityTarget)
      .attr("r", (d) => d.radius)
      .attr("cx", (d) => projectPoint(d)[0])
      .attr("cy", (d) => projectPoint(d)[1]);

    pins
      .exit()
      .transition()
      .duration(300)
      .attr("opacity", 0)
      .attr("r", 0)
      .remove();
  }

  function populateYearSelectors() {
    if (!dom.startYearSelect || !dom.endYearSelect) {
      return;
    }

    const years = dataStore.yearsAscending;
    const populate = (select) => {
      select.innerHTML = "";
      for (const year of years) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = year;
        select.appendChild(option);
      }
    };

    populate(dom.startYearSelect);
    populate(dom.endYearSelect);
  }

  function syncYearSelectors() {
    if (!dom.startYearSelect || !dom.endYearSelect) {
      return;
    }
    if (uiState.timelineStartYear !== null) {
      dom.startYearSelect.value = String(uiState.timelineStartYear);
    }
    if (uiState.timelineEndYear !== null) {
      dom.endYearSelect.value = String(uiState.timelineEndYear);
    }
  }

  function applyTimelineFilter(startYear, endYear) {
    if (!dataStore.weeks.length) {
      uiState.filteredWeekIndices = [];
      uiState.filteredIndexLookup = new Map();
      uiState.filteredYears = [];
      uiState.filteredYearPositions = new Map();
      uiState.timelineStartYear = null;
      uiState.timelineEndYear = null;
      updateSliderBounds();
      setWeekPosition(0);
      return;
    }

    const years = dataStore.yearsAscending;
    let fromYear = typeof startYear === "number" ? startYear : years[0];
    let toYear =
      typeof endYear === "number" ? endYear : years[years.length - 1];

    if (fromYear > toYear) {
      [fromYear, toYear] = [toYear, fromYear];
    }

    const filtered = [];
    for (let index = 0; index < dataStore.weeks.length; index += 1) {
      const iso = dataStore.weeks[index];
      const year = Number.parseInt(iso.slice(0, 4), 10);
      if (year >= fromYear && year <= toYear) {
        filtered.push({ index, iso, year });
      }
    }

    // Fallback to full range if filter produces no weeks.
    const effective = filtered.length
      ? filtered
      : dataStore.weeks.map((iso, index) => ({
          index,
          iso,
          year: Number.parseInt(iso.slice(0, 4), 10),
        }));

    if (!filtered.length) {
      fromYear = years[0];
      toYear = years[years.length - 1];
    }

    uiState.filteredWeekIndices = effective.map((item) => item.index);
    uiState.filteredIndexLookup = new Map(
      effective.map((item, position) => [item.index, position])
    );

    uiState.filteredYears = Array.from(
      new Set(effective.map((item) => item.year))
    );
    uiState.filteredYearPositions = new Map();
    for (let position = 0; position < effective.length; position += 1) {
      const year = effective[position].year;
      if (!uiState.filteredYearPositions.has(year)) {
        uiState.filteredYearPositions.set(year, position);
      }
    }

    uiState.timelineStartYear = fromYear;
    uiState.timelineEndYear = toYear;

    updateSliderBounds();

    const position = uiState.filteredIndexLookup.get(uiState.weekIndex);
    if (typeof position === "number") {
      setWeekPosition(position);
    } else {
      setWeekPosition(0);
    }

    syncYearSelectors();
  }

  function renderTimelineLabel() {
    if (!dom.timelineLabel) {
      return;
    }
    if (!uiState.filteredWeekIndices.length) {
      dom.timelineLabel.textContent = "Timeline unavailable for this range.";
      return;
    }

    const currentIso = dataStore.weeks[uiState.weekIndex] || "";
    const position = uiState.filteredPosition + 1;
    const total = uiState.filteredWeekIndices.length;
    dom.timelineLabel.textContent = `Week ${position} of ${total} • ${currentIso}`;
  }

  function updateSliderBounds() {
    if (!dom.slider) {
      return;
    }

    const total = uiState.filteredWeekIndices.length;
    if (!total) {
      dom.slider.max = "0";
      dom.slider.value = "0";
      dom.slider.disabled = true;
      return;
    }

    dom.slider.disabled = false;
    dom.slider.max = String(total - 1);
    dom.slider.value = String(uiState.filteredPosition);
  }

  function updatePlaybackControls() {
    if (dom.playPauseBtn) {
      dom.playPauseBtn.textContent = uiState.isPlaying ? "Pause" : "Play";
    }

    const currentIso = dataStore.weeks[uiState.weekIndex];
    const currentYear = currentIso
      ? Number.parseInt(currentIso.slice(0, 4), 10)
      : NaN;
    const yearIdx = uiState.filteredYears.indexOf(currentYear);

    if (dom.prevYearBtn) {
      dom.prevYearBtn.disabled = yearIdx <= 0;
    }
    if (dom.nextYearBtn) {
      dom.nextYearBtn.disabled =
        yearIdx === -1 || yearIdx >= uiState.filteredYears.length - 1;
    }
  }

  function renderForWeek(weekIndex) {
    renderTimelineLabel();
    renderTopTracks(weekIndex);
    renderMap(weekIndex);
  }

  function setWeekPosition(position) {
    if (!uiState.filteredWeekIndices.length) {
      uiState.weekIndex = 0;
      uiState.filteredPosition = 0;
      updateSliderBounds();
      renderTimelineLabel();
      updatePlaybackControls();
      return;
    }

    const clamped = Math.max(
      0,
      Math.min(position, uiState.filteredWeekIndices.length - 1)
    );
    const actualIndex = uiState.filteredWeekIndices[clamped];
    uiState.filteredPosition = clamped;
    uiState.weekIndex = actualIndex;
    if (dom.slider) {
      dom.slider.value = String(clamped);
    }
    renderForWeek(actualIndex);
    updatePlaybackControls();
  }

  function handlePlaybackTick() {
    if (!uiState.filteredWeekIndices.length) {
      stopPlayback();
      return;
    }

    if (uiState.filteredPosition >= uiState.filteredWeekIndices.length - 1) {
      stopPlayback();
      return;
    }

    setWeekPosition(uiState.filteredPosition + 1);
  }

  function schedulePlaybackLoop() {
    if (uiState.timerId) {
      clearInterval(uiState.timerId);
      uiState.timerId = null;
    }
    if (!uiState.isPlaying || !uiState.filteredWeekIndices.length) {
      return;
    }
    uiState.timerId = setInterval(handlePlaybackTick, uiState.playSpeedMs);
  }

  function stopPlayback() {
    if (uiState.timerId) {
      clearInterval(uiState.timerId);
      uiState.timerId = null;
    }
    if (uiState.isPlaying) {
      uiState.isPlaying = false;
      updatePlaybackControls();
    }
  }

  function startPlayback() {
    if (uiState.isPlaying || !uiState.filteredWeekIndices.length) {
      return;
    }

    uiState.isPlaying = true;
    schedulePlaybackLoop();
    updatePlaybackControls();
  }

  function jumpYear(direction) {
    if (!Number.isInteger(direction) || !uiState.filteredYears.length) {
      return;
    }

    const currentIso = dataStore.weeks[uiState.weekIndex];
    if (!currentIso) {
      return;
    }

    const currentYear = Number.parseInt(currentIso.slice(0, 4), 10);
    const yearIdx = uiState.filteredYears.indexOf(currentYear);
    if (yearIdx === -1) {
      return;
    }

    const targetYear = uiState.filteredYears[yearIdx + direction];
    if (typeof targetYear !== "number") {
      return;
    }

    const targetPosition = uiState.filteredYearPositions.get(targetYear);
    if (typeof targetPosition === "number") {
      stopPlayback();
      setWeekPosition(targetPosition);
    }
  }

  function bindUI() {
    dom.slider.addEventListener("input", (event) => {
      stopPlayback();
      const next = Number.parseInt(event.target.value, 10);
      if (!Number.isNaN(next)) {
        setWeekPosition(next);
      }
    });

    dom.playPauseBtn.addEventListener("click", () => {
      if (uiState.isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    });

    dom.prevYearBtn.addEventListener("click", () => jumpYear(-1));
    dom.nextYearBtn.addEventListener("click", () => jumpYear(1));

    if (dom.startYearSelect) {
      dom.startYearSelect.addEventListener("change", (event) => {
        const startYear = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(startYear)) {
          return;
        }
        const endYear = dom.endYearSelect
          ? Number.parseInt(dom.endYearSelect.value, 10)
          : uiState.timelineEndYear;
        stopPlayback();
        applyTimelineFilter(
          startYear,
          Number.isNaN(endYear) ? startYear : endYear
        );
      });
    }

    if (dom.endYearSelect) {
      dom.endYearSelect.addEventListener("change", (event) => {
        const endYear = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(endYear)) {
          return;
        }
        const startYear = dom.startYearSelect
          ? Number.parseInt(dom.startYearSelect.value, 10)
          : uiState.timelineStartYear;
        stopPlayback();
        applyTimelineFilter(
          Number.isNaN(startYear) ? endYear : startYear,
          endYear
        );
      });
    }

    if (dom.speedSelect) {
      dom.speedSelect.value = String(uiState.playSpeedMs);
      dom.speedSelect.addEventListener("change", (event) => {
        const next = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(next) || next <= 0) {
          return;
        }
        uiState.playSpeedMs = next;
        schedulePlaybackLoop();
        updatePlaybackControls();
      });
    }
  }

  function handleFileProtocolError() {
    const message =
      "Serve geographical.html over http:// (e.g. `python -m http.server`) so the CSV can be fetched. Browsers block file:// fetches.";
    if (dom.timelineLabel) {
      dom.timelineLabel.textContent = message;
    }
    if (dom.topTracksBody) {
      dom.topTracksBody.innerHTML = "";
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "tracks-table__placeholder";
      cell.textContent = message;
      row.appendChild(cell);
      dom.topTracksBody.appendChild(row);
    }
  }

  async function init() {
    bindUI();
    if (window.location.protocol === "file:") {
      console.error(
        "[geographical] File protocol detected. Browsers block fetch() for local files—start a local server instead."
      );
      handleFileProtocolError();
      return;
    }
    try {
      const { path, rows } = await loadDataset();
      const shaped = prepareData(rows);

      Object.assign(dataStore, {
        sourcePath: path,
        records: shaped.records,
        weeks: shaped.uniqueWeeks,
        weekBuckets: shaped.weekBuckets,
        yearToFirstWeek: shaped.yearToFirstWeek,
        yearsAscending: shaped.yearsAscending,
        geoLookupSize: shaped.geoLookupSize,
      });

      await initMap();

      if (dataStore.yearsAscending.length) {
        uiState.timelineStartYear = dataStore.yearsAscending[0];
        uiState.timelineEndYear =
          dataStore.yearsAscending[dataStore.yearsAscending.length - 1];
      }

      populateYearSelectors();
      applyTimelineFilter(uiState.timelineStartYear, uiState.timelineEndYear);

      window.__GEOGRAPHICAL_STATE__ = {
        data: dataStore,
        ui: uiState,
      };

      console.log(
        `[geographical] Loaded ${dataStore.records.length} weekly entries from ${path}`
      );
      console.log(
        `[geographical] Weeks detected: ${dataStore.weeks.length}, unique tracks positioned: ${dataStore.geoLookupSize}`
      );
      console.log(
        "[geographical] Sample records:",
        dataStore.records.slice(0, 5)
      );
    } catch (error) {
      console.error("[geographical] Initialisation failed:", error);
      dom.timelineLabel.textContent =
        "Failed to load timeline data. Check console for details.";
    }
  }

  init();
})();
