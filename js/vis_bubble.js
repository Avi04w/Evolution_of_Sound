class BubblePlayerViz {
  constructor({ selector, data, centerSelector, recordPlayer, songsPath = "./songs/" }) {
    this.svg = d3.select(selector);
    this.centerEl = document.querySelector(centerSelector);
    this.data = data;
    this.songsPath = songsPath;
    this.activeBubble = null;
    this.currentSongId = null;
    this.recordPlayer = recordPlayer;

    this.init();
    this.render();
    // this.attachResizeHandler();
  }

  init() {
    const size = Math.min(window.innerWidth, window.innerHeight) * 1.3;
    this.width = size;
    this.height = size;
    this.tooltip = d3.select("#bubble-tooltip");
    this.hideTimeout = null;

    this.svg.attr("viewBox", [0, 0, this.width, this.height]);

    const rect = this.centerEl.getBoundingClientRect();
    this.centerX = this.width / 2;
    this.centerY = window.scrollY + rect.top + rect.height / 2;

    this.nodes = [
      { id: "center", isCenter: true, fx: this.centerX, fy: this.centerY }, // invisible node to push nodes away
      ...this.data
    ];

    this.simulation = d3.forceSimulation(this.nodes)
      .force("charge", d3.forceManyBody().strength(-0.001 * Math.min(this.width, this.height)))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force("collision", d3.forceCollide().radius(d => d["Weeks in Charts"]))
      .on("tick", () => this.ticked());
  }

  render() {
    const radiusScale = d3.scaleLinear()
      .domain([0, d3.max(this.data, d => +d["Weeks in Charts"])])
      .range([5,  Math.min(this.width, this.height) * 0.08]);

      let defs = this.svg.select("defs");
      if (defs.empty()) defs = this.svg.append("defs");

    const filter = defs.append("filter")
      .attr("id", "shadow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    filter.append("feDropShadow")
      .attr("dx", 2)
      .attr("dy", 2)
      .attr("stdDeviation", 2)
      .attr("flood-color", "rgba(0,0,0,0.4)");

    this.circles = this.svg.selectAll("circle")
      .data(this.nodes.filter(d => !d.isCenter), d => d.id)
      .join("circle")
      .attr("r", d => radiusScale(+d["Weeks in Charts"]))
      .attr("fill", d => {
        const patternId = `pattern-${d.Year}`;
        let defs = this.svg.select("defs");
        if (defs.empty()) defs = this.svg.append("defs");

        const pattern = defs.append("pattern")
          .attr("id", patternId)
          .attr("width", 1)
          .attr("height", 1)
          .attr("patternUnits", "objectBoundingBox");

        pattern.append("image")
          .attr("href", d["Image URL"])
          .attr("width", d["Weeks in Charts"] * 2)
          .attr("height", d["Weeks in Charts"] * 2)
          .attr("preserveAspectRatio", "xMidYMid slice");

        return `url(#${patternId})`;
      })
      .attr("opacity", 0.7)
      .attr("class", "bubble-viz-bubble")
      .attr("filter", "url(#shadow)")
      .on("mouseover", (event, d) => this.showTooltip(event, d))
      .on("mousemove", (event) => this.moveTooltip(event))
      .on("mouseleave", () => this.hideTooltip())
      .on("click", (event, d) => this.handleBubbleClick(event, d));

    this.labels = this.svg.selectAll("text")
      .data(this.nodes.filter(d => !d.isCenter), d => d.id)
      .join("text")
      .text("▶")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("class", "unselectable bubble-viz-player-label")
      .style("stroke", "white");

    this.startFloatingEffect();
  }

  ticked() {
    this.circles
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    this.labels
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  }

  updateData(newData) {
    this.simulation.stop();

    this.data = newData;
    this.nodes = [
      { id: "center", isCenter: true, fx: this.centerX, fy: this.centerY },
      ...this.data
    ];

    this.simulation = d3.forceSimulation(this.nodes)
      .force("charge", d3.forceManyBody().strength(-0.01 * Math.min(this.width, this.height)))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force("collision", d3.forceCollide().radius(d => d["Weeks in Charts"]))
      .on("tick", () => this.ticked());

    this.render();
  }

  attachResizeHandler() {
    window.addEventListener("resize", () => {
      this.simulation.stop();
      this.svg.selectAll("*").remove();
      this.init();
      this.render();
    });
  }

  showTooltip(event, d) {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);

    const chartedDate = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(d.Date));

    this.tooltip
      .style("opacity", 1)
      .html(`
        <strong style="font-size: 1.4em;">${d.Song} - ${d.Artist}</strong><br>
        Charted Date: ${chartedDate} <br>
        Weeks charted: ${parseInt(d["Weeks in Charts"])} <br>
      `);
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    const [x, y] = d3.pointer(event, document.body);
    this.tooltip
      .style("left", `${x + 40}px`)
      .style("top", `${y}px`);
  }

  hideTooltip() {
    this.hideTimeout = setTimeout(() => {
      this.tooltip.transition()
        .duration(100)
        .style("opacity", 0);
    }, 50);
  }

  async handleBubbleClick(event, d) {
    const songUrl = `${this.songsPath}${d.Year}.mp3`;

    if (this.activeBubble) {
      this.activeBubble.attr("stroke", null).attr("stroke-width", null).attr("opacity", 0.7);
    }

    this.activeBubble = d3.select(event.currentTarget)
      .attr("stroke", "#000")
      .attr("stroke-width", 2)
      .attr("opacity", 1);

    if (d.Year === this.currentSongId && !this.recordPlayer.isPaused()) {
      this.updateLabels(d.Year, false);
      this.recordPlayer.pause();
      return;
    }

    if (d.Year !== this.currentSongId) {
      await this.recordPlayer.load(songUrl, d["Image URL"]);
    }

    this.recordPlayer.play();
    this.currentSongId = d.Year;
    this.updateLabels(d.Year, true);
  }

  updateLabels(activeId, isPlaying) {
    this.labels.text(d => {
      if (activeId && d.Year === activeId) {
        return isPlaying ? "❚❚" : "▶";
      }
      return "▶";
    });
  }

  startFloatingEffect() {
    const amplitude = Math.min(this.width, this.height) * 0.002;
    const speed = 0.0015;

    this.nodes.forEach(d => d._floatPhase = Math.random() * Math.PI * 2);

    const animate = () => {
      const now = Date.now();

      this.circles
        .attr("cy", d => d.y + Math.sin(now * speed + d._floatPhase) * amplitude);

      this.labels
        .attr("y", d => d.y + Math.sin(now * speed + d._floatPhase) * amplitude);

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

}

document.addEventListener("DOMContentLoaded", () => {
  d3.csv("data/processed/top_hot_100_per_year.csv").then((data) => {
    const recordPlayer = new VinylRecord();

    new BubblePlayerViz({
      selector: "#bubble-viz",
      centerSelector: "#bubble-viz-container",
      data: data.filter(d => d.Year >= 1980).reverse(),
      recordPlayer: recordPlayer,
    });
  });
})
