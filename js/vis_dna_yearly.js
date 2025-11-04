const FEATURE_BOUNDS = {
    acousticness: [0, 0.7],
    danceability: [0.20, 1],
    energy:       [0.2, 1],
    liveness:     [0, 0.75],
    tempo:        [60, 190],
    valence:      [0, 1]
};

(function () {
    class VisDNAYearly {
        constructor(selector, config = {}) {
            this.selector = selector;
            this.year = config.year ?? 2000;
            this.feature = config.feature ?? "acousticness";
            this.width = config.width || 1100;
            this.height = config.height || 600;
            this.margin = { top: 60, right: 40, bottom: 40, left: 40 };

            // --- identical color scales ---
            this.colorScales = {
                acousticness: d3.scaleSequential(d3.interpolateRgb("#d5e9ff", "#012b42")),
                danceability: d3.scaleSequential(d3.interpolateRgb("#ffc7de", "#230465")),
                energy:       d3.scaleSequential(d3.interpolateRgb("#fbc4af", "#651b00")),
                liveness:     d3.scaleSequential(d3.interpolateRgb("#b3ffc3", "#003e1f")),
                tempo:        d3.scaleSequential(d3.interpolateRgb("#ffabab", "#5e0000")), // blue(slow)->red(fast)
                valence:      d3.scaleSequential(d3.interpolateRgb("#083957", "#ded700")),
            };

            // short human-readable descriptions (used by the legend description)
            this.featureDescriptions = {
                acousticness: "Higher values indicate a more acoustic (non-electronic) sound profile.",
                danceability: "Measures how suitable a track is for dancing — rhythm, tempo, and beat consistency.",
                energy: "Represents the intensity or activity of a track — higher values are louder and more dynamic.",
                liveness: "Estimates live performance presence — high values suggest audience sounds or live settings.",
                tempo: "The overall speed or pace of a track, measured in beats per minute (BPM).",
                valence: "Measures the musical positivity — higher values sound happier or more euphoric."
            };

            const container = d3.select(selector).html("");
            container.append("button")
                .attr("class", "dna-back-button")
                .style("margin-bottom", "10px")
                .style("padding", "6px 10px")
                .style("border", "1px solid #ccc")
                .style("border-radius", "6px")
                .style("cursor", "pointer")
                .style("background", "white")
                .text("← Back")
                .on("click", () => this.goBack());

            this.svg = container.append("svg")
                .attr("width", this.width)
                .attr("height", this.height + 100)
                .style("display", "block")      // make it behave like a block element
                .style("margin", "0 auto");

            this.title = this.svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", 30)
                .attr("text-anchor", "middle")
                .attr("font-size", 18)
                .attr("font-weight", 600)
                .attr("fill", "#222");

            // subtitle (smaller text, will be set per-feature in render)
            // this.subtitle = this.svg.append("text")
            //     .attr("x", this.width / 2)
            //     .attr("y", 50) // directly under the main title so it's visible
            //     .attr("text-anchor", "middle")
            //     .attr("font-size", 12)
            //     .attr("fill", "#555")
            //     .text("");

            this.phase = 0;
            this.helixData = [];
            this.renderComplete = this.render();
        }

        async getTop10Songs(year, feature) {
            if (!this.rawData) {
                const text = await d3.text("data/processed/billboard_full.ndjson");
                const lines = text.trim().split("\n");
                this.rawData = lines.map(line => JSON.parse(line));
            }

            const filtered = this.rawData.filter(d => {
                const songYear = new Date(d.date).getFullYear();
                return songYear === year && d.name && d.artists;
            });

            const aggregated = d3.rollups(
                filtered,
                v => ({
                    id: v[0]?.id,
                    weeks_on_board: d3.max(v, d => d["weeks-on-board"] || 0),
                    avg_value: d3.mean(v, d => d[feature] ?? 0)
                }),
                d => {
                    const artistList = Array.isArray(d.artists) ? d.artists.join(", ") : d.artists;
                    return `${d.name} - ${artistList}`;
                }
            );

            return aggregated
                .sort((a, b) => b[1].weeks_on_board - a[1].weeks_on_board)
                .slice(0, 10)
                .map(([key, vals], i) => {
                    const splitIdx = key.lastIndexOf(" - ");
                    const track = key.slice(0, splitIdx);
                    const artists = key.slice(splitIdx + 3);
                    return {
                        rank: i + 1,
                        track,
                        artists,
                        id: vals.id,
                        weeks_on_board: vals.weeks_on_board,
                        value: vals.avg_value
                    };
                });
        }

        async render() {
            const data = await this.getTop10Songs(this.year, this.feature);
            if (!data.length) return;

            this.title.text(`Top 10 Longest Charting Songs of ${this.year} • ${this.feature.charAt(0).toUpperCase() + this.feature.slice(1)}`);

            this.svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", 50)
                .attr("text-anchor", "middle")
                .attr("font-size", 13)
                .attr("fill", "#666")
                .text("Click on a title to hear the song");

            const colorScale = this.colorScales[this.feature];
            const [min, max] = FEATURE_BOUNDS[this.feature];
            colorScale.domain([min, max]);

            // --- Adjust grid layout ---
            const cols = 5, rows = 2;
            const horizontalCompression = 1.5; // increases width, reduces side gap
            const verticalSpacingFactor = 1.5; // increases row gap

            const helixWidth = ((this.width - this.margin.left - this.margin.right) / cols) / horizontalCompression;
            const helixHeight = ((this.height - this.margin.top - this.margin.bottom - 60) / rows) * verticalSpacingFactor;

            const g = this.svg.append("g")
                .attr("transform", `translate(${this.margin.left}, ${this.margin.top + 60})`);

            this.helixData = data.map((d, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const xOffset = col * (helixWidth * horizontalCompression) + helixWidth / 2 + 35;
                const yOffset = row * helixHeight + 30;

                const group = g.append("g")
                    .attr("transform", `translate(${xOffset}, ${yOffset})`);

                // Combined rank + title

                const trackText = `#${d.rank}: ${d.track}`;

                if (trackText.length > 32) {
                    const firstPart = trackText.slice(0, 32);
                    const secondPart = trackText.slice(32, 64);

                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 - 20)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 11.5)
                        .attr("font-weight", 600)
                        .on("click", () => {
                            if (d.id) {
                                showSpotifyPlayer(d.id);
                            } else {
                                console.warn("No Spotify ID found for", d.track);
                            }
                        })
                        .on("mouseover", function() {
                            d3.select(this).attr("fill", "#00e676");
                            d3.select(this).style("cursor", "pointer");
                        })
                        .on("mouseout", function() {
                            d3.select(this).attr("fill", "#000000");
                        })
                        .text(firstPart);

                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + - 5)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 11.5)
                        .attr("font-weight", 600)
                        .on("click", () => {
                            if (d.id) {
                                showSpotifyPlayer(d.id);
                            } else {
                                console.warn("No Spotify ID found for", d.track);
                            }
                        })
                        .on("mouseover", function() {
                            d3.select(this).attr("fill", "#00e676");
                            d3.select(this).style("cursor", "pointer");
                        })
                        .on("mouseout", function() {
                            d3.select(this).attr("fill", "#000000");
                        })
                        .text(secondPart);
                } else {
                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 - 12.5)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 11.5)
                        .attr("font-weight", 600)
                        .on("click", () => {
                            if (d.id) {
                                showSpotifyPlayer(d.id);
                            } else {
                                console.warn("No Spotify ID found for", d.track);
                            }
                        })
                        .on("mouseover", function() {
                            d3.select(this).attr("fill", "#00e676");
                            d3.select(this).style("cursor", "pointer");
                        })
                        .on("mouseout", function() {
                            d3.select(this).attr("fill", "#000000");
                        })
                        .text(trackText);
                }

                if (d.artists.length > 35) {
                    const firstPart = d.artists.slice(0, 30);
                    const secondPart = d.artists.slice(30);

                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + 10)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 10)
                        .attr("fill", "#555")
                        .text(firstPart);
                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + 20)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 10)
                        .attr("fill", "#555")
                        .text(secondPart);

                    // feature value label (below the two artist lines)
                    const valLabelTwoLine = (this.feature === 'tempo')
                        ? `${this.feature}: ${d.value.toFixed(1)} BPM`
                        : `${this.feature}: ${d.value.toFixed(3)}`;
                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + 34)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 9)
                        .attr("fill", "#333")
                        .text(valLabelTwoLine);
                }
                else {
                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + 10)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 10)
                        .attr("fill", "#555")
                        .text(d.artists);

                    // feature value label (below the single artist line)
                    const valLabel = (this.feature === 'tempo')
                        ? `${this.feature}: ${d.value.toFixed(1)} BPM`
                        : `${this.feature}: ${d.value.toFixed(3)}`;
                    group.append("text")
                        .attr("x", 0)
                        .attr("y", helixHeight / 2 + 26)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 9)
                        .attr("fill", "#333")
                        .text(valLabel);
                }

                // Helix parameters (make wider + thicker)
                return {
                    group,
                    color: colorScale(d.value),
                    torsion: 0.3,
                    numX: 10,
                    height: helixHeight / 2,
                    width: helixWidth / 0.75 // wider strands
                };
            });

            // --- Legend: color gradient + text (placed under the 10 helices) ---
             // compute legend placement just below the helix grid
             const legendWidth = this.width - this.margin.left - this.margin.right;
             const legendHeight = 12;
             const legendY = this.margin.top + 40 + helixHeight * rows + 12; // a bit below the helices

            // ensure SVG is tall enough to show the legend (increase if needed)
            const requiredSvgHeight = Math.max(+this.svg.attr('height'), legendY + legendHeight + 80);
            this.svg.attr('height', requiredSvgHeight);

            // remove previous yearly legend/gradient if present (avoid duplicates on re-render)
            this.svg.select('#yearly-legend-gradient-horizontal').remove();
            this.svg.select('#yearly-legend-group').remove();

             // defs + linear gradient
            this.svg.append("defs")
                .append("linearGradient")
                .attr("id", "yearly-legend-gradient-horizontal")
                .attr("x1", "0%").attr("y1", "0%")
                .attr("x2", "100%").attr("y2", "0%");

            const legendGroup = this.svg.append("g")
                .attr("id", "yearly-legend-group")
                .attr("class", "legend")
                .attr("transform", `translate(${this.margin.left}, ${legendY})`);

            // title above the gradient
            legendGroup.append("text")
                .attr("class", "legend-title")
                .attr("x", legendWidth / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .attr("fill", "#333")
                .text(this.feature.charAt(0).toUpperCase() + this.feature.slice(1));

            // gradient rect
            legendGroup.append("rect")
                .attr("class", "legend-rect")
                .attr("width", legendWidth)
                .attr("height", legendHeight)
                .attr("fill", "url(#yearly-legend-gradient-horizontal)");

            // axis for gradient
            const legendScale = d3.scaleLinear().range([0, legendWidth]).domain([min, max]);
            const legendAxis = d3.axisBottom(legendScale).ticks(5).tickFormat(d3.format('.2f'));
            legendGroup.append("g")
                .attr("class", "legend-axis")
                .attr("transform", `translate(0,${legendHeight})`)
                .call(legendAxis);

            // description below the gradient
            legendGroup.append("text")
                .attr("class", "feature-description")
                .attr("x", legendWidth / 2)
                .attr("y", legendHeight + 35)
                .attr("text-anchor", "middle")
                .attr("font-size", "13px")
                .attr("fill", "#444")
                .text(this.featureDescriptions ? (this.featureDescriptions[this.feature] || "") : "");

            // populate gradient stops using the colorScale and data extent
            const grad = d3.select("#yearly-legend-gradient-horizontal");
            const stops = d3.range(0, 1.01, 0.1);
            grad.selectAll("stop").remove();
            grad.selectAll("stop")
                .data(stops)
                .enter()
                .append("stop")
                .attr("offset", d => `${d * 100}%`)
                .attr("stop-color", d => colorScale(min + d * (max - min)));

            // update subtitle with the feature description (kept near the title)
            // if (this.subtitle) {
            //     this.subtitle.text(this.featureDescriptions ? (this.featureDescriptions[this.feature] || "") : "");
            //     this.subtitle.attr("fill", "#555").raise();
            //     // also ensure main title is on top
            //     if (this.title) this.title.raise();
            //  }

            this.animate();
            return Promise.resolve();
        }

        animate() {
            const loop = () => {
                this.phase += 0.01;
                this.drawHelices();
                requestAnimationFrame(loop);
            };
            loop();
        }

        drawHelices() {
            this.helixData.forEach(cfg => {
                const { group, color, torsion, numX, height, width } = cfg;
                group.selectAll("*:not(text)").remove();

                const y = d3.scaleLinear().domain([-1, 1]).range([height / 2, -height / 2]);
                const z = d3.scaleLinear().domain([-1, 1]).range([6, 2]);
                const x = d3.scaleLinear().domain([0, numX]).range([-width / 2, width / 2]);

                const data = d3.range(numX).map(i => {
                    const t = (i - numX / 2) * torsion + this.phase;
                    return [
                        { x: i, y: Math.cos(t), z: Math.sin(t), color },
                        { x: i, y: Math.cos(t - Math.PI), z: Math.sin(t - Math.PI), color }
                    ];
                });

                data.forEach(pair => {
                    const inverted = pair[0].y < pair[1].y ? 1 : -1;
                    const yTop = y(pair[1].y) + inverted * z(pair[1].z);
                    const yBottom = y(pair[0].y) - inverted * z(pair[0].z);
                    const xPos = x(pair[0].x);

                    group.append("line")
                        .attr("x1", xPos)
                        .attr("x2", xPos)
                        .attr("y1", yTop)
                        .attr("y2", yBottom)
                        .attr("stroke", color)
                        .attr("stroke-width", 4.5) // thicker rods
                        .attr("opacity", 0.9);
                });

                group.selectAll("circle")
                    .data(data.flat())
                    .enter()
                    .append("circle")
                    .attr("cx", d => x(d.x))
                    .attr("cy", d => y(d.y))
                    .attr("r", d => z(d.z))
                    .attr("fill", color)
                    .attr("opacity", 1);
            });
        }

        goBack() {
            const dnaContainer = d3.select("#vis-dna");
            const yearlyContainer = d3.select("#vis-dna-yearly");

            yearlyContainer.transition()
                .duration(800)
                .ease(d3.easeCubicInOut)
                .style("transform", "translateY(-30px)")
                .style("opacity", 0)
                .on("end", () => {
                    yearlyContainer.style("display", "none");
                    dnaContainer.style("display", "block")
                        .style("opacity", 0)
                        .style("transform", "translateY(30px)")
                        .transition()
                        .duration(800)
                        .ease(d3.easeCubicOut)
                        .style("opacity", 1);
                });
        }
    }

    window.VisDNAYearly = VisDNAYearly;
})();
