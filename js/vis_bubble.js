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
    // Use full viewport size
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.tooltip = d3.select("#bubble-tooltip");
    this.hideTimeout = null;

    this.svg.attr("viewBox", [0, 0, this.width, this.height]);

    const rect = this.centerEl.getBoundingClientRect();
    this.centerX = this.width / 2;
    this.centerY = window.scrollY + rect.top + rect.height / 2;

    // Initialize nodes in a wide circle around the center with more spread
    const numNodes = this.data.length;
    const initialRadius = Math.min(this.width, this.height) * 0.45; // Larger starting circle
    this.nodes = [
      { id: "center", isCenter: true, fx: this.centerX, fy: this.centerY }, // invisible node
      ...this.data.map((d, i) => {
        const angle = (i / numNodes) * 2 * Math.PI;
        // Add more randomness for better spread
        const radiusVariation = initialRadius * (0.8 + Math.random() * 0.4); // Vary radius between 0.8x and 1.2x
        return {
          ...d,
          x: this.centerX + radiusVariation * Math.cos(angle) + (Math.random() - 0.5) * 100,
          y: this.centerY + radiusVariation * Math.sin(angle) + (Math.random() - 0.5) * 100
        };
      })
    ];

    // Get max radius for boundary calculations
    const radiusScale = d3.scaleLinear()
      .domain([0, d3.max(this.data, d => +d["Weeks in Charts"])])
      .range([15, Math.min(this.width, this.height) * 0.15]);
    const maxRadius = radiusScale(d3.max(this.data, d => +d["Weeks in Charts"]));

    // Store radiusScale for later use
    this.radiusScale = radiusScale;

    // Initialize with default dimensions (will be updated after text is rendered)
    this.centerExclusionWidth = this.width * 0.25;
    this.centerExclusionHeight = this.height * 0.2;
    this.centerExclusionPadding = 50; // Extra padding around text

    // Pre-calculate values that don't change during simulation
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const padding = 5;
    const widthMinusPadding = this.width - padding;
    const heightMinusPadding = this.height - padding;

    // Cache node radii to avoid repeated lookups
    this.nodes.forEach(node => {
      if (!node.isCenter) {
        node._radius = this.radiusScale(+node["Weeks in Charts"]);
      }
    });

    this.simulation = d3.forceSimulation(this.nodes)
      .velocityDecay(0.3) // Increased friction to reduce jitter
      .alphaDecay(0.03) // Faster settling for better performance
      .force("charge", d3.forceManyBody().strength(-80)) // Stronger repulsion for more spread
      .force("collision", d3.forceCollide().radius(d => d._radius + 8).strength(0.8)) // Use cached radius
      .force("x", d3.forceX(centerX).strength(0.02)) // Weaker centering
      .force("y", d3.forceY(centerY).strength(0.02)) // Weaker centering
      .force("centerRepel", alpha => {
        // Pre-calculate bounds (only once per tick, not per node)
        const halfWidth = this.centerExclusionWidth / 2 + this.centerExclusionPadding;
        const halfHeight = this.centerExclusionHeight / 2 + this.centerExclusionPadding;
        const strength = alpha * 3;

        for (let i = 0; i < this.nodes.length; i++) {
          const node = this.nodes[i];
          if (node.isCenter) continue;

          const dx = node.x - centerX;
          const dy = node.y - centerY;
          const absDx = dx < 0 ? -dx : dx; // Faster than Math.abs
          const absDy = dy < 0 ? -dy : dy;

          // Check if inside or near the rectangular exclusion zone
          const overlapX = halfWidth - absDx;
          const overlapY = halfHeight - absDy;

          if (overlapX > 0 && overlapY > 0) {
            // Push away from rectangle - choose direction with least overlap
            if (overlapX < overlapY) {
              node.vx += (dx > 0 ? 1 : -1) * overlapX * strength;
            } else {
              node.vy += (dy > 0 ? 1 : -1) * overlapY * strength;
            }
          }
        }
      })
      .force("bounds", () => {
        const halfWidth = this.centerExclusionWidth / 2;
        const halfHeight = this.centerExclusionHeight / 2;

        for (let i = 0; i < this.nodes.length; i++) {
          const node = this.nodes[i];
          if (node.isCenter) continue;

          const radius = node._radius;
          const radiusPlusPadding = radius + padding;

          // Screen bounds - optimized min/max
          if (node.x < radiusPlusPadding) node.x = radiusPlusPadding;
          else if (node.x > widthMinusPadding - radius) node.x = widthMinusPadding - radius;

          if (node.y < radiusPlusPadding) node.y = radiusPlusPadding;
          else if (node.y > heightMinusPadding - radius) node.y = heightMinusPadding - radius;

          // Hard rectangular boundary for center text
          const dx = node.x - centerX;
          const dy = node.y - centerY;
          const absDx = dx < 0 ? -dx : dx;
          const absDy = dy < 0 ? -dy : dy;

          // Check if bubble overlaps with center rectangle
          if (absDx < halfWidth + radius && absDy < halfHeight + radius) {
            // Calculate how much to push in each direction
            const pushX = halfWidth + radius - absDx;
            const pushY = halfHeight + radius - absDy;

            // Push in direction with least resistance
            if (pushX < pushY) {
              node.x = centerX + (dx > 0 ? 1 : -1) * (halfWidth + radius);
            } else {
              node.y = centerY + (dy > 0 ? 1 : -1) * (halfHeight + radius);
            }
          }
        }
      })
      .on("tick", () => this.ticked());
  }

  render() {
    const radiusScale = d3.scaleLinear()
      .domain([0, d3.max(this.data, d => +d["Weeks in Charts"])])
      .range([15,  Math.min(this.width, this.height) * 0.15]);

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

    // Add center text
    const centerTextGroup = this.svg.append("g")
      .attr("class", "center-text-group")
      .attr("transform", `translate(${this.width / 2}, ${this.height / 2})`);

    const titleText = centerTextGroup.append("text")
      .attr("class", "center-title")
      .attr("text-anchor", "middle")
      .attr("y", -20)
      .style("font-size", "48px")
      .style("font-weight", "bold")
      .style("fill", "#333")
      .style("pointer-events", "none")
      .text("The Evolution of Sound");

    const subtitleText = centerTextGroup.append("text")
      .attr("class", "center-subtitle")
      .attr("text-anchor", "middle")
      .attr("y", 20)
      .style("font-size", "24px")
      .style("fill", "#666")
      .style("pointer-events", "none")
      .text("Visualizing 40 Years of Pop Culture Through Data");

    // Calculate bounding box dynamically based on text dimensions
    // Add padding around text
    const padding = 40;
    const titleBBox = titleText.node().getBBox();
    const subtitleBBox = subtitleText.node().getBBox();

    // Store dimensions for use in simulation
    this.centerExclusionWidth = Math.max(titleBBox.width, subtitleBBox.width) + padding * 2;
    this.centerExclusionHeight = titleBBox.height + subtitleBBox.height + padding * 2;

    // Create image patterns
    const patterns = defs.selectAll("pattern")
      .data(this.nodes.filter(d => !d.isCenter), d => d.id)
      .join("pattern")
      .attr("id", (d, i) => `pattern-bubble-${i}`)
      .attr("width", 1)
      .attr("height", 1)
      .attr("patternContentUnits", "objectBoundingBox");

    patterns.append("image")
      .attr("href", d => d["Image URL"])
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 1)
      .attr("height", 1)
      .attr("preserveAspectRatio", "xMidYMid slice");

    this.circles = this.svg.selectAll("circle")
      .data(this.nodes.filter(d => !d.isCenter), d => d.id)
      .join("circle")
      .attr("r", d => radiusScale(+d["Weeks in Charts"]))
      .attr("fill", (d, i) => `url(#pattern-bubble-${i})`)
      .attr("opacity", 0.7)
      .attr("class", "bubble-viz-bubble")
      .attr("filter", "url(#shadow)")
      .on("mouseover", (event, d) => this.showTooltip(event, d))
      .on("mousemove", (event) => this.moveTooltip(event))
      .on("mouseleave", () => this.hideTooltip())
      .on("click", (event, d) => this.handleBubbleClick(event, d));

    this.labels = this.svg.selectAll(".bubble-viz-player-label")
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
    if (!this.circles || !this.labels) return; // Don't update if elements aren't rendered yet

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

    // Get max radius for boundary calculations
    this.radiusScale = d3.scaleLinear()
      .domain([0, d3.max(this.data, d => +d["Weeks in Charts"])])
      .range([15, Math.min(this.width, this.height) * 0.15]);

    // Pre-calculate values that don't change during simulation
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const padding = 5;
    const widthMinusPadding = this.width - padding;
    const heightMinusPadding = this.height - padding;

    // Cache node radii
    this.nodes.forEach(node => {
      if (!node.isCenter) {
        node._radius = this.radiusScale(+node["Weeks in Charts"]);
      }
    });

    this.simulation = d3.forceSimulation(this.nodes)
      .velocityDecay(0.3) // Increased friction to reduce jitter
      .alphaDecay(0.03) // Faster settling for better performance
      .force("charge", d3.forceManyBody().strength(-80)) // Stronger repulsion for more spread
      .force("collision", d3.forceCollide().radius(d => d._radius + 8).strength(0.8)) // Use cached radius
      .force("x", d3.forceX(centerX).strength(0.02)) // Weaker centering
      .force("y", d3.forceY(centerY).strength(0.02)) // Weaker centering
      .force("centerRepel", alpha => {
        const halfWidth = this.centerExclusionWidth / 2 + this.centerExclusionPadding;
        const halfHeight = this.centerExclusionHeight / 2 + this.centerExclusionPadding;
        const strength = alpha * 3;

        for (let i = 0; i < this.nodes.length; i++) {
          const node = this.nodes[i];
          if (node.isCenter) continue;

          const dx = node.x - centerX;
          const dy = node.y - centerY;
          const absDx = dx < 0 ? -dx : dx;
          const absDy = dy < 0 ? -dy : dy;

          const overlapX = halfWidth - absDx;
          const overlapY = halfHeight - absDy;

          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              node.vx += (dx > 0 ? 1 : -1) * overlapX * strength;
            } else {
              node.vy += (dy > 0 ? 1 : -1) * overlapY * strength;
            }
          }
        }
      })
      .force("bounds", () => {
        const halfWidth = this.centerExclusionWidth / 2;
        const halfHeight = this.centerExclusionHeight / 2;

        for (let i = 0; i < this.nodes.length; i++) {
          const node = this.nodes[i];
          if (node.isCenter) continue;

          const radius = node._radius;
          const radiusPlusPadding = radius + padding;

          // Screen bounds - optimized
          if (node.x < radiusPlusPadding) node.x = radiusPlusPadding;
          else if (node.x > widthMinusPadding - radius) node.x = widthMinusPadding - radius;

          if (node.y < radiusPlusPadding) node.y = radiusPlusPadding;
          else if (node.y > heightMinusPadding - radius) node.y = heightMinusPadding - radius;

          // Hard rectangular boundary for center text
          const dx = node.x - centerX;
          const dy = node.y - centerY;
          const absDx = dx < 0 ? -dx : dx;
          const absDy = dy < 0 ? -dy : dy;

          if (absDx < halfWidth + radius && absDy < halfHeight + radius) {
            const pushX = halfWidth + radius - absDx;
            const pushY = halfHeight + radius - absDy;

            if (pushX < pushY) {
              node.x = centerX + (dx > 0 ? 1 : -1) * (halfWidth + radius);
            } else {
              node.y = centerY + (dy > 0 ? 1 : -1) * (halfHeight + radius);
            }
          }
        }
      })
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
    if (this.activeBubble) {
      this.activeBubble.attr("stroke", null).attr("stroke-width", null).attr("opacity", 0.7);
    }

    this.activeBubble = d3.select(event.currentTarget)
      .attr("stroke", "#000")
      .attr("stroke-width", 2)
      .attr("opacity", 1);

    if (d.Year === this.currentSongId && !this.recordPlayer.isPaused()) {
      this.updateLabels(d.Year, false);
      return;
    }

    showSpotifyPlayer(d.id);
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
    // Disable floating effect for performance
    // The subtle floating animation was causing continuous repaints
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
