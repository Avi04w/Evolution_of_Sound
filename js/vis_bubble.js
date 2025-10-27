class BubblePlayerViz {
  constructor({ selector, data, centerSelector, songsPath = "./songs/" }) {
    this.svg = d3.select(selector);
    this.centerEl = document.querySelector(centerSelector);
    this.data = data;
    this.songsPath = songsPath;
    this.currentAudio = null;
    this.activeBubble = null;
    this.currentSongId = null;

    this.init();
    this.render();
    this.attachResizeHandler();
  }

  init() {
    const size = Math.min(window.innerWidth, window.innerHeight) * 1.7;
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
      .force("charge", d3.forceManyBody().strength(-20))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force("collision", d3.forceCollide().radius(d => d["Weeks in Charts"]))
      .on("tick", () => this.ticked());
  }

  render() {
    this.circles = this.svg.selectAll("circle")
      .data(this.nodes.filter(d => !d.isCenter), d => d.id)
      .join("circle")
      .attr("r", d => d["Weeks in Charts"])
      .attr("fill", (_d, i) => d3.schemeCategory10[i % 10])
      .attr("opacity", 0.8)
      .attr("class", "bubble-viz-bubble")
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
      .attr("class", "unselectable bubble-viz-bubble");
    // TODO this stops propagation, so will affect the circle
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
      .force("charge", d3.forceManyBody().strength(-10))
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
        <strong style="font-size: 1.5em;">${d.Song} - ${d.Artist}</strong><br>
        Charted Date: ${chartedDate} <br>
        Weeks charted: ${parseInt(d["Weeks in Charts"])} <br>
        Peak Position: ${d["Peak Position"]} <br>
      `);
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    const [x, y] = d3.pointer(event);
    this.tooltip
      .style("left", `${x + 100}px`)
      .style("top", `${y + 400}px`);
  }

  hideTooltip() {
    this.hideTimeout = setTimeout(() => {
      this.tooltip.transition()
        .duration(100)
        .style("opacity", 0);
    }, 50);
  }

  handleBubbleClick(event, d) {
    const songUrl = `${this.songsPath}${d.Year}.mp3`;

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.updateLabels(d.Year, false);

      if (d.Year === this.currentSongId) return;
    }

    if (this.activeBubble) {
      this.activeBubble.attr("stroke", null).attr("stroke-width", null);
    }

    const audio = new Audio(songUrl);
    audio.play().catch(err => console.error("Audio error:", err));

    this.currentAudio = audio;
    this.currentSongId = d.Year

    this.activeBubble = d3.select(event.currentTarget)
      .attr("stroke", "#fff")
      .attr("stroke-width", 3);

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
}

document.addEventListener("DOMContentLoaded", () => {
  d3.csv("data/processed/top_hot_100_per_year.csv").then((data) => {
    new BubblePlayerViz({
      selector: "#bubble-viz",
      centerSelector: "#bubble-viz-container",
      data: data.toSorted((a, b) => b["Weeks in Charts"] - a["Weeks in Charts"])
    });
  })
})
