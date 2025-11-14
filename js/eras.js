// era_story.js
// internal era scroller: only show focused era, scroll wheel moves between eras

(function () {
    const d3 = window.d3;
    if (!d3) {
        console.warn("d3 not found for era_story.js");
        return;
    }

    const eras = [
        {
            id: "era-80s",
            label: "1980s",
            title: "synths, disco and stadium energy",
            subtitle: "high danceability and bright, electronic textures.",
            blurb:
                "the charts lean into big synth lines and four-on-the-floor drums. energy and danceability spike as disco and synth-pop dominate late-night radio.",
            topTags: ["high energy", "high danceability", "low acousticness"],
            bars: [0.9, 0.8, 0.4, 0.2]
        },
        {
            id: "era-90s",
            label: "1990s",
            title: "grunge, r&b and mood swings",
            subtitle: "louder guitars, softer ballads and more dynamic range.",
            blurb:
                "alternative rock pulls loudness and energy up, while r&b ballads keep valence and tempo more relaxed. the decade is full of sharp contrasts.",
            topTags: ["loudness", "mid valence", "varied tempo"],
            bars: [0.7, 0.6, 0.3, 0.5]
        },
        {
            id: "era-00s",
            label: "2000s",
            title: "pop maximalism and auto-tune",
            subtitle: "compressed loudness and club-ready beats.",
            blurb:
                "digital production makes tracks brighter and more compressed. energy stays high while acousticness drops as electronic textures take over.",
            topTags: ["very loud", "steady tempo", "low acousticness"],
            bars: [0.95, 0.75, 0.25, 0.55]
        },
        {
            id: "era-10s",
            label: "2010s",
            title: "edm peaks, trap drops, bedroom pop",
            subtitle: "extremes of both high-energy drops and low-key introspection.",
            blurb:
                "edm and trap push energy and tempo in opposite directions, while bedroom pop brings back softer dynamics and higher acousticness.",
            topTags: ["split energy", "sub-bass", "mixed valence"],
            bars: [0.85, 0.45, 0.5, 0.6]
        }
    ];

    const navSvg = d3.select("#era-nav");
    if (navSvg.empty()) return; // section might not exist

    const navWidth = +navSvg.attr("width");
    const navHeight = +navSvg.attr("height");
    const margin = { top: 150, bottom: 10 };

    // map era id -> index
    const idToIndex = new Map(eras.map((d, i) => [d.id, i]));

    // y positions for dots
    const yScale = d3
        .scalePoint(
            eras.map(d => d.id),
            [margin.top, navHeight - margin.bottom]
        )
        .padding(0.7);

    navSvg
        .append("line")
        .attr("class", "nav-line")
        .attr("x1", navWidth / 2)
        .attr("x2", navWidth / 2)
        .attr("y1", yScale.range()[0])
        .attr("y2", yScale.range()[1]);

    const dotGroup = navSvg
        .append("g")
        .attr("transform", `translate(${navWidth / 2},0)`);

    // one <g> per era: circle + text label
    const ticks = dotGroup
        .selectAll("g.nav-tick")
        .data(eras)
        .join("g")
        .attr("class", "nav-tick")
        .attr("transform", d => `translate(0, ${yScale(d.id)})`)
        .on("click", (event, d) => {
            // clicking label or dot changes active era (no page scroll)
            const idx = idToIndex.get(d.id);
            if (idx != null) setActiveByIndex(idx);
        });

    // subtle circle
    ticks
        .append("circle")
        .attr("class", "nav-dot")
        .attr("cx", 0)
        .attr("cy", 0);

    // year label, e.g. "1980s"
    ticks
        .append("text")
        .attr("class", "nav-label")
        .attr("x", 12)
        .attr("y", 0)
        .attr("text-anchor", "start")
        .text(d => d.label);

    // build panels (stacked, only one active)
    const panelContainer = d3.select("#era-panels");

    const panels = panelContainer
        .selectAll(".era-panel")
        .data(eras)
        .join("section")
        .attr("class", "era-panel")
        .attr("id", d => d.id);

    const shell = panels
        .append("div")
        .attr("class", "era-panel-inner");

    const inner = shell.append("div").attr("class", "era-inner");

    const textCol = inner.append("div").attr("class", "era-text");

    textCol.append("div").attr("class", "era-label").text(d => d.label);

    textCol.append("h2").attr("class", "era-title").text(d => d.title);

    textCol.append("p").attr("class", "era-subtitle").text(d => d.subtitle);

    textCol.append("p").attr("class", "era-copy").text(d => d.blurb);

    const vizCol = inner.append("div").attr("class", "era-feature-viz");

    vizCol
        .append("div")
        .attr("class", "feature-pills")
        .selectAll(".feature-pill")
        .data(d => d.topTags)
        .join("span")
        .attr("class", "feature-pill")
        .text(d => d);

    const barsWrap = vizCol.append("div").attr("class", "feature-bars");

    barsWrap
        .selectAll(".feature-bar")
        .data(d => d.bars)
        .join("div")
        .attr("class", (d, i) => (i === 0 ? "feature-bar highlight" : "feature-bar"))
        .style("height", d => `${d * 100}%`);

    // ---- state: which era is active ----

    let currentIndex = 0;

    function setActiveByIndex(idx) {
        const clamped = Math.max(0, Math.min(eras.length - 1, idx));
        if (clamped === currentIndex) return;
        currentIndex = clamped;

        const activeId = eras[currentIndex].id;

        // highlight nav + show the right panel
        ticks.classed("active", d => d.id === activeId);
        panels.classed("active", d => d.id === activeId);
    }

    // initialise with first era active
    ticks.classed("active", (d, i) => i === currentIndex);
    panels.classed("active", (d, i) => i === currentIndex);

    // internal scroll (wheel) on the whole era section
    const eraSection = document.querySelector(".era-layout");
    const pageScroller = document.querySelector(".pageScroller");

    if (eraSection) {
        // when mouse/pointer is over this viz, disable outer snap
        eraSection.addEventListener("mouseenter", () => {
            if (pageScroller) pageScroller.classList.add("no-snap");
        });

        eraSection.addEventListener("mouseleave", () => {
            if (pageScroller) pageScroller.classList.remove("no-snap");
        });

        let scrollLocked = false;

        eraSection.addEventListener(
            "wheel",
            evt => {
                // make sure we can cancel this
                if (scrollLocked) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
                if (evt.deltaY === 0) return;

                const direction = evt.deltaY > 0 ? 1 : -1;
                const atTop = currentIndex === 0;
                const atBottom = currentIndex === eras.length - 1;

                // top era, scrolling up → leave viz, let page scroll
                if (atTop && direction < 0) {
                    if (pageScroller) pageScroller.classList.remove("no-snap");
                    // IMPORTANT: do NOT preventDefault here → page scrolls normally
                    return;
                }

                // bottom era, scrolling down → leave viz, let page scroll
                if (atBottom && direction > 0) {
                    if (pageScroller) pageScroller.classList.remove("no-snap");
                    // IMPORTANT: do NOT preventDefault here → page scrolls normally
                    return;
                }

                // inside (1980s ↔ 2010s): wheel only flips eras, page does not move
                const targetIndex = currentIndex + direction;
                if (targetIndex >= 0 && targetIndex < eras.length) {
                    evt.preventDefault();   // block page scroll
                    evt.stopPropagation();  // block bubbling to outer scroller

                    setActiveByIndex(targetIndex);

                    scrollLocked = true;    // debounce so one swipe = one step
                    setTimeout(() => {
                        scrollLocked = false;
                    }, 420);
                    return;
                }
            },
            { passive: false }
        );


}

    // optional: keyboard navigation when section is focused
    document.addEventListener("keydown", evt => {
        if (!document.body.contains(eraSection)) return;

        const rect = eraSection.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) return;

        if (evt.key === "ArrowDown" || evt.key === "PageDown") {
            setActiveByIndex(currentIndex + 1);
        } else if (evt.key === "ArrowUp" || evt.key === "PageUp") {
            setActiveByIndex(currentIndex - 1);
        }
    });
})();
