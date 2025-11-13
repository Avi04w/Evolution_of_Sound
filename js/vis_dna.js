class VisDNA {
    constructor(selector, config = {}) {
        this.selector = selector;
        this.feature = config.feature || "acousticness";
        const parentWidth = d3.select(this.selector).node().getBoundingClientRect().width;
        this.width = config.width || parentWidth - 200;
        this.height = config.height || 380;
        this.margin = { top: 30, right: 40, bottom: 110, left: 50 };

        this.scrollOffset = 0;

        this.torsion = 0.2;
        this.features = ["energy", "tempo", "acousticness", "valence", "danceability", "speechiness", "loudness"];

        // darker low-end colors for better contrast
        this.colorScales = {
            energy:       d3.scaleSequential(d3.interpolateRgb("#bcffc4", "#1d4e00")),
            tempo:        d3.scaleSequential(d3.interpolateRgb("#ffc8c8", "#770000")),
            acousticness: d3.scaleSequential(d3.interpolateRgb("#d5e9ff", "#012b42")),
            valence:      d3.scaleSequential(d3.interpolateRgb("#005283", "#ded700")),
            danceability: d3.scaleSequential(d3.interpolateRgb("#ffc7de", "#230465")),
            speechiness:  d3.scaleSequential(d3.interpolateRgb("#ffe9b6", "#6a4c00")),
            loudness:     d3.scaleSequential(d3.interpolateRgb("#bafff5", "#007c66"))
        };


        this.yearData = [];
        this.numX = 0;

        this.featureDescriptions = {
            danceability: "Danceability describes how suitable a track is for dancing based on a combination of musical elements including tempo, rhythm stability, beat strength, and overall regularity. A value of 0.0 is least danceable and 1.0 is most danceable.",
            energy: "Energy is a measure from 0.0 to 1.0 and represents a perceptual measure of intensity and activity. Typically, energetic tracks feel fast, loud, and noisy. For example, death metal has high energy, while a Bach prelude scores low on the scale.",
            loudness: "The overall loudness of a track in decibels (dB).",
            speechiness: "Speechiness detects the presence of spoken words in a track. The more exclusively speech-like the recording, the closer to 1.0 the attribute value. Values above 0.66 describe tracks that are probably made entirely of spoken words.",
            acousticness: "A confidence measure from 0.0 to 1.0 of whether the track is acoustic. 1.0 represents high confidence the track is acoustic.",
            valence: "A measure from 0.0 to 1.0 describing the musical positiveness conveyed by a track. Tracks with high valence sound more positive (e.g. happy, cheerful, euphoric), while tracks with low valence sound more negative (e.g. sad, depressed, angry).",
            tempo: "The overall estimated tempo of a track in beats per minute (BPM). In musical terminology, tempo is the speed or pace of a given piece and derives directly from the average beat duration."
        };


        // phase / mouse smoothing and focus state
        this.phaseCenter = this.width / 2;
        this.targetPhaseCenter = this.phaseCenter; // where we want the helix to start (used when focusing on a bar)
        this.phaseEasing = 0.08;
        this.mouseX = null;
        this.smoothMouseX = null;
        this.easing = 0.15;

        // focus per-bar (0..1) to smoothly emphasize a hovered bar
        this.focus = []; // initialized after data load
        this.focusEasing = 0.18;

        this.x = d3.scaleLinear().range([this.margin.left, this.width - this.margin.right]);
        this.y = d3.scaleLinear().range([this.height - this.margin.bottom - 40, this.margin.top]);
        this.z = d3.scaleLinear().range([12, 3]);

        this.svg = d3.select(this.selector)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height + 40);

        this.svg.append("rect")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("fill", "white")
            .on("mousemove", (event) => this.handleMouseMove(event))
            .on("mouseleave", () => this.handleMouseLeave());

        this.container = this.svg.append("g");

        // Tooltip div
        // append tooltip to body so fixed positioning is independent of container transforms / display
        this.tooltip = d3.select("body")
            .append("div")
             .attr("class", "dna-tooltip")
             // use fixed positioning so the tooltip is positioned relative to the viewport
             // (prevents offsets when parent containers have CSS transforms during transitions)
             .style("position", "fixed")
             .style("z-index", 10000)
             .style("padding", "6px 10px")
             .style("background", "rgba(0, 0, 0, 0.75)")
             .style("color", "white")
             .style("border-radius", "5px")
             .style("font-size", "12px")
             .style("pointer-events", "none")
             .style("opacity", 0);


        this.axisGroup = this.svg.append("g")
            .attr("transform", `translate(0,${this.height - this.margin.bottom - 20})`);

        // legend under x-axis
        this.legendGroup = this.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${this.margin.left},${this.height - this.margin.bottom + 80})`);

        this.smoothMouseX = this.width / 2;
        this.mouseX = this.width / 2;

        window.addEventListener("scroll", () => {
            // Adjust spin rate; tweak divisor for sensitivity
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            this.scrollOffset = scrollY * 0.01;
        });

        this.loadData();
    }

    async loadData() {
        // --- Load and parse NDJSON file ---
        const text = await d3.text("data/processed/billboard_full.ndjson");
        const lines = text.trim().split("\n");
        const raw = lines.map(line => JSON.parse(line));

        // --- Filter valid entries (with date + features) ---
        const filtered = raw.filter(d => {
            const year = new Date(d.date).getFullYear();
            return year >= 1980 && !isNaN(year);
        });

        // --- Group by year and compute yearly averages ---
        const grouped = d3.rollups(
            filtered,
            v => ({
                acousticness: d3.mean(v, d => d.acousticness),
                danceability: d3.mean(v, d => d.danceability),
                energy: d3.mean(v, d => d.energy),
                liveness: d3.mean(v, d => d.liveness),
                tempo: d3.mean(v, d => d.tempo),
                valence: d3.mean(v, d => d.valence),
                speechiness: d3.mean(v, d => d.speechiness),
                loudness: d3.mean(v, d => d.loudness)
            }),
            d => new Date(d.date).getFullYear()
        );

        // --- Prepare and sort data ---
        this.yearData = grouped
            .map(([year, values]) => ({ year, ...values }))
            .sort((a, b) => a.year - b.year);

        this.numX = this.yearData.length;
        this.x.domain([0, this.numX - 1]);

        // --- Initialize visualization ---
        this.focus = new Array(this.numX).fill(0);

        this.createDropdown();
        this.setColorScales();
        this.drawXAxis();
        this.createLegend();
        this.animate();
    }


    createDropdown() {
        const container = d3.select(this.selector);
        // insert a label before the SVG so it appears to the left of the dropdown
        const label = container.insert("label", "svg")
            .attr("for", "visdna-feature-select")
            .style("margin-bottom", "12px")
            .style("margin-right", "8px")
            .style("font-size", "14px")
            .style("color", "#333")
            .style("vertical-align", "middle")
            .text("Select a Feature:");
        const dropdown = container.insert("select", "svg")
            .attr("id", "visdna-feature-select")
            .style("display", "inline-block")
            .style("margin-bottom", "12px")
            .style("padding", "8px 14px")
            .style("font-size", "14px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "6px")
            .style("background-color", "white")
            .style("color", "#333")
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.05)")
            .style("cursor", "pointer")
            .on("change", (event) => {
                this.feature = event.target.value;
                this.setColorScales();
                this.updateLegend();
                this.updateDescription();

                setGlobalFeature(event.target.value);
            });

        dropdown.selectAll("option")
            .data(this.features.sort())
            .enter()
            .append("option")
            .attr("value", d => d)
            .text(d => d[0].toUpperCase() + d.slice(1))
            .property("selected", d => d === this.feature);
    }

    setColorScales() {
        const vals = this.yearData.map(d => d[this.feature]);
        const [min, max] = d3.extent(vals);
        this.colorScales[this.feature].domain([min, max]);
    }

    drawXAxis() {
        const years = this.yearData.map(d => d.year);
        const xYears = d3.scaleBand()
            .domain(years)
            .range([this.margin.left, this.width - this.margin.right]);

        const xAxis = d3.axisBottom(xYears)
            .tickValues(years.filter((d, i) => i % 2 === 0))
            .tickSizeOuter(0);

        this.axisGroup.call(xAxis)
            .selectAll("text")
            .attr("dy", "1.2em")
            .style("font-size", "11px")
            .style("fill", "#555");

        this.axisGroup.selectAll(".x-axis-label").remove();
        const centerX = (this.margin.left + (this.width - this.margin.right)) / 2;
        this.axisGroup.append("text")
            .attr("class", "x-axis-label")
            .attr("x", centerX)
            .attr("y", 40) // positioned below tick labels
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "#333")
            .text("Year");
    }

    createLegend() {
        const legendWidth = this.width - this.margin.left - this.margin.right;
        const legendHeight = 10;

        this.legendScale = d3.scaleLinear().range([0, legendWidth]);
        this.legendAxis = d3.axisBottom(this.legendScale)
            .ticks(5)
            .tickFormat(d3.format(".2f"));

        this.svg.append("defs")
            .append("linearGradient")
            .attr("id", "legend-gradient-horizontal")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%");

        this.legendGroup.append("text")
            .attr("class", "legend-title")
            .attr("x", legendWidth / 2)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "#333")
            .text(this.feature.charAt(0).toUpperCase() + this.feature.slice(1));

        this.legendGroup.append("rect")
            .attr("class", "legend-rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", "url(#legend-gradient-horizontal)");

        this.legendGroup.append("g")
            .attr("class", "legend-axis")
            .attr("transform", `translate(0,${legendHeight})`);

        // attach the feature description to the legendGroup so it moves with the legend
        this.legendGroup.append("text")
            .attr("class", "feature-description")
            .attr("x", this.width / 2)
            .attr("y", legendHeight + 35) // positioned under the legend
            .attr("text-anchor", "middle")
            .attr("font-size", "13px")
            .attr("fill", "#444")
            .text(this.featureDescriptions[this.feature]);
        this.wrapText(this.legendGroup.select(".feature-description"), this.width * 0.8);

        this.updateLegend();
    }

    updateLegend() {
        const vals = this.yearData.map(d => d[this.feature]);
        const [min, max] = d3.extent(vals);
        this.legendScale.domain([min, max]);

        const gradient = d3.select("#legend-gradient-horizontal");
        const scale = this.colorScales[this.feature];
        const stops = d3.range(0, 1.01, 0.1);

        gradient.selectAll("stop").remove();
        gradient.selectAll("stop")
            .data(stops)
            .enter()
            .append("stop")
            .attr("offset", d => `${d * 100}%`)
            .attr("stop-color", d => scale(min + d * (max - min)));

        this.legendGroup.select(".legend-axis").call(this.legendAxis);
        this.legendGroup.select(".legend-title").text(
            this.feature.charAt(0).toUpperCase() + this.feature.slice(1)
        );
    }

    updateDescription() {
        // update the description attached to the legendGroup instead of an SVG-level text node
        this.legendGroup.select(".feature-description")
            .text(this.featureDescriptions[this.feature])
            .attr("fill", "#444");

        this.wrapText(this.legendGroup.select(".feature-description"), this.width * 0.8);
    }

    generateData(centerX) {
        const center = this.x.invert(centerX);
        const data = d3.range(this.numX).map((i) => {
            const t = (i - center) * this.torsion - this.scrollOffset;
            const yearObj = this.yearData[i];
            const colorVal = this.colorScales[this.feature](yearObj[this.feature]);
            return [
                { x: i, y: Math.cos(t), z: Math.sin(t), color: colorVal },
                { x: i, y: Math.cos(t - Math.PI), z: Math.sin(t - Math.PI), color: colorVal }
            ];
        });

        const flat = data.flat();
        this.y.domain(d3.extent(flat, d => d.y));
        this.z.domain(d3.extent(flat, d => d.z));
        return data;
    }

    draw(data) {
        const cont = this.container.selectAll("g.helix-group").data(data);
        cont.exit().remove();

        const enter = cont.enter().append("g").attr("class", "helix-group");
        // On enter: create structural elements and bind hover handlers once
        enter.each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            g.selectAll("circle")
                .data(d)
                .enter()
                .append("circle");
            g.append("line").attr("stroke-width", 3.5);

            // invisible hitbox for better tooltip area — bind handlers once here
            const hit = g.append("rect")
                .attr("class", "hitbox")
                .attr("fill", "transparent")
                .attr("pointer-events", "all");

            // capture index i and yearObj for tooltip and focus
            const yearObj = this.yearData[i];
            hit.on("mouseover", (event) => {
                // start focusing this bar
                this.hoveredIndex = i;
                this.targetPhaseCenter = this.x(i);

                d3.select(event.currentTarget).style("cursor", "pointer");

                const val = yearObj[this.feature];
                this.tooltip.transition().duration(100).style("opacity", 1);
                this.tooltip.html(
                    `<strong>Year:</strong> ${yearObj.year}<br>
                     <strong>${this.feature.charAt(0).toUpperCase() + this.feature.slice(1)}:</strong> ${val.toFixed(3)}`
                )
                    // use client coordinates when tooltip is fixed-positioned
                    .style("left", (event.clientX + 12) + "px")
                    .style("top", (event.clientY - 28) + "px");
            })
            .on("mousemove", (event) => {
                // update mouseX to keep the animation flowing
                const [x] = d3.pointer(event, this.svg.node());
                this.mouseX = Math.max(0, Math.min(this.width, x));

                // update tooltip position
                // use client coordinates for fixed-position tooltip
                this.tooltip
                    .style("left", (event.clientX + 12) + "px")
                    .style("top", (event.clientY - 28) + "px");
            })
            .on("mouseout", (event) => {
                // stop focusing
                this.hoveredIndex = -1;
                // allow the regular mouse-based centering to take over (center to current mouse position)
                this.targetPhaseCenter = this.smoothMouseX;
                this.tooltip.transition().duration(150).style("opacity", 0);

                d3.select(event.currentTarget).style("cursor", "default");
            })
            hit.on("click", () => {
                const year = this.yearData[i].year;
                this.onBarClick(year);
            });
        });

        cont.merge(enter).each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const inverted = (d[0].y < d[1].y) ? 1 : -1;
            const color = d[0].color;
            const xPos = this.x(d[0].x);

            // focus factor for this bar (0..1)
            const f = this.focus[i] || 0;

            // Update circles (dots)
            g.selectAll("circle")
                .data(d)
                .attr("cx", d => this.x(d.x))
                .attr("cy", d => this.y(d.y))
                // do NOT change radius based on focus — keep color scales visible
                .attr("r", d => this.z(d.z))
                .attr("fill", color)
                // show colors fully (no distance-based dimming)
                .attr("fill-opacity", 1);

            // Update connecting line (bar)
            // compute base endpoints
            const baseYTop = this.y(d[1].y) + inverted * this.z(d[1].z);
            const baseYBottom = this.y(d[0].y) - inverted * this.z(d[0].z);
            // target endpoints for a fully centered (vertical) helix at this index
            const targetYTop = this.y(1) + inverted * this.z(d[1].z);
            const targetYBottom = this.y(-1) - inverted * this.z(d[0].z);

            // blend endpoints towards target based on focus factor for smooth verticalization
            const lerp = (a, b, t) => a + (b - a) * t;
            const yTop = this.y(d[1].y) + inverted * this.z(d[1].z);
            const yBottom = this.y(d[0].y) - inverted * this.z(d[0].z);

            g.select("line")
                .attr("x1", xPos)
                .attr("x2", xPos)
                .attr("y1", yTop)
                .attr("y2", yBottom)
                .attr("stroke", color)
                .attr("stroke-width", 3.5)
                .attr("opacity", 1);

            // --- Invisible hitbox for tooltip interaction (position only) ---
            g.select(".hitbox")
                .attr("x", xPos - 6) // small width on either side
                .attr("y", this.margin.top)
                .attr("width", 12)   // hover area width (tweak if needed)
                .attr("height", this.height - this.margin.bottom - this.margin.top);
        });
    }


    handleMouseMove(event) {
        const [x] = d3.pointer(event);
        this.mouseX = Math.max(0, Math.min(this.width, x));
    }

    handleMouseLeave() {
        this.mouseX = this.width / 2;
    }

    animate() {
        if (this.yearData.length === 0) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Smooth mouse follow when not explicitly focusing on a bar
        this.smoothMouseX += (this.mouseX - this.smoothMouseX) * this.easing;

        // If a bar is hovered, drive phaseCenter toward that bar's x; otherwise follow mouse
        if (this.hoveredIndex >= 0) {
            // stronger/ faster easing when focusing on a bar so the helix snaps smoothly to it
            this.phaseCenter += (this.targetPhaseCenter - this.phaseCenter) * (this.phaseEasing * 2.0);
        } else {
            // normal behavior
            this.phaseCenter += (this.smoothMouseX - this.phaseCenter) * this.phaseEasing;
            // keep targetPhaseCenter in sync so on mouseout we can smoothly return
            this.targetPhaseCenter = this.smoothMouseX;
        }

        // animate focus array toward 1 for hovered index and 0 for others
        for (let i = 0; i < this.focus.length; i++) {
            const target = (i === this.hoveredIndex) ? 1 : 0;
            this.focus[i] += (target - (this.focus[i] || 0)) * this.focusEasing;
        }

        const data = this.generateData(this.phaseCenter);
        this.draw(data);
        requestAnimationFrame(() => this.animate());
    }

    onBarClick(year) {
        const dnaContainer = d3.select("#vis-dna");
        const yearlyContainer = d3.select("#vis-dna-yearly");

        // Fade out the main DNA view
        dnaContainer.transition()
            .duration(600)
            .ease(d3.easeCubicInOut)
            .style("opacity", 0)
            .on("end", async () => {
                dnaContainer.style("display", "none");

                // Prepare yearly container but keep hidden
                yearlyContainer
                    .style("display", "block")
                    .style("opacity", 0)
                    .style("transform", "translateY(30px)");

                // Clear any previous yearly content
                yearlyContainer.selectAll("*").remove();

                // --- Add a simple loading indicator ---
                const loadingText = yearlyContainer.append("div")
                    .attr("class", "yearly-loading")
                    .style("text-align", "center")
                    .style("margin-top", "100px")
                    .style("font-size", "16px")
                    .style("color", "#555")
                    .text("Loading top songs...");

                // --- Instantiate yearly visualization and await render() completion ---
                const yearlyVis = new VisDNAYearly("#vis-dna-yearly", {
                    width: 1100,
                    height: 500,
                    year: year,
                    feature: this.feature
                });

                // Wait until the yearlyVis finishes its async data load
                await yearlyVis.renderComplete;

                // Remove loading text
                loadingText.remove();

                // --- Now fade in the yearly visualization ---
                yearlyContainer.transition()
                    .duration(900)
                    .ease(d3.easeCubicOut)
                    .style("opacity", 1)
                    .style("transform", "translateY(0)");
            });
    }

    wrapText(textSelection, width) {
        textSelection.each(function() {
            const text = d3.select(this);
            const words = text.text().split(/\s+/).reverse();
            let word, line = [], lineNumber = 0;
            const lineHeight = 1.2; // ems
            const y = text.attr("y");
            const x = text.attr("x");
            const dy = 0; // no baseline offset
            let tspan = text.text(null)
                .append("tspan")
                .attr("x", x)
                .attr("y", y)
                .attr("dy", dy + "em");

            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));
                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = text.append("tspan")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("dy", ++lineNumber * lineHeight + dy + "em")
                        .text(word);
                }
            }
        });
    }
}
