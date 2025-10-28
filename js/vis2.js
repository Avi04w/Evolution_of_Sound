<!-- ensure d3 v7 is loaded before this script -->
const HEADER_H = 48;
const CONFIG = {
  container: "#vis2",
  csvPath: "data/processed/temp_dataset.csv",
  topNGenres: 12,
  maxTracksShown: 400,
  font: "Inter, system-ui, Roboto, sans-serif"
};

  (function () {
  const d3 = window.d3;

  // ---------- helpers ----------
  const uid = (p="uid") => ((n=0)=>()=>`${p}-${++n}`)();
  const uidRect = uid("rect");
  const uidClip = uid("clip");

  const CONFIG = {
  container: "#vis2",
  csvPath: "data/processed/temp_dataset.csv",
  width: 980,
  height: 620,
  font: "Inter, system-ui, Roboto, sans-serif",
  topNGenres: 12,         // show top N per year (by count)
  maxTracksShown: 400,    // safety cap when drilling (keeps DOM light)
  bg: "#0d0d0d",
  card: "#111214",
  stroke: "rgba(255,255,255,0.08)",
  text: "#e5e5e5"
};

  // -------- data shaping: Year -> Genre -> Tracks --------
  function indexData(rows) {
  const byYear = new Map();
  const allGenres = new Set();

  for (const r of rows) {
  const y = new Date(r.date).getFullYear();
  if (!y || Number.isNaN(y)) continue;

  const g = (r.track_genre && r.track_genre.trim()) ? r.track_genre.trim() : "Unknown";
  allGenres.add(g);

  let yMap = byYear.get(y);
  if (!yMap) { yMap = new Map(); byYear.set(y, yMap); }

  let gArr = yMap.get(g);
  if (!gArr) { gArr = []; yMap.set(g, gArr); }

  // keep a light track object
  gArr.push({
    id: r.track_id || `${r.track_name}-${Math.random().toString(36).slice(2,8)}`,
  name: r.track_name || "Untitled",
  artists: r.artists || "",
  // you can show more in tooltip if you like
  duration_ms: r.duration_ms,
  popularity: +r.popularity || 0
});
}

  // convert each year map to sorted arrays by count
  const years = Array.from(byYear.keys()).sort((a,b)=>a-b);
  const shaped = new Map();
  for (const y of years) {
  const list = Array.from(byYear.get(y), ([genre, tracks]) => ({
  genre,
  count: tracks.length,
  tracks
})).sort((a,b)=>b.count - a.count);
  shaped.set(y, { year:y, genres:list, allGenres: new Set(list.map(d=>d.genre)) });
}
  return { shaped, years, allGenres: Array.from(allGenres).sort(d3.ascending) };
}

  // build a hierarchy object usable by d3.hierarchy
  // Year root -> top N genre nodes -> each track leaf (value=1)
  function buildHierarchyForYear(yearEntry, topN, maxTracks) {
  const { year, genres } = yearEntry;
  const top = genres.slice(0, topN);
  const root = {
  name: String(year),
  children: top.map(g => ({
  name: g.genre,
  count: g.count,
  children: g.tracks.slice(0, maxTracks).map(t => ({
  name: t.name,
  value: 1,              // <- uniform area
  ...t
}))
}))
};
  return root;
}

    function Treemap(rootData, cfg, mount) {
      const W = cfg.width, H = cfg.height;
      const HEADER_H = 56; // reserved band inside SVG for breadcrumb

      // ----- layout (year → genres → tracks) -----
      const root = d3.treemap()
          .tile(d3.treemapSquarify.ratio(1.4))
          .size([W, H])
          .paddingOuter(18)
          .paddingInner(10)
          .round(true)(
              d3.hierarchy(rootData)
                  .sum(d => d.value ?? 0) // leaves have value=1; parents sum
                  .sort((a, b) => (b.height - a.height) || (b.value - a.value))
          );

      // consistent colors per genre
      const genreList = root.children?.map(d => d.data.name) || [];
      const color = d3.scaleOrdinal()
          .domain(genreList)
          .range(d3.schemeTableau10.concat(d3.schemeSet3));

      // zoom scales
      const x = d3.scaleLinear().range([0, W]);
      const y = d3.scaleLinear().range([0, H]);

      // ----- mount -----
      mount.selectAll("*").remove();
      mount
          .style("position", "relative")
          .style("width", "100%")
          .style("max-width", "100%")
          .style("font-family", cfg.font)
          .style("color", cfg.text || "#e5e5e5");

      // scroll wrapper INSIDE the card; the svg can be taller than this window
      const scroller = mount.append("div")
          .attr("class", "vis2-scroll")
          .style("max-height", "68vh")
          .style("overflow-y", "auto")
          .style("overflow-x", "hidden")
          .style("padding", "16px")
          .style("border-radius", "16px");

      // svg lives inside the scroller
      const svg = scroller.append("svg")
          .attr("viewBox", [0, 0, W, H + HEADER_H])
          .attr("width", "100%")
          .attr("height", H + HEADER_H) // explicit height so layout reserves space
          .style("display", "block")
          .style("background", cfg.card || "#111214")
          .style("border", "1px solid #212329")
          .style("border-radius", "14px")
          .style("box-shadow", "0 18px 48px rgba(0,0,0,0.5)");

      // TIP attached to <body> so it won't be clipped by the scroller
      d3.select("#vis2-tip").remove(); // remove any old tip to avoid duplicates
      const tip = d3.select(document.body).append("div")
          .attr("id", "vis2-tip")
          .style("position", "fixed")
          .style("pointer-events", "none")
          .style("background", "rgba(0,0,0,0.9)")
          .style("color", "#fff")
          .style("padding", "8px 10px")
          .style("border-radius", "8px")
          .style("opacity", 0)
          .style("font-size", "12px")
          .style("box-shadow", "0 10px 28px rgba(0,0,0,0.35)")
          .style("z-index", 9999);

      // sticky header inside SVG (breadcrumb + right meta)
      const header = svg.append("g")
          .attr("transform", `translate(14, ${HEADER_H - 18})`);

      const crumb = header.append("text")
          .attr("font-size", 18)
          .attr("font-weight", 700);

      const countText = header.append("text")
          .attr("x", W - 28)
          .attr("text-anchor", "end")
          .attr("font-size", 13)
          .attr("fill", "rgba(229,229,229,0.75)");

      // chart area pushed down by HEADER_H
      const g = svg.append("g").attr("transform", `translate(0, ${HEADER_H})`);

      x.domain([0, W]); y.domain([0, H]);
      let group = g.append("g").call(render, root);

      // ---------- render ----------
      function render(sel, current) {
        updateHeader(current);

        const nodes = sel.selectAll("g.node")
            .data(current.children ? current.children.concat(current) : [current], d => d.data.name)
            .join("g")
            .attr("class", "node")
            .style("cursor", d => (d === current ? (d.parent ? "pointer" : "default") : (d.children ? "pointer" : "default")))
            .on("click", (ev, d) => {
              if (d === current) { if (d.parent) zoomOut(d); }
              else if (d.children) { zoomIn(d); }
            });

        nodes.append("rect")
            .attr("id", d => d.rectId = uidRect())
            .attr("rx", 10).attr("ry", 10)
            .attr("fill", d =>
                d === current ? "transparent"
                    : d.children ? "rgba(255,255,255,0.04)"
                        : color(current.height === 1 ? d.parent.data.name : d.data.name)
            )
            .attr("stroke", cfg.stroke || "rgba(255,255,255,0.08)")
            .attr("stroke-width", 1);

        nodes.append("clipPath")
            .attr("id", d => d.clipId = uidClip())
            .append("use").attr("xlink:href", d => `#${d.rectId}`);

        const label = nodes.append("text")
            .attr("clip-path", d => `url(#${d.clipId})`)
            .style("pointer-events", "none");

        label.selectAll("tspan")
            .data(d => {
              if (d === current) return [breadcrumb(d)];
              if (d.children) return [d.data.name, `${d.children.length} tracks`];
              return [truncate(d.data.name, 26)];
            })
            .join("tspan")
            .attr("x", 10)
            .attr("y", (s, i) => i === 0 ? 18 : 32)
            .attr("font-size", (s, i) => i === 0 ? 13 : 11)
            .attr("fill", (s, i) => i ? "rgba(229,229,229,0.7)" : "#eaeaec")
            .attr("font-weight", (s, i) => i ? 400 : 700)
            .text(s => s);

        // hover (using viewport coords for the body-level tooltip)
        nodes
            .on("mouseenter", (ev, d) => {
              if (d === current) return;
              tip.style("opacity", 1).html(tooltipHTML(d));
            })
            .on("mousemove", (ev) => {
              tip.style("left", (ev.clientX + 14) + "px")
                  .style("top",  (ev.clientY + 12) + "px");
            })
            .on("mouseleave", () => tip.style("opacity", 0));

        sel.call(position, current);
      }

      // position + size (and hide labels on tiny tiles)
      function position(sel, current) {
        sel.selectAll("g.node")
            .attr("transform", d => d === current
                ? `translate(0, -${HEADER_H})`
                : `translate(${x(d.x0)}, ${y(d.y0)})`)
            .each(function (d) {
              const w = d === current ? W : x(d.x1) - x(d.x0);
              const h = d === current ? HEADER_H : y(d.y1) - y(d.y0);
              d3.select(this).select("rect").attr("width", w).attr("height", h);
              const show = w >= 110 && h >= 56;
              d3.select(this).select("text").style("display", show ? null : "none");
            });
      }

      function zoomIn(d) {
        const from = group.attr("pointer-events", "none");
        const to = (group = g.append("g").call(render, d));
        x.domain([d.x0, d.x1]);
        y.domain([d.y0, d.y1]);

        g.transition().duration(800).ease(d3.easeCubicOut)
            .call(t => from.transition(t).remove().call(position, d.parent))
            .call(t => to.transition(t).call(position, d));
      }

      function zoomOut(d) {
        const from = group.attr("pointer-events", "none");
        const to = (group = g.insert("g", "*").call(render, d.parent));
        x.domain([d.parent.x0, d.parent.x1]);
        y.domain([d.parent.y0, d.parent.y1]);

        g.transition().duration(800).ease(d3.easeCubicOut)
            .call(t => from.transition(t).remove().call(position, d))
            .call(t => to.transition(t).call(position, d.parent));
      }

      // helpers
      function breadcrumb(d) {
        return d.ancestors().reverse().map(n => n.data.name).join(" / ");
      }

      function updateHeader(d) {
        crumb.text(breadcrumb(d));
        const meta = d.depth === 0
            ? `${d.children ? d.children.length : 0} genres`
            : d.depth === 1
                ? `${d.children ? d.children.length : 0} tracks`
                : ``;
        countText.text(meta);
      }

      function tooltipHTML(d) {
        if (d.children) {
          return `<div style="font-weight:700;margin-bottom:4px">${d.data.name}</div>
              <div>${d.children.length} tracks in ${rootData.name}</div>`;
        }
        return `<div style="font-weight:700;margin-bottom:4px">${d.data.name}</div>
            <div>${d.parent.data.name} • ${rootData.name}</div>
            <div>Artist(s): ${d.data.artists || "—"}</div>
            <div>Popularity: ${d.data.popularity ?? "—"}</div>`;
      }

      function truncate(s, n) {
        return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
      }
    }




    // ---------- init with dropdown ----------
    function init(rows, CFG = CONFIG) {
      const { shaped, years } = indexData(rows);
      const container = d3.select(CFG.container);
      container.selectAll("*").remove();

      const wrap = container
          .style("font-family", CFG.font)
          .style("color", "#e5e5e5")
          .style("display","flex")
          .style("flex-direction","column")
          .style("gap","10px");

      // --- mount the title + select in the HTML H2 ---
      const titleEl = container.node()
          .closest('.chart-container')
          .querySelector('.chart-title');

      const title = d3.select(titleEl);
      title.html("");  // clear the original text

      title.append("span")
          .attr("class", "vis2-title-text")
          .text("How Genres Defined ");

      const sel = title.append("select")
          .attr("class", "vis2-year-select");

      title.append("span")
          .attr("class", "vis2-title-suffix")
          .text(" ’s Music Scene");

      // populate year options
      sel.selectAll("option")
          .data(years)
          .join("option")
          .attr("value", d => d)
          .text(d => d);

      // --- chart card below the title ---
      const card = wrap.append("div").attr("class","vis2-card");

      const measure = () => {
        const w = Math.floor(card.node().getBoundingClientRect().width);
        const h = Math.max(560, Math.round(w * 0.62));
        return { w, h };
      };

      let size = measure();

      function render(year) {
        const hier = buildHierarchyForYear(shaped.get(year), CFG.topNGenres, CFG.maxTracksShown);
        card.selectAll("*").remove();
        Treemap(hier, { width: size.w, height: size.h, font: CFG.font, card: "#111214", stroke: "rgba(255,255,255,0.08)" }, card.append("div"));
      }

      const initial = years[years.length - 1];
      sel.property("value", initial);
      render(initial);

      sel.on("change", e => render(+e.target.value));

      // responsive re-measure
      let rid;
      window.addEventListener("resize", () => {
        clearTimeout(rid);
        rid = setTimeout(() => {
          const next = measure();
          if (next.w !== size.w || next.h !== size.h) {
            size = next;
            render(+sel.property("value"));
          }
        }, 120);
      });
    }



    d3.csv(CONFIG.csvPath, d3.autoType)
  .then(rows => init(rows))
  .catch(err => {
  console.error(err);
  const el = document.querySelector(CONFIG.container);
  if (el) el.innerHTML = `<div style="color:#ff7676">Failed to load CSV.</div>`;
});

})();

