class FeatureTimeline {
    constructor(parent, feature, events) {
        this.parent = parent;
        this.feature = feature;
        this.margin = { top: 40, right: 40, bottom: 50, left: 60 };
        this.width = window.innerWidth * 0.8;
        this.height = window.innerHeight * 0.6;
        this.events = events;

        this.initVis();
    }

    initVis() {
        const vis = this;

        vis.svg = d3.select(vis.parent)
            .append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

        vis.chart = vis.svg.append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

        vis.xScale = d3.scaleLinear();
        vis.yScale = d3.scaleLinear();

        vis.xAxis = vis.chart.append("g")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxis = vis.chart.append("g");

        vis.linePath = vis.chart.append("path")
            .attr("fill", "none")
            .attr("stroke", "#007bff")
            .attr("stroke-width", 3);

        vis.eventTooltip = d3.select("body")
            .append("div")
            .attr("class", "event-tooltip")

        this.loadData();
    }

    loadData() {
        const vis = this;

        d3.text("data/processed/billboard_full.ndjson").then(raw => {

            // split by line and JSON-parse each line
            vis.rawData = raw
                .split("\n")
                .filter(l => l.trim().length > 0)
                .map(l => JSON.parse(l));

            vis.processData();
        });
    }

    processData() {
        const vis = this;

        // group by year
        const yearMap = d3.group(
            vis.rawData,
            d => new Date(d.date).getFullYear()
        );

        vis.timeline = Array.from(yearMap, ([year, songs]) => {
            const valid = songs.filter(s => s[vis.feature] != null && !isNaN(s[vis.feature]));
            const avg = d3.mean(valid, d => d[vis.feature]);
            return { year: +year, value: avg };
        }).filter(d => d.value != null && d.year >= 1980);

        vis.timeline.sort((a, b) => a.year - b.year);

        vis.updateVis();
    }

