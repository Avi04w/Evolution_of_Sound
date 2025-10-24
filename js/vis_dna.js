// ======================================================
// Visualization 1: The Audio Genome (DNA Helix)
// ======================================================

class AudioGenomeHelix {
    constructor(selector, config = {}) {
        // --- Configuration and defaults ---
        this.selector = selector;
        this.width = config.width || document.querySelector(selector).offsetWidth;
        this.height = config.height || 300;
        this.numX = config.numX || 40;
        this.speed = config.speed || 0.02;
        this.torsion = 0.5; // fixed torsion
        this.fills = config.fills || [
            '#00779C', '#00465C', '#54B8B1', '#377874',
            '#455560', '#7C99AC', '#F5CC49', '#F5CC9C', '#A8353D', '#682126'
        ];

        // --- Scales ---
        this.x = d3.scaleLinear().range([10, this.width - 10]);
        this.y = d3.scaleLinear().range([this.height - 10, 10]);
        this.z = d3.scaleLinear().range([10, 2]);

        // --- Create SVG ---
        this.svg = d3.select(this.selector)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        this.svg.append("rect")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("fill", "#0e1624");

        this.container = this.svg.append("g");
        this.counter = 0;

        // Start animation
        this.start();
    }

    generateData() {
        this.counter++;
        const data = d3.range(this.numX).map((d) => {
            const t = d * this.torsion - this.speed * this.counter;
            return [
                { x: d, y: Math.cos(t), z: Math.sin(t) },
                { x: d, y: Math.cos(t - Math.PI), z: Math.sin(t - Math.PI) }
            ];
        });

        const flat = data.flat();
        this.x.domain(d3.extent(flat, (d) => d.x));
        this.y.domain(d3.extent(flat, (d) => d.y));
        this.z.domain(d3.extent(flat, (d) => d.z));

        return data;
    }

    draw() {
        const data = this.generateData();

        const groups = this.container.selectAll("g").data(data);
        groups.exit().remove();

        const enterGroups = groups.enter()
            .append("g")
            .each((d, i, nodes) => {
                const group = d3.select(nodes[i]);
                group.selectAll("circle")
                    .data(d)
                    .enter()
                    .append("circle");
                group.append("line")
                    .attr("stroke", this.fills[i % this.fills.length])
                    .attr("stroke-width", 2);
            });

        const allGroups = enterGroups.merge(groups);

        allGroups.each((d, i, nodes) => {
            const inverted = (d[0].y < d[1].y) ? 1 : -1;
            const group = d3.select(nodes[i]);

            group.selectAll("circle")
                .data(d)
                .attr("cx", (d) => this.x(d.x))
                .attr("cy", (d) => this.y(d.y))
                .attr("r", (d) => this.z(d.z))
                .attr("fill-opacity", (d) => this.z(d.z) / 10)
                .attr("fill", this.fills[i % this.fills.length]);

            group.select("line")
                .attr("x1", this.x(d[0].x))
                .attr("x2", this.x(d[0].x))
                .attr("y1", this.y(d[1].y) + inverted * this.z(d[1].z))
                .attr("y2", this.y(d[0].y) - inverted * this.z(d[0].z))
                .attr("opacity", 0.3 * inverted * (d[1].y - d[0].y));
        });
    }

    start() {
        // Animation loop
        this.timer = d3.interval(() => this.draw(), 25);
    }

    stop() {
        if (this.timer) this.timer.stop();
    }
}

// --- Initialize visualization ---
document.addEventListener("DOMContentLoaded", () => {
    new AudioGenomeHelix("#vis-dna");
});
