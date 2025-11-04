// ensure d3 v7 is loaded before this script

(function () {
    const d3 = window.d3;

    // ---------- small helpers (all lowercase) ----------
    const uid = (p = "uid") => ((n = 0) => () => `${p}-${++n}`)();
    const uidRect = uid("rect");
    const uidClip = uid("clip");

    // inject a tiny css rule for blackout if not present
    (function ensureBlackoutCSS() {
        const id = "treemap-blackout-style";
        if (!document.getElementById(id)) {
            const style = document.createElement("style");
            style.id = id;
            style.textContent = `
        #treemap .node--blackout > rect { fill: #000 !important; transition: fill 120ms linear; }
      `;
            document.head.appendChild(style);
        }
    })();

    const CONFIG = {
        container: "#treemap",
        csvPath: "data/processed/temp_dataset.csv",
        width: 980,
        height: 620,
        font: "Inter, system-ui, Roboto, sans-serif",
        topNGenres: 12,         // show top n per year (by count)
        maxTracksShown: 12,    // cap leaves for perf
        bg: "#0d0d0d",
        card: "#111214",
        stroke: "rgba(255,255,255,0.08)",
        text: "#e5e5e5"
    };

    // -------- data shaping: year -> genre -> tracks --------
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

            gArr.push({
                id: r.track_id || `${r.track_name}-${Math.random().toString(36).slice(2, 8)}`,
                name: r.track_name || "Untitled",
                artists: r.artists || "",
                duration_ms: r.duration_ms,
                popularity: +r.popularity || 0
            });
        }

        const years = Array.from(byYear.keys()).sort((a, b) => a - b);
        const shaped = new Map();
        for (const y of years) {
            const list = Array.from(byYear.get(y), ([genre, tracks]) => ({
                genre,
                count: tracks.length,
                tracks
            })).sort((a, b) => b.count - a.count);
            shaped.set(y, { year: y, genres: list, allGenres: new Set(list.map(d => d.genre)) });
        }
        return { shaped, years, allGenres: Array.from(allGenres).sort(d3.ascending) };
    }

    // build hierarchy: year root -> top n genres -> tracks (value=1)
    function buildHierarchyForYear(yearEntry, topN, maxTracks) {
        const { year, genres } = yearEntry;
        const top = genres.slice(0, topN);
        return {
            name: String(year),
            children: top.map(g => ({
                name: g.genre,
                count: g.count,
                children: g.tracks.slice(0, maxTracks).map(t => ({
                    name: t.name,
                    value: 1,
                    ...t
                }))
            }))
        };
    }

    // ---------- treemap renderer ----------
    function Treemap(rootData, cfg, mount) {
        const W = cfg.width, H = cfg.height;
        const HEADER_H = 56; // reserved band inside svg for breadcrumb

        // layout (year → genres → tracks)
        const root = d3.treemap()
            .tile(d3.treemapSquarify.ratio(1.4))
            .size([W, H])
            .paddingOuter(18)
            .paddingInner(10)
            .round(true)(
                d3.hierarchy(rootData)
                    .sum(d => d.value ?? 0)
                    .sort((a, b) => (b.height - a.height) || (b.value - a.value))
            );

        // palette per-genre (stable for depth 1 and all descendants)
        const genreList = root.children?.map(d => d.data.name) || [];
        const color = d3.scaleOrdinal()
            .domain(genreList)
            .range(d3.schemeTableau10.concat(d3.schemeDark2));

        // zoom scales
        const x = d3.scaleLinear().range([0, W]);
        const y = d3.scaleLinear().range([0, H]);

        // mount
        mount.selectAll("*").remove();
        mount
            .style("position", "relative")
            .style("width", "100%")
            .style("max-width", "100%")
            .style("font-family", cfg.font)
            .style("color", cfg.text || "#e5e5e5");

        // scroll wrapper
        const scroller = mount.append("div")
            .attr("class", "treemap-scroll")
            .style("max-height", "68vh")
            .style("overflow-y", "auto")
            .style("overflow-x", "hidden")
            .style("padding", "16px")
            .style("border-radius", "16px");

        // svg
        const svg = scroller.append("svg")
            .attr("viewBox", [0, 0, W, H + HEADER_H])
            .attr("width", "100%")
            .attr("height", H + HEADER_H)
            .style("display", "block")
            .style("background", cfg.card || "#111214")
            .style("border", "1px solid #212329")
            .style("border-radius", "14px")
            .style("box-shadow", "0 18px 48px rgba(0,0,0,0.5)");

        // tooltip on body (not clipped)
        d3.select("#treemap-tip").remove();
        const tip = d3.select(document.body).append("div")
            .attr("id", "treemap-tip")
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

        // sticky header (breadcrumb + meta)
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

        // chart area pushed down by header_h
        const g = svg.append("g").attr("transform", `translate(0, ${HEADER_H})`);

        // background rect: flips to black when zoomed in
        const bgRect = g.append("rect")
            .attr("class", "treemap-bg")
            .attr("x", 0)
            .attr("y", -HEADER_H) // also behind header for seamless look
            .attr("width", W)
            .attr("height", H + HEADER_H)
            .attr("rx", 14).attr("ry", 14)
            .attr("fill", cfg.card || "#111214");

        function updateBg(d) {
            bgRect.transition().duration(180)
                .attr("fill", d.depth === 0 ? (cfg.card || "#111214") : "#000");
        }

        x.domain([0, W]); y.domain([0, H]);
        let group = g.append("g").call(render, root);

        // ---------- render ----------
        function render(sel, current) {
            updateBg(current);
            updateHeader(current);

            const nodes = sel.selectAll("g.node")
                .data(current.children ? current.children.concat(current) : [current], d => d.data.name)
                .join("g")
                .attr("class", "node")
                .style("cursor", d =>
                    (d === current ? (d.parent ? "pointer" : "default") : (d.children ? "pointer" : "default")))
                .on("click", function (ev, d) {
                    if (d === current) {
                        if (d.parent) zoomOut(d);
                    } else if (d.children) {
                        // temporarily blackout the clicked tile during zoom so it blends into the black bg
                        d3.select(this).classed("node--blackout", true);
                        zoomIn(d, () => d3.select(this).classed("node--blackout", false));
                    }
                });

            nodes.append("rect")
                .attr("id", d => d.rectId = uidRect())
                .attr("rx", 10).attr("ry", 10)
                .attr("fill", d => {
                    if (d === current) return "transparent"; // the "host" is transparent; bgRect provides backdrop

                    // genre tiles (depth 1): color by their own name
                    if (d.depth === 1) return color(d.data.name);

                    // leaf tracks: color by parent genre
                    if (!d.children) return color(d.parent?.data.name);

                    // intermediate grouping (if any): inherit ancestor genre color
                    const ancestor = d.ancestors().find(a => a.depth === 1);
                    return ancestor ? color(ancestor.data.name) : "rgba(255,255,255,0.05)";
                })
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

            // hover tooltip
            nodes
                .on("mouseenter", (ev, d) => {
                    if (d === current) return;
                    tip.style("opacity", 1).html(tooltipHTML(d));
                })
                .on("mousemove", (ev) => {
                    tip.style("left", (ev.clientX + 14) + "px")
                        .style("top", (ev.clientY + 12) + "px");
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

            // hide every label in the old layer so none of them ride the transform
            from.selectAll("text").style("display", "none");   // <- kill the fly

            // build the new layer
            const to = (group = g.append("g").call(render, d));
            x.domain([d.x0, d.x1]);
            y.domain([d.y0, d.y1]);

            // start with labels invisible in the new layer, then fade in after tween
            to.selectAll("text").style("opacity", 0);

            g.transition().duration(800).ease(d3.easeCubicOut)
                .call(t => from.transition(t).remove().call(position, d.parent))
                .call(t => to.transition(t).call(position, d))
                .on("end", () => {
                    to.selectAll("text").style("opacity", 1);      // <- gentle appear
                });
        }

        function zoomOut(d) {
            const from = group.attr("pointer-events", "none");
            const to = (group = g.append("g").call(render, d.parent));
            x.domain([d.parent.x0, d.parent.x1]);
            y.domain([d.parent.y0, d.parent.y1]);

            updateBg(d.parent); // restore card color

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
        // shape data
        const { shaped, years } = indexData(rows);
        const container = d3.select(CFG.container);
        container.selectAll("*").remove();

        // outer wrapper
        const wrap = container
            .style("font-family", CFG.font)
            .style("color", "#e5e5e5")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "10px");

        // card always exists (so we can measure once)
        const card = wrap.append("div").attr("class", "treemap-card");

        // measure once
        const measure = () => {
            const w = Math.floor(card.node().getBoundingClientRect().width);
            const h = Math.max(560, Math.round(w * 0.62));
            return { w, h };
        };
        let size = measure();

        // place the select: either inside chart-title or as a fallback above the card
        const titleEl = container.node()
            .closest(".chart-container")
            ?.querySelector(".chart-title");

        let sel; // the <select> we’ll populate
        if (titleEl) {
            const title = d3.select(titleEl);
            title.html(""); // clear original

            title.append("span").attr("class", "treemap-title-text").text("How Genres Defined ");
            sel = title.append("select").attr("class", "treemap-year-select");
            title.append("span").attr("class", "treemap-title-suffix").text(" ’s Music Scene");
        } else {
            // simple fallback select above the card
            sel = wrap.insert("select", ":first-child").attr("class", "treemap-year-select");
        }

        // populate year options
        sel.selectAll("option")
            .data(years)
            .join("option")
            .attr("value", d => d)
            .text(d => d);

        // single render function (no duplicates)
        function renderYear(year) {
            const hier = buildHierarchyForYear(shaped.get(year), CFG.topNGenres, CFG.maxTracksShown);
            card.selectAll("*").remove();
            Treemap(
                hier,
                { width: size.w, height: size.h, font: CFG.font, card: CFG.card, stroke: CFG.stroke },
                card.append("div")
            );
        }

        // initial selection
        const initial = years[years.length - 1];
        sel.property("value", initial);
        renderYear(initial);

        // change handler
        sel.on("change", e => renderYear(+e.target.value));

        // responsive re-measure (single listener)
        let rid;
        window.addEventListener("resize", () => {
            clearTimeout(rid);
            rid = setTimeout(() => {
                const next = measure();
                if (next.w !== size.w || next.h !== size.h) {
                    size = next;
                    renderYear(+sel.property("value"));
                }
            }, 120);
        });
    }


    // ---------- load + boot ----------
    d3.csv(CONFIG.csvPath, d3.autoType)
        .then(rows => init(rows))
        .catch(err => {
            console.error(err);
            const el = document.querySelector(CONFIG.container);
            if (el) el.innerHTML = `<div style="color:#ff7676">Failed to load CSV.</div>`;
        });

})();
