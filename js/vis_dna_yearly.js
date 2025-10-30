// js/vis_dna_yearly.js
(function () {
    class VisDNAYearly {
        constructor(selector, config = {}) {
            this.selector = selector;
            this.year = config.year ?? 2000;
            this.feature = config.feature ?? "acousticness";

            this.margin = { top: 40, right: 24, bottom: 40, left: 160 };
            this.width = (config.width || 900);
            this.height = (config.height || 420);

            this.colorScales = {
                acousticness: d3.scaleSequential(d3.interpolateRgb("#bde0ff", "#012b42")),
                danceability: d3.scaleSequential(d3.interpolateRgb("#f4a5c4", "#230465")),
                energy:       d3.scaleSequential(d3.interpolateRgb("#ff976c", "#651b00")),
                liveness:     d3.scaleSequential(d3.interpolateRgb("#7affc7", "#064324")),
                tempo:        d3.scaleSequential(d3.interpolateRgb("#5e0000", "#ffaaaa")), // blue(slow)->red(fast)
                valence:      d3.scaleSequential(d3.interpolateRgb("#083957", "#c8c209")),
            };

            // user-provided feature descriptions
            this.featureDescriptions = {
                acousticness: "Higher values indicate a more acoustic (non-electronic) sound profile.",
                danceability: "Measures how suitable a track is for dancing — rhythm, tempo, and beat consistency.",
                energy: "Represents the intensity or activity of a track — higher values are louder and more dynamic.",
                liveness: "Estimates live performance presence — high values suggest audience sounds or live settings.",
                tempo: "The overall speed or pace of a track, measured in beats per minute (BPM).",
                valence: "Measures the musical positivity — higher values sound happier or more euphoric."
            };

            // use container to insert back button before SVG
            const container = d3.select(selector).html("");

            // Back button
            this.backButton = container.append("button")
                .attr("class", "dna-back-button")
                .style("display", "inline-block")
                .style("margin-bottom", "8px")
                .style("padding", "6px 10px")
                .style("font-size", "13px")
                .style("border-radius", "6px")
                .style("border", "1px solid #ccc")
                .style("background", "#fff")
                .style("color", "#333")
                .style("cursor", "pointer")
                .text("\u2190 Back")
                .on("click", () => this.goBack());

            this.svg = container.append("svg")
                .attr("width", this.width)
                .attr("height", this.height + 80);

            this.g = this.svg.append("g")
                .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

            this.title = this.svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", 24)
                .attr("text-anchor", "middle")
                .attr("font-weight", 600)
                .attr("fill", "#222")
                .text("");

            this.subtitle = this.svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", this.height - 10)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("fill", "#555");

            this.x = d3.scaleLinear().range([0, this.width - this.margin.left - this.margin.right]);
            this.y = d3.scaleBand().range([0, this.height - this.margin.top - this.margin.bottom]).padding(0.2);

            this.xAxisG = this.g.append("g").attr("class", "x-axis")
                .attr("transform", `translate(0,${this.height - this.margin.top - this.margin.bottom})`);
            this.yAxisG = this.g.append("g").attr("class", "y-axis");

            this.barsG = this.g.append("g");

            // --- Gradient Legend ---
            const legendWidth = this.width - this.margin.left - this.margin.right;
            const legendHeight = 10;

            // Create defs + gradient (use a single reusable id so rect always finds the gradient)
            this.svg.append("defs")
                .append("linearGradient")
                .attr("id", `yearly-gradient`)
                .attr("gradientUnits", "userSpaceOnUse")
                .attr("x1", 0)
                .attr("y1", 0)
                .attr("x2", legendWidth)
                .attr("y2", 0);

            // Group for legend
             this.legendGroup = this.svg.append("g")
                 .attr("class", "legend")
                 .attr("transform", `translate(${this.margin.left},${this.height - this.margin.bottom + 60})`);

             this.legendGroup.append("rect")
                 .attr("class", "legend-rect")
                 .attr("width", legendWidth)
                 .attr("height", legendHeight)
                 .attr("fill", `url(#yearly-gradient)`);

            this.legendTitle = this.legendGroup.append("text")
                .attr("class", "legend-title")
                .attr("x", legendWidth / 2)
                .attr("y", -8)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .attr("fill", "#333");

            this.legendScale = d3.scaleLinear().range([0, legendWidth]);
            this.legendAxis = d3.axisBottom(this.legendScale).ticks(5).tickSizeOuter(0);
            this.legendAxisG = this.legendGroup
                .append("g")
                .attr("class", "legend-axis")
                .attr("transform", `translate(0,${legendHeight})`);

            this.legendSubtitle = this.legendGroup.append("text")
                .attr("class", "legend-subtitle")
                .attr("x", legendWidth / 2)
                .attr("y", legendHeight + 30)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("fill", "#555");

            // initial render
            this.render();
        }

        // deterministic pseudo-random so it looks stable per year+feature
        #seed(str) {
            let h = 2166136261 >>> 0;
            for (let i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return h >>> 0;
        }
        #randGen(seed) {
            // mulberry32
            return function () {
                let t = (seed += 0x6D2B79F5);
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        async getTop10Songs(year, feature) {
            if (!this.rawData) {
                this.rawData = await d3.csv("data/processed/temp_dataset.csv", d3.autoType);
            }

            // Filter rows for that year
            const filtered = this.rawData.filter(d => {
                const songYear = new Date(d.date).getFullYear();
                return songYear === year && d.track_name && d.artists;
            });

            // Aggregate by unique song (track_name + artists)
            const aggregated = d3.rollups(
                filtered,
                v => ({
                    weeks_on_board: d3.max(v, d => d["weeks-on-board"]),
                    avg_value: d3.mean(v, d => d[feature])
                }),
                d => `${d.track_name} - ${d.artists}`
            );

            // Sort by most weeks on board
            const sorted = aggregated
                .sort((a, b) => b[1].weeks_on_board - a[1].weeks_on_board)
                .slice(0, 10)
                .map(([key, vals], i) => {
                    const [track, artists] = key.split(" - ");
                    return {
                        rank: i + 1,
                        track,
                        artists,
                        weeks_on_board: vals.weeks_on_board,
                        value: vals.avg_value
                    };
                });

            return sorted;
        }



        update(year, feature) {
            this.year = year ?? this.year;
            this.feature = feature ?? this.feature;
            this.render(true);
        }

        async render(animate = false) {
            const data = await this.getTop10Songs(this.year, this.feature);
            if (!data.length) return;

            const w = this.width - this.margin.left - this.margin.right;
            const h = this.height - this.margin.top - this.margin.bottom;

            const [minVal, maxVal] = d3.extent(data, d => d.value);

            // Ensure the color scale domain is set before we compute gradient stop colors.
            // For tempo we keep the earlier behavior of mapping the scale between xMax and 60 (so blue->red mapping remains),
            // otherwise map non-tempo features to [0,1].
            const xMax = this.feature === "tempo" ? Math.max(180, maxVal) : 1;
            if (this.feature === "tempo") {
                this.colorScales[this.feature].domain([xMax, 60]);
            } else {
                this.colorScales[this.feature].domain([0, 1]);
            }

             // update the shared gradient stops
             const gradient = this.svg.select(`#yearly-gradient`);
              gradient.selectAll("stop").remove();

             const stops = d3.range(0, 1.01, 0.1);
             gradient.selectAll("stop")
                 .data(stops)
                 .enter()
                 .append("stop")
                 .attr("offset", d => `${d * 100}%`)
                 .attr("stop-color", d => this.colorScales[this.feature](
                     minVal + d * (maxVal - minVal)
                 ));

            this.legendScale.domain([minVal, maxVal]);
            this.legendAxisG.call(this.legendAxis);
            this.legendTitle.text(
                `${this.feature.charAt(0).toUpperCase() + this.feature.slice(1)} Scale`
            );

            const featName = this.feature.charAt(0).toUpperCase() + this.feature.slice(1);
            // Use the detailed per-feature description provided by the main view
            this.legendSubtitle.text(this.featureDescriptions[this.feature] || "");

            this.x.domain([0, xMax]);
            this.y.domain(data.map(d => `${d.rank}. ${d.track}`));

            const xAxis = d3.axisBottom(this.x).ticks(6).tickSizeOuter(0);
            const yAxis = d3.axisLeft(this.y).tickSizeOuter(0);

            this.xAxisG.transition().duration(animate ? 300 : 0).call(xAxis);
            this.yAxisG.transition().duration(animate ? 300 : 0).call(yAxis);

            const bars = this.barsG.selectAll("rect.bar").data(data, d => d.track);
            bars.exit().transition().duration(200).attr("width", 0).remove();

            const enter = bars.enter().append("rect")
                .attr("class", "bar")
                .attr("x", 0)
                .attr("y", d => this.y(`${d.rank}. ${d.track}`))
                .attr("height", this.y.bandwidth())
                .attr("rx", 4).attr("ry", 4)
                .attr("fill", d => this.colorScales[this.feature](d.value))
                .attr("width", 0);

            enter.merge(bars)
                .transition().duration(animate ? 350 : 0)
                .attr("y", d => this.y(`${d.rank}. ${d.track}`))
                .attr("height", this.y.bandwidth())
                .attr("fill", d => this.colorScales[this.feature](d.value))
                .attr("width", d => this.x(d.value));

            const labels = this.barsG.selectAll("text.value").data(data, d => d.track);
            labels.exit().transition().duration(200).attr("x", 0).style("opacity", 0).remove();

            const lEnter = labels.enter().append("text")
                .attr("class", "value")
                .attr("y", d => this.y(`${d.rank}. ${d.track}`) + this.y.bandwidth() / 2)
                .attr("x", 6)
                .attr("dy", "0.35em")
                .attr("fill", "#111")
                .attr("font-size", 12)
                .style("opacity", 0)
                .text(d => this.feature === "tempo" ? `${d.value.toFixed(1)} BPM` : d.value.toFixed(3));

            lEnter.merge(labels)
                .transition().duration(animate ? 350 : 0)
                .attr("y", d => this.y(`${d.rank}. ${d.track}`) + this.y.bandwidth() / 2)
                .attr("x", d => this.x(d.value) + 6)
                .style("opacity", 1)
                .text(d => this.feature === "tempo" ? `${d.value.toFixed(1)} BPM` : d.value.toFixed(3));

            this.title.text(`Top 10 Charting Songs of ${this.year} • ${featName}`);
        }

        // transitions back to the DNA view
        goBack() {
            const dnaContainer = d3.select("#vis-dna");
            const yearlyContainer = d3.select("#vis-dna-yearly");

            // Fade out yearly view then show DNA view (mirrors the onBarClick flow)
            yearlyContainer.transition()
                .duration(400)
                .style("opacity", 0)
                .on("end", () => {
                    yearlyContainer.style("display", "none");
                    dnaContainer.style("display", "block")
                        .style("opacity", 0)
                        .transition()
                        .duration(450)
                        .style("opacity", 1);
                });
        }
    }

    window.VisDNAYearly = VisDNAYearly;
})();
