class VisDNA {
    constructor(selector, config = {}) {
        this.selector = selector;
        this.width = config.width || 1000;
        this.height = config.height || 380;
        this.margin = { top: 30, right: 40, bottom: 110, left: 50 };

        this.scrollOffset = 0;
        this.autoSpinSpeed = 0; // auto-spin speed during animation
        this.targetAutoSpinSpeed = 0;
        this.autoSpinEasing = 0.05;

        this.torsion = 0;
        this.targetTorsion = 0; // for smooth torsion transitions
        this.torsionEasing = 0.05; // speed of torsion animation
        this.centerIndex = null; // index to center on (null = use right endpoint)
        
        // Color transition tracking
        this.isTransitioning = false; // whether we're in a transition animation
        this.transitionPhase = 0; // 0 = not started, 1 = twisting, 2 = untwisting
        this.previousPhases = []; // track phase of each bar to detect when perpendicular
        this.perpendicularCrossings = []; // count perpendicular crossings per bar
        this.colorSwitched = []; // track which bars have switched colors
        this.newFeature = null; // the feature we're transitioning to
        this.maxTorsionReached = 0; // track the maximum torsion during phase 1
        
        this.features = ["acousticness", "danceability", "energy", "liveness", "tempo", "valence"];

        // darker low-end colors for better contrast
        this.colorScales = {
            acousticness: d3.scaleSequential(d3.interpolateRgb("#d5e9ff", "#012b42")),
            danceability: d3.scaleSequential(d3.interpolateRgb("#ffc7de", "#230465")),
            energy:       d3.scaleSequential(d3.interpolateRgb("#fbc4af", "#651b00")),
            liveness:     d3.scaleSequential(d3.interpolateRgb("#b3ffc3", "#003e1f")),
            tempo:        d3.scaleSequential(d3.interpolateRgb("#ffabab", "#5e0000")), // blue(slow)->red(fast)
            valence:      d3.scaleSequential(d3.interpolateRgb("#083957", "#c8c209")),
        };


        this.feature = "acousticness"; // default feature
        this.yearData = [];
        this.numX = 0;

        this.featureDescriptions = {
            acousticness: "Higher values indicate a more acoustic (non-electronic) sound profile.",
            danceability: "Measures how suitable a track is for dancing — rhythm, tempo, and beat consistency.",
            energy: "Represents the intensity or activity of a track — higher values are louder and more dynamic.",
            liveness: "Estimates live performance presence — high values suggest audience sounds or live settings.",
            tempo: "The overall speed or pace of a track, measured in beats per minute (BPM).",
            valence: "Measures the musical positivity — higher values sound happier or more euphoric."
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
            .attr("fill", "white");

        this.container = this.svg.append("g");


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

        // --- Group by year, keeping all song data for histograms ---
        const grouped = d3.rollups(
            filtered,
            v => ({
                // Keep all individual values for histogram
                acousticness: v.map(d => d.acousticness).filter(val => val != null),
                danceability: v.map(d => d.danceability).filter(val => val != null),
                energy: v.map(d => d.energy).filter(val => val != null),
                liveness: v.map(d => d.liveness).filter(val => val != null),
                tempo: v.map(d => d.tempo).filter(val => val != null),
                valence: v.map(d => d.valence).filter(val => val != null),
                // Also compute means for color scales
                acousticness_mean: d3.mean(v, d => d.acousticness),
                danceability_mean: d3.mean(v, d => d.danceability),
                energy_mean: d3.mean(v, d => d.energy),
                liveness_mean: d3.mean(v, d => d.liveness),
                tempo_mean: d3.mean(v, d => d.tempo),
                valence_mean: d3.mean(v, d => d.valence)
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
        this.animate();
    }


    createDropdown() {
        const container = d3.select(this.selector);
        // insert a label before the SVG so it appears to the left of the dropdown
        const label = container.insert("label", "svg")
            .attr("for", "feature-select")
            .style("margin-bottom", "12px")
            .style("margin-right", "8px")
            .style("font-size", "14px")
            .style("color", "#333")
            .style("vertical-align", "middle")
            .text("Select a Feature:");
        const dropdown = container.insert("select", "svg")
            .attr("id", "feature-select")
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
                const newFeature = event.target.value;
                if (newFeature !== this.feature) {
                    // Start the full transition animation with the selected feature
                    this.startFullTransition(newFeature);
                }
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
        const vals = this.yearData.map(d => d[this.feature + '_mean']);
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



    generateData(centerX) {
        const center = this.x.invert(centerX);
        
        // Static state: when not transitioning and torsion is 0, use fixed positions
        const isStaticState = !this.isTransitioning && Math.abs(this.torsion) < 0.001;
        
        const data = d3.range(this.numX).map((i) => {
            const yearObj = this.yearData[i];
            
            let y1, z1, y2, z2;
            
            if (isStaticState) {
                // Static state: fixed vertical bars with medium-sized dots
                // Top dot at y=0.6, bottom dot at y=-0.6 (medium height)
                // z=0 (no depth, all in same plane)
                y1 = 0.6;
                z1 = 0;
                y2 = -0.6;
                z2 = 0;
            } else {
                // Dynamic state: normal helix calculation
                const t = (i - center) * this.torsion - this.scrollOffset;
                
                // Track perpendicular detection during transition (both phases)
                if (this.isTransitioning && !this.colorSwitched[i]) {
                    const prevT = this.previousPhases[i] !== undefined ? this.previousPhases[i] : t;
                    const currentCos = Math.cos(t);
                    const prevCos = Math.cos(prevT);
                    
                    // Detect perpendicular crossing: when cos changes sign (crosses zero)
                    const isPerpendicularCrossing = prevCos !== 0 && currentCos !== 0 && 
                                                   Math.sign(currentCos) !== Math.sign(prevCos);
                    
                    if (isPerpendicularCrossing) {
                        // Count crossings across BOTH phases
                        this.perpendicularCrossings[i] = (this.perpendicularCrossings[i] || 0) + 1;
                        
                        // Switch on the 3rd crossing (total across both phases)
                        if (this.perpendicularCrossings[i] === 3) {
                            this.colorSwitched[i] = true;
                        }
                    }
                }
                
                this.previousPhases[i] = t;
                
                y1 = Math.cos(t);
                z1 = Math.sin(t);
                y2 = Math.cos(t - Math.PI);
                z2 = Math.sin(t - Math.PI);
                
                // Smoothly interpolate z values to 0 as torsion approaches 0
                // This prevents visual jumps at the end of the transition
                if (this.isTransitioning && this.transitionPhase === 2) {
                    // Calculate how close we are to completion (0 = just started phase 2, 1 = complete)
                    const progress = 1 - (this.torsion / 0.2299);
                    // Apply stronger dampening as we get closer to the end
                    const dampening = Math.pow(progress, 2); // quadratic easing
                    z1 *= (1 - dampening);
                    z2 *= (1 - dampening);
                }
            }
            
            // Determine which feature to use for color
            let featureToUse = this.feature;
            if (this.isTransitioning && this.colorSwitched[i]) {
                featureToUse = this.newFeature;
            }
            
            const colorVal = this.colorScales[featureToUse](yearObj[featureToUse]);
            
            return [
                { x: i, y: y1, z: z1, color: colorVal, index: i },
                { x: i, y: y2, z: z2, color: colorVal, index: i }
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
            // Add histogram shading path
            g.append("path")
                .attr("class", "histogram-shade")
                .attr("fill", "currentColor")
                .attr("opacity", 0.3);
        });

        cont.merge(enter).each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const inverted = (d[0].y < d[1].y) ? 1 : -1;
            const color = d[0].color;
            const xPos = this.x(d[0].x);
            const yearIndex = d[0].index;

            // focus factor for this bar (0..1)
            const f = this.focus[i] || 0;

            // Determine which feature to use for dots
            let featureForDots = this.feature;
            if (this.isTransitioning && this.colorSwitched[yearIndex]) {
                featureForDots = this.newFeature;
            }
            
            // Map features to their dark colors for dots
            const darkColors = {
                acousticness: "#012b42",
                danceability: "#230465",
                energy: "#651b00",
                liveness: "#003e1f",
                tempo: "#5e0000",
                valence: "#083957"
            };
            const dotColor = darkColors[featureForDots];

            // Update circles (dots)
            g.selectAll("circle")
                .data(d)
                .attr("cx", d => this.x(d.x))
                .attr("cy", d => this.y(d.y))
                // do NOT change radius based on focus — keep color scales visible
                .attr("r", d => this.z(d.z))
                .attr("fill", dotColor)
                // show colors fully (no distance-based dimming)
                .attr("fill-opacity", 1);

            // Update connecting line (bar)
            const y1 = this.y(d[1].y) + inverted * this.z(d[1].z);
            const y2 = this.y(d[0].y) - inverted * this.z(d[0].z);
            
            // Determine which is actually top (smaller y value) and bottom (larger y value)
            const yTop = Math.min(y1, y2);
            const yBottom = Math.max(y1, y2);

            g.select("line")
                .attr("x1", xPos)
                .attr("x2", xPos)
                .attr("y1", y1)
                .attr("y2", y2)
                .attr("stroke", color)
                .attr("stroke-width", 3.5)
                .attr("opacity", 1);

            // Generate and update histogram shading
            const histogramPath = this.generateHistogramPath(yearIndex, xPos, yTop, yBottom);
            
            // Use the lighter color from the feature's color scale for violin
            let featureForViolin = this.feature;
            if (this.isTransitioning && this.colorSwitched[yearIndex]) {
                featureForViolin = this.newFeature;
            }
            
            // Map features to their light colors (first color in each gradient)
            const lightColors = {
                acousticness: "#d5e9ff",
                danceability: "#ffc7de",
                energy: "#fbc4af",
                liveness: "#b3ffc3",
                tempo: "#ffabab",
                valence: "#c8c209"
            };
            const violinColor = darkColors[featureForViolin];
            
            g.select(".histogram-shade")
                .attr("d", histogramPath)
                .attr("fill", violinColor)
                .attr("opacity", 0.6);
        });
    }

    generateHistogramPath(yearIndex, xPos, yTop, yBottom) {
        // Get feature data for this year
        const yearObj = this.yearData[yearIndex];
        let featureToUse = this.feature;
        if (this.isTransitioning && this.colorSwitched[yearIndex]) {
            featureToUse = this.newFeature;
        }
        
        const values = yearObj[featureToUse];
        if (!values || values.length === 0) {
            // Return empty path if no data
            return "";
        }

        // Create histogram bins
        const numBins = 20;
        const [minVal, maxVal] = d3.extent(values);
        const binWidth = (maxVal - minVal) / numBins;
        
        // Count values in each bin
        const bins = new Array(numBins).fill(0);
        values.forEach(val => {
            const binIndex = Math.min(Math.floor((val - minVal) / binWidth), numBins - 1);
            bins[binIndex]++;
        });
        
        // Apply Gaussian smoothing to bins for violin-like appearance
        const smoothBins = this.smoothBins(bins, 2);
        
        // Normalize to max width
        const maxCount = d3.max(smoothBins);
        const maxWidth = 15; // maximum width in pixels
        
        // Generate smooth path points
        // Note: yTop has smaller pixel value (higher on screen), yBottom has larger pixel value (lower on screen)
        const height = yBottom - yTop; // positive value
        const binHeight = height / numBins;
        
        // Create smooth points for right side
        const rightPoints = [];
        for (let i = 0; i < numBins; i++) {
            const y = yTop + (i + 0.5) * binHeight; // center of bin
            const width = (smoothBins[i] / maxCount) * maxWidth;
            rightPoints.push([xPos + width, y]);
        }
        
        // Create smooth points for left side (mirror)
        const leftPoints = [];
        for (let i = numBins - 1; i >= 0; i--) {
            const y = yTop + (i + 0.5) * binHeight; // center of bin
            const width = (smoothBins[i] / maxCount) * maxWidth;
            leftPoints.push([xPos - width, y]);
        }
        
        // Build smooth path using curves
        let path = `M${xPos},${yTop}`; // start at top center
        
        // Right side with smooth curves
        for (let i = 0; i < rightPoints.length; i++) {
            if (i === 0) {
                path += ` L${rightPoints[i][0]},${rightPoints[i][1]}`;
            } else {
                // Use quadratic curves for smoothness
                const prevPoint = rightPoints[i - 1];
                const currPoint = rightPoints[i];
                const controlY = (prevPoint[1] + currPoint[1]) / 2;
                path += ` Q${prevPoint[0]},${controlY} ${currPoint[0]},${currPoint[1]}`;
            }
        }
        
        path += ` L${xPos},${yBottom}`; // to bottom center
        
        // Left side with smooth curves
        for (let i = 0; i < leftPoints.length; i++) {
            if (i === 0) {
                path += ` L${leftPoints[i][0]},${leftPoints[i][1]}`;
            } else {
                // Use quadratic curves for smoothness
                const prevPoint = leftPoints[i - 1];
                const currPoint = leftPoints[i];
                const controlY = (prevPoint[1] + currPoint[1]) / 2;
                path += ` Q${prevPoint[0]},${controlY} ${currPoint[0]},${currPoint[1]}`;
            }
        }
        
        path += " Z"; // close path
        return path;
    }

    smoothBins(bins, radius) {
        // Apply Gaussian smoothing to histogram bins
        const smoothed = new Array(bins.length).fill(0);
        for (let i = 0; i < bins.length; i++) {
            let sum = 0;
            let weightSum = 0;
            for (let j = Math.max(0, i - radius); j <= Math.min(bins.length - 1, i + radius); j++) {
                const distance = Math.abs(i - j);
                const weight = Math.exp(-distance * distance / (2 * radius * radius));
                sum += bins[j] * weight;
                weightSum += weight;
            }
            smoothed[i] = sum / weightSum;
        }
        return smoothed;
    }


    animate() {
        if (this.yearData.length === 0) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Smoothly interpolate torsion towards target
        this.torsion += (this.targetTorsion - this.torsion) * this.torsionEasing;
        
        // Check if transition phase should advance
        if (this.isTransitioning) {
            const epsilon = 0.001; // tolerance for "reached target"
            if (this.transitionPhase === 1 && Math.abs(this.torsion - this.targetTorsion) < epsilon) {
                // Phase 1 complete (twisted to 0.5), start phase 2 (untwist to 0)
                console.log("Phase 1 complete, starting untwist");
                this.transitionPhase = 2;
                this.centerIndex = 0; // switch to left endpoint
                this.targetTorsion = 0;
            } else if (this.transitionPhase === 2 && Math.abs(this.torsion - this.targetTorsion) < epsilon) {
                // Phase 2 complete (untwisted to 0)
                console.log("Transition complete!");
                
                this.isTransitioning = false;
                this.transitionPhase = 0;
                this.feature = this.newFeature; // commit the feature change
                
                // Stop spinning and reset animation state
                this.targetAutoSpinSpeed = 0;
                this.autoSpinSpeed = 0;
                this.torsion = 0; // force torsion to exactly 0
                this.targetTorsion = 0;
                // Don't reset scrollOffset or centerIndex to avoid snapping
                // When torsion is 0, all bars are at the same phase regardless of center
                
                // Smooth transition to static state with D3 animation
                this.transitionToStaticState();
            }
        }
        
        // Smoothly interpolate auto-spin speed
        this.autoSpinSpeed += (this.targetAutoSpinSpeed - this.autoSpinSpeed) * this.autoSpinEasing;
        
        // Apply auto-spin to scrollOffset (only if torsion is non-zero or transitioning)
        if (this.isTransitioning || Math.abs(this.torsion) > 0.001) {
            this.scrollOffset += this.autoSpinSpeed;
        }

        // Set phase center based on centerIndex
        if (this.centerIndex !== null) {
            this.phaseCenter = this.x(this.centerIndex);
        } else {
            this.phaseCenter = this.x(this.numX - 1); // default to rightmost endpoint
        }

        const data = this.generateData(this.phaseCenter);
        this.draw(data);
        requestAnimationFrame(() => this.animate());
    }

    testAnimationStep2() {
        // Step 2: Increase torsion to 0.3448 and start spinning
        // Center on right endpoint (index 41, year 2021) which is naturally vertical at this torsion
        this.centerIndex = this.numX - 1; // right endpoint
        this.targetTorsion = 0.3831;
        // this.targetAutoSpinSpeed = 0.00; // adjust for desired spin speed
        console.log("Animation Step 2: Twisting to 0.3831, centered on right (naturally vertical)");
    }

    testAnimationUnwind() {
        // Unwind: Decrease torsion back to 0
        // Center on left endpoint (index 0, year 1980) which is naturally vertical
        this.centerIndex = 0; // left endpoint
        this.targetTorsion = 0;
        // this.targetAutoSpinSpeed = 0.00; // keep spinning during unwind
        console.log("Animation Unwind: Unwinding to 0, centered on left (naturally vertical)");
    }

    // Helper method to find vertical bar positions for a given torsion
    getVerticalIndices(torsion, centerIndex) {
        // When centered at centerIndex, bars are vertical when:
        // t = (i - centerIndex) * torsion = n * π
        // So: i = centerIndex + (n * π / torsion)
        const verticalIndices = [];
        for (let n = -10; n <= 10; n++) {
            const i = centerIndex + (n * Math.PI / torsion);
            if (i >= 0 && i < this.numX) {
                verticalIndices.push({
                    index: i,
                    roundedIndex: Math.round(i),
                    year: this.yearData[Math.round(i)]?.year,
                    rotation: n
                });
            }
        }
        return verticalIndices;
    }

    startFullTransition(targetFeature = null) {
        // Start a full transition with color change
        // If no target feature is provided, cycle to next feature
        if (targetFeature) {
            this.newFeature = targetFeature;
        } else {
            const currentIndex = this.features.indexOf(this.feature);
            const nextIndex = (currentIndex + 1) % this.features.length;
            this.newFeature = this.features[nextIndex];
        }
        
        console.log(`Starting full transition from ${this.feature} to ${this.newFeature}`);
        
        // Initialize transition state
        this.isTransitioning = true;
        this.transitionPhase = 1;
        this.colorSwitched = new Array(this.numX).fill(false);
        this.previousPhases = new Array(this.numX).fill(undefined);
        this.perpendicularCrossings = new Array(this.numX).fill(0);
        this.maxTorsionReached = 0;
        
        // Make sure new feature color scale is set up
        const vals = this.yearData.map(d => d[this.newFeature + '_mean']);
        const [min, max] = d3.extent(vals);
        this.colorScales[this.newFeature].domain([min, max]);
        
        // Phase 1: Twist to 0.2299, centered on right (leftmost bar stays upright)
        this.centerIndex = this.numX - 1; // right endpoint
        this.targetTorsion = 0.2299;
        // this.targetAutoSpinSpeed = 0.02; // spin during transition
    }

    transitionToStaticState() {
        // Smoothly animate all circles to the static state positions
        const staticY1 = this.y(0.6);
        const staticY2 = this.y(-0.6);
        const staticR = this.z(0); // radius for z=0 (medium size)
        
        this.container.selectAll("g.helix-group").each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const xPos = this.x(d[0].x);
            
            // Animate circles to static positions
            g.selectAll("circle")
                .transition()
                .duration(500)
                .ease(d3.easeQuadOut)
                .attr("cy", (d, j) => j === 0 ? staticY1 : staticY2)
                .attr("r", staticR);
            
            // Animate line to static positions
            g.select("line")
                .transition()
                .duration(500)
                .ease(d3.easeQuadOut)
                .attr("y1", staticY1)
                .attr("y2", staticY2);
        });
    }

    onBarClick(year) {
        const dnaContainer = d3.select("#vis-dna");
        const yearlyContainer = d3.select("#vis-dna-yearly");

        // Hide DNA visualization smoothly
        dnaContainer.transition()
            .duration(500)
            .style("opacity", 0)
            .on("end", () => {
                dnaContainer.style("display", "none");
                yearlyContainer.style("display", "block")
                    .style("opacity", 0);

                // Clear previous yearly vis
                yearlyContainer.selectAll("*").remove();

                // Instantiate yearly visualization
                const yearlyVis = new VisDNAYearly("#vis-dna-yearly", {
                    width: 1100,
                    height: 520,
                    year: year,
                    feature: this.feature
                });

                yearlyContainer.transition()
                    .duration(600)
                    .style("opacity", 1);
            });
    }

}