    updateVis() {
        const vis = this;
        console.log(vis.timeline)

        vis.xScale
            .domain(d3.extent(vis.timeline, d => d.year))
            .range([0, vis.width]);

        vis.yScale
            .domain([d3.min(vis.timeline, d => d.value), d3.max(vis.timeline, d => d.value)])
            .nice()
            .range([vis.height, 0]);

        const lineGen = d3.line()
            .x(d => vis.xScale(d.year))
            .y(d => vis.yScale(d.value))
            .curve(d3.curveMonotoneX);

        const color = window.dnaVis?.colorScales?.[vis.feature]
            || d3.scaleSequential(d3.interpolateBlues); // fallback just in case

        const maxVal = d3.max(vis.timeline, d => d.value);
        color.domain([0, maxVal]);

        vis.linePath
            .datum(vis.timeline)
            .transition()
            .duration(800)
            .attr("d", lineGen)
            .attr("stroke", color(maxVal));

        vis.xAxis
            .transition()
            .duration(600)
            .call(d3.axisBottom(vis.xScale).tickFormat(d3.format("d")).tickPadding(10))

        vis.xAxis
            .selectAll(".domain")
            .transition()
            .duration(600)
            .style("opacity", 0);

        vis.xAxis
            .selectAll("line")
            .style("opacity", 0);

        vis.yAxis
            .transition()
            .duration(600)
            .call(d3.axisLeft(vis.yScale))
            .transition()
            .duration(600)
            .call(d3.axisLeft(vis.yScale).tickSize(-vis.width).tickPadding(12))

        vis.yAxis
            .selectAll(".domain")
            .transition()
            .duration(600)
            .style("opacity", 0);

        vis.yAxis
            .selectAll("line")
            .attr("stroke", "#ccc")
            .attr("stroke-dasharray", "3 3");

        vis.svg.selectAll(".axis-label").remove();

        // x axis label
        this.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", (this.width + this.margin.left + this.margin.right) / 2)
            .attr("y", this.height + this.margin.bottom + this.margin.top)
            .attr("text-anchor", "middle")
            .attr("font-size", 16)
            .attr("fill", "#333")
            .text("Year")

        // y axis label
        this.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", -(this.height / 2))
            .attr("y", this.margin.left - 50)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .attr("font-size", 16)
            .attr("fill", "#333")
            .style("opacity", 0)
            .text(this.feature)
            .transition()
            .duration(1000)
            .style("opacity", 1)

        // --- Draw area ---
        const areaGen = d3.area()
            .x(d => vis.xScale(d.year))
            .y0(vis.height)
            .y1(d => vis.yScale(d.value))
            .curve(d3.curveMonotoneX);

        const areaPath = vis.chart.selectAll(".line-area").data([vis.timeline]);
        areaPath.enter()
            .append("path")
            .attr("class", "line-area")
            .attr("fill", "url(#line-gradient)")
            .merge(areaPath)
            .transition()
            .duration(800)
            .attr("d", areaGen);


        // --- Squares on line for each year tick ---
        const squareSize = 6; // size of square
        const points = vis.chart.selectAll(".year-square")
            .data(vis.timeline, d => d.year);

        points.exit().remove();
        points.enter()
            .append("rect")
            .attr("class", "year-square")
            .attr("width", squareSize)
            .attr("height", squareSize)
            .attr("x", d => vis.xScale(d.year) - squareSize / 2)
            .attr("y", d => vis.yScale(d.value) - squareSize / 2)
            .attr("fill", color(maxVal))
            .merge(points)
            .transition()
            .duration(800)
            .attr("x", d => vis.xScale(d.year) - squareSize / 2)
            .attr("y", d => vis.yScale(d.value) - squareSize / 2)
            .attr("fill", color(maxVal));

        // --- Gradient under the line ---
        let defs = vis.svg.select("defs");
        if (defs.empty()) defs = vis.svg.append("defs");
        let gradient = defs.selectAll("#line-gradient").data([1]);
        const gradientEnter = gradient.enter()
            .append("linearGradient")
            .attr("id", "line-gradient")
            .attr("x1", "0%")
            .attr("x2", "0%")
            .attr("y1", "0%")
            .attr("y2", "100%");

        gradient = gradientEnter.merge(gradient);
        const stopsData = [
            { offset: "0%", color: color(maxVal), opacity: 0.4 },
            { offset: "100%", color: color(maxVal), opacity: 0 }
        ];

        let stops = gradient.selectAll("stop").data(stopsData);
        stops.enter()
            .append("stop")
            .merge(stops) // update existing stops
            .attr("offset", d => d.offset)
            .attr("stop-color", d => d.color)
            .attr("stop-opacity", d => d.opacity);

        stops.exit().remove();

        // --- Filter events for the current feature ---
        const featureEvents = this.events[this.feature] || [];
        const markers = this.chart.selectAll(".event-marker")
            .data(featureEvents, d => d.year);
        const markersEnter = markers.enter()
            .append("circle")
            .attr("class", "event-marker")
            .attr("r", 0)
            .attr("fill", "#ff4136")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("cx", d => this.xScale(d.year))
            .attr("cy", d => {
                const point = this.timeline.find(t => t.year === d.year);
                return point ? this.yScale(point.value) : this.height;
            })
            .style("opacity", 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .ease(d3.easeCubicOut)
                    .attr("r", 10);

                this.eventTooltip
                    .style("opacity", 1)
                    .html(this.eventTooltipHTML(d));

                this.updateEventTooltipPos(event);
            })
            .on("mousemove", (event) => {
                this.updateEventTooltipPos(event);
            })
            .on("mouseleave", (event) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .ease(d3.easeCubicOut)
                    .attr("r", 8);

                this.eventTooltip.style("opacity", 0);
            });

        markersEnter.transition()
            .delay((_, i) => 1300 + i * 400) // staggers
            .duration(800)
            .ease(d3.easeElasticOut)
            .attr("r", 8)
            .style("opacity", 1);

        markers.transition()
            .duration(800)
            .attr("cx", d => this.xScale(d.year))
            .attr("cy", d => {
                const point = this.timeline.find(t => t.year === d.year);
                return point ? this.yScale(point.value) : this.height;
            });

        markers.exit()
            .transition()
            .duration(400)
            .style("opacity", 0)
            .remove();
    }

    setFeature(feature) {
        this.feature = feature;
        this.processData();
    }

    updateEventTooltipPos(event) {
        const tooltipWidth = this.eventTooltip.node().offsetWidth;
        const tooltipHeight = this.eventTooltip.node().offsetHeight;
        const x = event.pageX - tooltipWidth / 2;
        const y = event.pageY - tooltipHeight - 20;

        this.eventTooltip
            .style("left", `${x}px`)
            .style("top", `${y}px`);
    }

    eventTooltipHTML(d) {
        return `
            <img src=${d.image}>
            <div id="event-title"><strong>${d.event}</strong> (${d.year})</div>
            <div id="event-content-container">
                ${d.contents.map((text) => {
                    return `<div>• ${text}</div>`;
                }).join(" ")}
            </div>
        `;
    }
}

