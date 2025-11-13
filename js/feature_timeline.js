class FeatureTimeline {
    constructor(parent, feature) {
        this.parent = parent;
        this.feature = feature;
        this.margin = { top: 40, right: 40, bottom: 50, left: 60 };
        this.width = 900;
        this.height = 350;

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
        }).filter(d => d.value != null);

        vis.timeline.sort((a, b) => a.year - b.year);

        vis.updateVis();
    }

    updateVis() {
        const vis = this;

        vis.xScale
            .domain(d3.extent(vis.timeline, d => d.year))
            .range([0, vis.width]);

        vis.yScale
            .domain([0, d3.max(vis.timeline, d => d.value)])
            .nice()
            .range([vis.height, 0]);

        const lineGen = d3.line()
            .x(d => vis.xScale(d.year))
            .y(d => vis.yScale(d.value))
            .curve(d3.curveMonotoneX);

        const color = window.dnaVis?.colorScales?.[vis.feature]
            || d3.scaleSequential(d3.interpolateBlues); // fallback just in case

        // apply max value to color scale domain
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
            .call(d3.axisBottom(vis.xScale).tickFormat(d3.format("d")));

        vis.yAxis
            .transition()
            .duration(600)
            .call(d3.axisLeft(vis.yScale));
    }

    setFeature(feature) {
        this.feature = feature;
        this.processData();
    }
}

// --------------------------
// Instantiate after load
// --------------------------
document.addEventListener("DOMContentLoaded", function () {
    window.featureTimeline = new FeatureTimeline("#feature-timeline-vis", feature);

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