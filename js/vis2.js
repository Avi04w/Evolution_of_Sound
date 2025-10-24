
// js/vis2.js
// "How Genres Defined YEAR's Music Scene"
// zoomable treemap with year dropdown
// requires d3 v7 (already loaded in index.html)

(function () {
  const d3 = window.d3;

  // tiny uid helper (replacement for DOM.uid)
  function makeUid(prefix = "uid") {
    let id = 0;
    return function () {
      id += 1;
      return `${prefix}-${id}`;
    };
  }
  const uidLeaf = makeUid("leaf");
  const uidClip = makeUid("clip");

  //  config
  const CONFIG = {
    container: "#vis2",
    csvPath: "data/processed/temp_dataset.csv",
    topN: 10,                // show top N genres per year
    width: 900,
    height: 600,
    fontFamily: "Inter, system-ui, Roboto, sans-serif",
    areaMetric: "totalPopularity" // "totalPopularity" or "count"
  };

  // data helpers

  // turn raw csv rows into Map(year -> Map(genre -> stats))
  function aggregateByYearAndGenre(rows) {
    const byYear = new Map();

    for (const row of rows) {
      const rawDate = row.date;
      const yr = new Date(rawDate).getFullYear();
      if (isNaN(yr)) continue;

      const genre = row.track_genre && row.track_genre.trim() !== ""
        ? row.track_genre.trim()
        : "Unknown";

      // spotify popularity is usually 0-100 int
      const pop = row.popularity != null && row.popularity !== ""
        ? +row.popularity
        : 0;

      if (!byYear.has(yr)) {
        byYear.set(yr, new Map());
      }
      const gmap = byYear.get(yr);

      if (!gmap.has(genre)) {
        gmap.set(genre, { genre, count: 0, totalPopularity: 0 });
      }
      const rec = gmap.get(genre);
      rec.count += 1;
      rec.totalPopularity += pop;
    }

    return byYear;
  }

  // build hierarchy object for treemap like:
  // { name: "2024", children: [{name:"pop", value:123, count:20, totalPopularity:400}, ...] }
  function buildYearHierarchy(year, gmap, topN, metric) {
    // flatten genre map to array
    let genres = Array.from(gmap.values());

    // choose what drives rectangle size
    genres.forEach(g => {
      g.value = (metric === "count") ? g.count : g.totalPopularity;
    });

    // sort by size descending, keep best topN
    genres.sort((a, b) => b.value - a.value);
    genres = genres.slice(0, topN);

    return {
      name: String(year),
      children: genres.map(g => ({
        name: g.genre,
        value: g.value,
        count: g.count,
        totalPopularity: g.totalPopularity
      }))
    };
  }

  // treemap rendering

  function createTreemapComponents(rootData, opts, outerSel) {
    const { width, height, fontFamily } = opts;

    // custom tiler that rescales to the zoom window just like Observable’s example
    function tile(node, x0, y0, x1, y1) {
      d3.treemapBinary(node, 0, 0, width, height);
      if (!node.children) return;
      for (const child of node.children) {
        child.x0 = x0 + (child.x0 / width) * (x1 - x0);
        child.x1 = x0 + (child.x1 / width) * (x1 - x0);
        child.y0 = y0 + (child.y0 / height) * (y1 - y0);
        child.y1 = y0 + (child.y1 / height) * (y1 - y0);
      }
    }

    // build hierarchy + layout
    const hierarchy = d3.hierarchy(rootData)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    const treemapLayout = d3.treemap().tile(tile);
    const root = treemapLayout(hierarchy);

    // scales for zoom
    const x = d3.scaleLinear().rangeRound([0, width]);
    const y = d3.scaleLinear().rangeRound([0, height]);

    // number formatter
    const fmt = d3.format(",d");

    // helper to show full path at top bar
    const fullName = d =>
      d.ancestors().reverse().map(d => d.data.name).join(" / ");

    // wipe mount point
    outerSel.selectAll("*").remove();

    // tooltip container in same DOM flow (absolute positioned)
    outerSel
      .style("position", "relative")
      .style("font-family", fontFamily)
      .style("width", width + "px")
      .style("max-width", "100%");

    const tooltip = outerSel.append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "rgba(0,0,0,0.8)")
      .style("color", "#fff")
      .style("padding", "6px 8px")
      .style("border-radius", "6px")
      .style("box-shadow", "0 2px 8px rgba(0,0,0,0.4)")
      .style("font-size", "12px")
      .style("line-height", "1.4")
      .style("opacity", 0);

    const svg = outerSel.append("svg")
      .attr("viewBox", [0.5, -30.5, width, height + 30])
      .attr("width", "100%")
      .attr("height", height + 30)
      .style("display", "block")
      .style("height", "auto")
      .style("font-size", "11px")
      .style("cursor", "default");

    // define col scale before calling render()
    const colorForName = d3.scaleOrdinal(d3.schemeTableau10);

    // we reuse this <g> when zooming
    let group = svg.append("g")
      .call(render, root);

    function render(gSel, currentRoot) {
      const nodes = gSel.selectAll("g")
        .data(
          currentRoot.children
            ? currentRoot.children.concat(currentRoot)
            : [currentRoot],
          d => d.data.name
        )
        .join("g");

      // nodes that can zoom
      nodes
        .filter(d => (d === currentRoot ? d.parent : d.children))
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
          if (d === currentRoot) {
            if (d.parent) zoomOut(d);
          } else {
            if (d.children) zoomIn(d);
          }
        });

      // hover tooltip only for leaves (actual genres)
      nodes
        .on("mouseenter", function (event, d) {
          if (!d.children) {
            tooltip
              .style("opacity", 1)
              .html(makeTooltipHTML(d));
          }
        })
        .on("mousemove", function (event) {
          const [mx, my] = d3.pointer(event, outerSel.node());
          tooltip
            .style("left", mx + 12 + "px")
            .style("top", my + 12 + "px");
        })
        .on("mouseleave", function () {
          tooltip.style("opacity", 0);
        });

      // draw rect
      nodes.append("rect")
        .attr("id", d => {
          d.leafUid = uidLeaf();
          return d.leafUid;
        })
        .attr("fill", d => {
          if (d === currentRoot) return "#ffffff";
          if (d.children) return "#d4d4d8"; // parent groups
          return colorForName(d.data.name); // leaf genre
        })
        .attr("stroke", "#ffffff");

      // clipPath keeps text inside the box
      nodes.append("clipPath")
        .attr("id", d => {
          d.clipUid = uidClip();
          return d.clipUid;
        })
        .append("use")
        .attr("xlink:href", d => `#${d.leafUid}`);

      // label text (genre + score)
      const text = nodes.append("text")
        .attr("clip-path", d => `url(#${d.clipUid})`)
        .attr("font-weight", d => (d === currentRoot ? "600" : null))
        .style("pointer-events", "none")
        .style("user-select", "none");

      text.selectAll("tspan")
        .data(d => {
          // top bar = full path + value
          if (d === currentRoot) {
            return [fullName(d), fmt(d.value)];
          }
          // leaf / normal rect
          return [d.data.name, fmt(d.value)];
        })
        .join("tspan")
        .attr("x", 3)
        .attr("y", (d, i, nodesArr) =>
          `${(i === nodesArr.length - 1) * 0.3 + 1.1 + i * 0.9}em`
        )
        .attr("fill-opacity", (d, i, nodesArr) =>
          i === nodesArr.length - 1 ? 0.7 : null
        )
        .attr("font-weight", (d, i, nodesArr) =>
          i === nodesArr.length - 1 ? 400 : null
        )
        .text(d => d);

      // apply positioning
      gSel.call(position, currentRoot);
    }

    function makeTooltipHTML(d) {
      const genreName = d.data.name;
      const score = fmt(d.data.value);
      const totalPop = d.data.totalPopularity != null
        ? d.data.totalPopularity.toFixed(0)
        : "–";
      const count = d.data.count != null ? d.data.count : "–";

      return `
        <div style="font-weight:600;margin-bottom:4px">${genreName}</div>
        <div>Score: <b>${score}</b></div>
        <div>Total popularity: <b>${totalPop}</b></div>
        <div>Tracks in ${rootData.name}: <b>${count}</b></div>
      `;
    }

    function position(gSel, currentRoot) {
      gSel.selectAll("g")
        .attr("transform", d => {
          return d === currentRoot
            ? `translate(0,-30)`
            : `translate(${x(d.x0)},${y(d.y0)})`;
        })
        .select("rect")
        .attr("width", d =>
          d === currentRoot ? width : x(d.x1) - x(d.x0)
        )
        .attr("height", d =>
          d === currentRoot ? 30 : y(d.y1) - y(d.y0)
        );
    }

    // zoom in on a child node
    function zoomIn(d) {
      const group0 = group.attr("pointer-events", "none");
      const group1 = (group = svg.append("g").call(render, d));

      x.domain([d.x0, d.x1]);
      y.domain([d.y0, d.y1]);

      svg.transition()
        .duration(750)
        .call(t => group0.transition(t)
          .remove()
          .call(position, d.parent)
        )
        .call(t => group1.transition(t)
          .attrTween("opacity", () => d3.interpolate(0, 1))
          .call(position, d)
        );
    }

    // zoom back out to parent
    function zoomOut(d) {
      const group0 = group.attr("pointer-events", "none");
      const group1 = (group = svg.insert("g", "*").call(render, d.parent));

      x.domain([d.parent.x0, d.parent.x1]);
      y.domain([d.parent.y0, d.parent.y1]);

      svg.transition()
        .duration(750)
        .call(t => group0.transition(t)
          .remove()
          .attrTween("opacity", () => d3.interpolate(1, 0))
          .call(position, d)
        )
        .call(t => group1.transition(t)
          .call(position, d.parent)
        );
    }

    // return tiny handle in case we ever want to destroy it
    return {
      destroy() {
        outerSel.selectAll("*").remove();
      }
    };
  }

  // main init (called once after CSV load)

  function initVis2(rows, config = CONFIG) {
    const containerSel = d3.select(config.container);

    // clear existing content (if dev hot-reload etc.)
    containerSel.selectAll("*").remove();

    // outer wrapper for title + dropdown + chart card
    const wrapper = containerSel
      .style("font-family", config.fontFamily)
      .style("color", "#e5e5e5")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("gap", "0.75rem");

    // header row
    const header = wrapper.append("div")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("align-items", "baseline")
      .style("column-gap", "0.5rem")
      .style("row-gap", "0.5rem")
      .style("color", "#e5e5e5");

    header.append("div")
      .style("font-size", "1rem")
      .style("font-weight", "600")
      .text("How Genres Defined");

    const yearSelect = header.append("select")
      .style("background", "#1f1f1f")
      .style("color", "#e5e5e5")
      .style("border", "1px solid #555")
      .style("border-radius", "4px")
      .style("padding", "2px 6px")
      .style("font-size", "0.9rem")
      .style("cursor", "pointer");

    header.append("div")
      .style("font-size", "1rem")
      .style("font-weight", "600")
      .text("’s Music Scene");

    // card-ish container for the treemap svg
    const card = wrapper.append("div")
      .style("background", "#0d0d0d")
      .style("border", "1px solid #2a2a2a")
      .style("border-radius", "12px")
      .style("padding", "12px")
      .style("width", "100%")
      .style("max-width", config.width + "px")
      .style("overflow", "hidden")
      .style("box-shadow", "0 16px 40px rgba(0,0,0,0.6)");

    // aggregate
    const byYear = aggregateByYearAndGenre(rows);
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);

    // populate year dropdown
    yearSelect
      .selectAll("option")
      .data(years)
      .join("option")
      .attr("value", d => d)
      .text(d => d);

    let currentViz = null;

    function renderForYear(yearVal) {
      const gmap = byYear.get(yearVal);
      if (!gmap) return;

      const hierarchy = buildYearHierarchy(
        yearVal,
        gmap,
        config.topN,
        config.areaMetric // "totalPopularity" or "count"
      );

      // reset card (so we don't stack multiple svgs)
      card.selectAll("*").remove();

      currentViz = createTreemapComponents(
        hierarchy,
        { width: config.width, height: config.height, fontFamily: config.fontFamily },
        card.append("div")
      );
    }

    // initial render = most recent year
    const initialYear = years[years.length - 1];
    yearSelect.property("value", initialYear);
    renderForYear(initialYear);

    // when user changes dropdown year
    yearSelect.on("change", (ev) => {
      const yr = +ev.target.value;
      renderForYear(yr);
    });

    // store an update hook on the DOM if you ever reload data
    containerSel.node().__vis2__ = {
      update(newRows) {
        const newByYear = aggregateByYearAndGenre(newRows);
        byYear.clear();
        for (const [k, v] of newByYear.entries()) {
          byYear.set(k, v);
        }

        const newYears = Array.from(byYear.keys()).sort((a, b) => a - b);

        // repopulate dropdown
        const optSel = yearSelect.selectAll("option")
          .data(newYears, d => d);

        optSel.enter()
          .append("option")
          .attr("value", d => d)
          .text(d => d);

        optSel.exit().remove();

        const latest = newYears[newYears.length - 1];
        yearSelect.property("value", latest);
        renderForYear(latest);
      }
    };
  }

  // load CSV + kick off

  d3.csv(CONFIG.csvPath).then(rawRows => {
    initVis2(rawRows, CONFIG);
  }).catch(err => {
    console.error("Failed to build vis2:", err);
    const el = document.querySelector(CONFIG.container);
    if (el) {
      el.innerHTML = `<div style="color:#ff6b6b;font-family:${CONFIG.fontFamily};">
        Error building Visualization 2. Check console.
      </div>`;
    }
  });

})();