FEATURE_EVENTS = {
    acousticness: [
        {
            year: 1984,
            event: "Synth-pop and drum machines take over pop music",
            contents: [
                "Affordable drum machines and synthesizers exploded in popularity.",
                "Electronic pop groups dominated the charts.",
                "This drove a major decline in acoustic instrumentation in Billboard hits."
            ],
            image: "https://media.sweetwater.com/m/insync/2022/11/Must-see-Drum-Machines-and-Sequencers-2022-Featured-Image.jpg"
        },
        {
            year: 1991,
            event: "MTV Unplugged sparks acoustic revival",
            contents: [
                "Acoustic performances became culturally influential.",
                "Artists embraced more organic arrangements.",
                "Billboard charts saw a rise in acoustic-driven songs."
            ],
            image: "https://ew.com/thmb/AfL5Y11qtqyS7joq9gBns9Rtr8o=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/kurt-cobain-eca1479b11b64710a464b2580aa33fba.jpg"
        },
        {
            year: 2006,
            event: "Digital production fully replaces traditional studio methods",
            contents: [
                "Pro Tools setups became the industry default.",
                "Reliance on synthetic instruments increased.",
                "Overall acousticness dipped sharply."
            ],
            image: "https://media.sweetwater.com/m/insync/import/Live6-large.jpg"
        },
        {
            year: 2012,
            event: "EDM boom drives historic low in acousticness",
            contents: [
                "Calvin Harris, Avicii, and David Guetta defined the chart sound.",
                "Synthetic leads and electronic drops dominated pop.",
                "Billboard acousticness reached an all-time low."
            ],
            image: "https://res.cloudinary.com/jerrick/image/upload/d_642250b563292b35f27461a7.png,f_jpg,fl_progressive,q_auto,w_1024/64b39ae7edf3c6001d7b2239.jpg"
        },
        {
            year: 2020,
            event: "Indie & bedroom pop reintroduce acoustic textures",
            contents: [
                "Lo-fi and intimate production gained mainstream traction.",
                "Acoustic guitars returned to streaming-era pop.",
                "This reversed years of low acousticness."
            ],
            image: "https://images2.alphacoders.com/137/1372963.png"
        },
        {
            year: 2021,
            event: "Organic, raw songwriting hits the mainstream",
            contents: [
                "Artists embraced stripped-down, emotionally honest production.",
                "Acoustic and semi-acoustic tracks topped charts.",
                "Acousticness reached its highest point in over a decade."
            ],
            image: "https://cdn.mos.cms.futurecdn.net/v6wtvNm6y9mCVFKwcmMBQC-1920-80.jpg"
        },
    ],
    danceablility: [],
    energy: [],
    loudness: [],
    speechieness: [],
    tempo: [],
    valance: []
};

// --------------------------
// Instantiate after load
// --------------------------
document.addEventListener("DOMContentLoaded", function () {
    window.featureTimeline = new FeatureTimeline("#feature-timeline-vis", feature, FEATURE_EVENTS);

    const selector = document.getElementById("feature-select");

    selector.addEventListener("change", () => {
        featureTimeline.setFeature(selector.value);

        const title = document.querySelector("#feature-timeline-section .chart-title");
        title.textContent =
            "A Final Look at " +
            selector.value.charAt(0).toUpperCase() +
            selector.value.slice(1);
    });
});

document.addEventListener("DOMContentLoaded", function () {

    const mainSelect = document.getElementById("feature-select");
    const titleSelect = document.getElementById("feature-title-select");

    // initialize title dropdown to match global `feature`
    titleSelect.value = feature;

    // === when main dropdown changes ===
    mainSelect.addEventListener("change", () => {
        const f = mainSelect.value;

        feature = f;                       // update global
        titleSelect.value = f;             // sync title dropdown
        featureTimeline.setFeature(f);     // update timeline
    });

    // === when title dropdown changes ===
    titleSelect.addEventListener("change", (e) => {
        setGlobalFeature(e.target.value);
    });

});