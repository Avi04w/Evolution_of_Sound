console.log('Three.js script loaded');

/**
 * MusicUniverseVisualization - 3D visualization of music features using Three.js
 * Displays songs as points in a PCA-reduced 3D space with interactive color encoding
 */
class MusicUniverseVisualization {
    // Static constants
    static VIRIDIS_COLORS = [
        [0.267004, 0.004874, 0.329415],
        [0.282623, 0.140926, 0.457517],
        [0.253935, 0.265254, 0.529983],
        [0.206756, 0.371758, 0.553117],
        [0.163625, 0.471133, 0.558148],
        [0.127568, 0.566949, 0.550556],
        [0.134692, 0.658636, 0.517649],
        [0.266941, 0.748751, 0.440573],
        [0.477504, 0.821444, 0.318195],
        [0.741388, 0.873449, 0.149561],
        [0.993248, 0.906157, 0.143936]
    ];

    static AUDIO_FEATURES = [
        'danceability', 'energy', 'key', 'loudness', 'mode', 
        'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence'
    ];

    constructor(containerId, dataUrl, options = {}) {
        this.containerId = containerId;
        this.dataUrl = dataUrl;
        this.options = {
            showBorder: true,
            requireModifierForZoom: false,
            ...options
        };
        
        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.geometry = null;
        
        // Data and state
        this.parsedData = [];
        this.currentColorFeature = 'none';
        this.animationFrameId = null;
        this.allGenres = [];
        this.selectedGenre = null;
        
        // Interaction
        this.raycaster = null;
        this.mouse = null;
        this.hoveredPoint = null;
        this.tooltip = null;
        
        // Dimensions (will be set dynamically)
        this.width = 0;
        this.height = 0;
    }

    /**
     * Initialize and load the visualization
     */
    async init() {
        try {
            await this.loadData();
            this.initScene();
            this.setupEventListeners();
            console.log('Three.js visualization ready');
        } catch (error) {
            console.error('Error initializing visualization:', error);
        }
    }

    /**
     * Load and parse NDJSON data
     */
    async loadData() {
        const response = await fetch(this.dataUrl);
        const text = await response.text();
        
        this.parsedData = text.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => JSON.parse(line));

        console.log(`Loaded ${this.parsedData.length} data points`);
        
        if (this.parsedData.length > 0) {
            console.log('Sample data point:', this.parsedData[0]);
        }
        
        // Extract all unique genres
        this.extractGenres();
    }
    
    /**
     * Extract all unique genres from the dataset with counts
     */
    extractGenres() {
        const genreCounts = {};
        this.parsedData.forEach(track => {
            if (track.genres) {
                const genres = Array.isArray(track.genres) ? track.genres : [track.genres];
                genres.forEach(genre => {
                    if (genre && genre.trim()) {
                        const g = genre.trim();
                        genreCounts[g] = (genreCounts[g] || 0) + 1;
                    }
                });
            }
        });
        
        // Store genres with counts, sorted by count descending
        this.allGenres = Object.entries(genreCounts)
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count);
        
        console.log(`Found ${this.allGenres.length} unique genres`);
    }

    /**
     * Initialize Three.js scene
     */
    initScene() {
        const container = document.getElementById(this.containerId);
        // Don't override container position - let CSS handle it
        
        // Calculate dimensions based on container
        this.updateDimensions();
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = this.options.showBorder ? new THREE.Color(0xffffff) : null;
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.set(7, 4, 7);
        
                // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        
        // Apply optional border
        if (this.options.showBorder) {
            this.renderer.domElement.style.border = '2px solid #2196F3';
            this.renderer.domElement.style.borderRadius = '4px';
        }
        
        container.appendChild(this.renderer.domElement);
        
        // Initialize raycaster
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.3;
        this.mouse = new THREE.Vector2();
        
        // Create tooltip
        this.createTooltip();
        
        // Add mouse interaction
        this.setupMouseInteraction();
        
                // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Shift the center point left to account for legend on the right
        this.controls.target.set(0, 0, 0);
        
        // Add helpers
        const axesHelper = new THREE.AxesHelper(10);
        this.scene.add(axesHelper);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        // Create point cloud
        this.createPointCloud();
        
        // Set initial colors
        this.updateColors(this.currentColorFeature, false);
        
        // Start animation loop
        this.animate();
        
        console.log('Three.js scene initialized with', this.parsedData.length, 'points');
    }

    /**
     * Create point cloud geometry
     */
    createPointCloud() {
        this.geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(this.parsedData.length * 3);
        const colors = new Float32Array(this.parsedData.length * 3);
        const alphas = new Float32Array(this.parsedData.length);
        
        this.parsedData.forEach((d, i) => {
            positions[i * 3] = d.pc0 || 0;
            positions[i * 3 + 1] = d.pc1 || 0;
            positions[i * 3 + 2] = d.pc2 || 0;
            alphas[i] = 1.0; // Full opacity by default
        });
        
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        // Custom shader material for per-vertex alpha
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointTexture: { value: this.createCircleTexture() },
                size: { value: 0.3 }
            },
            vertexShader: `
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float size;
                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vec4 texColor = texture2D(pointTexture, gl_PointCoord);
                    float finalAlpha = texColor.a * vAlpha;
                    
                    // For dimmed points, use much lower alpha and scale color down
                    if (vAlpha < 0.5) {
                        finalAlpha = finalAlpha * 0.15; // Very low alpha
                    }
                    
                    gl_FragColor = vec4(vColor, finalAlpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            depthTest: true
        });
        
        this.points = new THREE.Points(this.geometry, material);
        this.scene.add(this.points);
    }

    /**
     * Create high-quality circular texture for point markers
     * Uses higher resolution and anti-aliasing for better zoom quality
     */
    createCircleTexture() {
        const size = 256; // Higher resolution
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2;
        
        // Clear canvas
        ctx.clearRect(0, 0, size, size);
        
        // Draw solid circle with anti-aliasing
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        
        // Add soft edge for anti-aliasing
        const gradient = ctx.createRadialGradient(centerX, centerY, radius - 10, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Create tooltip element
     */
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'three-tooltip';
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.padding = '10px';
        this.tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        this.tooltip.style.color = 'white';
        this.tooltip.style.borderRadius = '5px';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.tooltip.style.fontSize = '12px';
        this.tooltip.style.zIndex = '1000';
        this.tooltip.style.minWidth = '220px';
        this.tooltip.style.maxWidth = '280px';
        document.getElementById(this.containerId).appendChild(this.tooltip);
    }

    /**
     * Setup mouse interaction for hover tooltips
     */
    setupMouseInteraction() {
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.points);
            
            // Find first intersected point that matches genre filter
            let validIntersect = null;
            for (let i = 0; i < intersects.length; i++) {
                const index = intersects[i].index;
                if (this.trackMatchesGenre(this.parsedData[index])) {
                    validIntersect = index;
                    break;
                }
            }
            
            if (validIntersect !== null) {
                this.hoveredPoint = validIntersect;
                this.showTooltip(validIntersect, event, rect);
            } else {
                this.hoveredPoint = null;
                this.tooltip.style.display = 'none';
            }
        });
        
        this.renderer.domElement.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
            this.hoveredPoint = null;
        });
    }

    /**
     * Show tooltip with song information and feature bars
     */
    showTooltip(index, event, rect) {
        const data = this.parsedData[index];
        const artistName = Array.isArray(data.artists) 
            ? data.artists.join(', ') 
            : data.artists || 'Unknown';
        
        // Features to display with their values
        const features = [
            { name: 'Energy', value: data.energy || 0, max: 1 },
            { name: 'Danceability', value: data.danceability || 0, max: 1 },
            { name: 'Valence', value: data.valence || 0, max: 1 },
            { name: 'Acousticness', value: data.acousticness || 0, max: 1 },
            { name: 'Instrumentalness', value: data.instrumentalness || 0, max: 1 },
            { name: 'Speechiness', value: data.speechiness || 0, max: 1 },
            { name: 'Liveness', value: data.liveness || 0, max: 1 },
            { name: 'Loudness', value: data.loudness || 0, max: 0, isSpecial: true },
        ];
        
        // Normalize loudness (typically -60 to 0 dB)
        const loudnessNormalized = Math.max(0, Math.min(1, (data.loudness + 60) / 60));
        features.find(f => f.name === 'Loudness').value = loudnessNormalized;
        features.find(f => f.name === 'Loudness').displayValue = (data.loudness || 0).toFixed(1) + ' dB';
        
        let barsHtml = '';
        features.forEach(feature => {
            const percentage = feature.max === 1 ? (feature.value * 100) : (feature.value * 100);
            const displayValue = feature.displayValue || feature.value.toFixed(2);
            
            barsHtml += `
                <div style="margin: 6px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span style="font-size: 11px;">${feature.name}</span>
                        <span style="font-size: 11px; color: #aaa;">${displayValue}</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.2); border-radius: 3px; height: 6px; width: 100%;">
                        <div style="background: linear-gradient(90deg, #4CAF50, #8BC34A); border-radius: 3px; height: 100%; width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        });
        
        this.tooltip.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong style="font-size: 13px;">${data.name || 'Unknown'}</strong><br>
                <em style="font-size: 11px; color: #ccc;">${artistName}</em>
            </div>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid rgba(255,255,255,0.3);">
            ${barsHtml}
        `;
        this.tooltip.style.display = 'block';
        
        // Calculate tooltip position relative to canvas
        let tooltipX = event.clientX - rect.left + 15;
        let tooltipY = event.clientY - rect.top + 15;
        
        // Get tooltip dimensions after rendering
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        // Check right boundary (canvas width)
        if (tooltipX + tooltipRect.width > rect.width) {
            // Flip to left of cursor
            tooltipX = event.clientX - rect.left - tooltipRect.width - 15;
        }
        
        // Check bottom boundary (canvas height)
        if (tooltipY + tooltipRect.height > rect.height) {
            // Flip to above cursor
            tooltipY = event.clientY - rect.top - tooltipRect.height - 15;
        }
        
        // Ensure minimum distance from left edge
        tooltipX = Math.max(10, tooltipX);
        
        // Ensure minimum distance from top edge
        tooltipY = Math.max(10, tooltipY);
        
        // Ensure doesn't exceed right boundary
        tooltipX = Math.min(tooltipX, rect.width - tooltipRect.width - 10);
        
        // Ensure doesn't exceed bottom boundary
        tooltipY = Math.min(tooltipY, rect.height - tooltipRect.height - 10);
        
        this.tooltip.style.left = tooltipX + 'px';
        this.tooltip.style.top = tooltipY + 'px';
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Animate color and alpha transition
     */
    animateColorTransition(fromColors, toColors, fromAlphas, toAlphas, duration = 500) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const startTime = performance.now();
        const colorAttribute = this.geometry.getAttribute('color');
        const alphaAttribute = this.geometry.getAttribute('alpha');
        
        const updateFrame = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Cubic easing
            const easedProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Interpolate colors
            for (let i = 0; i < this.parsedData.length; i++) {
                colorAttribute.array[i * 3] = fromColors[i * 3] + (toColors[i * 3] - fromColors[i * 3]) * easedProgress;
                colorAttribute.array[i * 3 + 1] = fromColors[i * 3 + 1] + (toColors[i * 3 + 1] - fromColors[i * 3 + 1]) * easedProgress;
                colorAttribute.array[i * 3 + 2] = fromColors[i * 3 + 2] + (toColors[i * 3 + 2] - fromColors[i * 3 + 2]) * easedProgress;
                
                // Interpolate alphas
                alphaAttribute.array[i] = fromAlphas[i] + (toAlphas[i] - fromAlphas[i]) * easedProgress;
            }
            
            colorAttribute.needsUpdate = true;
            alphaAttribute.needsUpdate = true;
            
            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(updateFrame);
            } else {
                this.animationFrameId = null;
            }
        };
        
        this.animationFrameId = requestAnimationFrame(updateFrame);
    }

    /**
     * Check if track matches selected genre
     */
    trackMatchesGenre(track) {
        if (!this.selectedGenre) return true;
        
        if (!track.genres) return false;
        
        const genres = Array.isArray(track.genres) ? track.genres : [track.genres];
        return genres.some(genre => genre && genre.trim() === this.selectedGenre);
    }
    
    /**
     * Update point colors based on feature
     */
    updateColors(feature, animate = true) {
        const colorAttribute = this.geometry.getAttribute('color');
        const alphaAttribute = this.geometry.getAttribute('alpha');
        const oldColors = new Float32Array(colorAttribute.array);
        const oldAlphas = new Float32Array(alphaAttribute.array);
        
        const newColors = new Float32Array(this.parsedData.length * 3);
        const newAlphas = new Float32Array(this.parsedData.length);
        
        if (feature === 'none') {
            // Set all points to grey (or dimmed if filtered)
            for (let i = 0; i < this.parsedData.length; i++) {
                const matches = this.trackMatchesGenre(this.parsedData[i]);
                if (matches) {
                    newColors[i * 3] = 0.5;     // R
                    newColors[i * 3 + 1] = 0.5; // G
                    newColors[i * 3 + 2] = 0.5; // B
                    newAlphas[i] = 0.5;
                } else {
                    // Dimmed grey for non-matching
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.1; // Very low opacity
                }
            }
        } else {
            // Color by feature
            const featureValues = this.parsedData.map(d => d[feature] || 0);
            const normalized = this.normalizeFeature(featureValues);
            
            normalized.forEach((value, i) => {
                const matches = this.trackMatchesGenre(this.parsedData[i]);
                
                if (matches) {
                    const color = this.getColorFromScale(value);
                    newColors[i * 3] = color[0];
                    newColors[i * 3 + 1] = color[1];
                    newColors[i * 3 + 2] = color[2];
                    newAlphas[i] = 0.8;
                } else {
                    // Dimmed grey for non-matching
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.1; // Very low opacity
                }
            });
        }
        
        if (animate) {
            this.animateColorTransition(oldColors, newColors, oldAlphas, newAlphas);
        } else {
            colorAttribute.array.set(newColors);
            colorAttribute.needsUpdate = true;
            alphaAttribute.array.set(newAlphas);
            alphaAttribute.needsUpdate = true;
        }
        
        this.currentColorFeature = feature;
        
        // Only show legend if not "none"
        if (feature === 'none') {
            d3.select('#color-legend').style('display', 'none');
        } else {
            d3.select('#color-legend').style('display', 'block');
            this.createLegend(feature);
        }
        
        console.log(`Updated colors to ${feature}`);
    }

    /**
     * Get color from Viridis scale
     */
    getColorFromScale(value) {
        const normalized = Math.max(0, Math.min(1, value));
        const index = normalized * (MusicUniverseVisualization.VIRIDIS_COLORS.length - 1);
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        const t = index - lowerIndex;
        
        const lower = MusicUniverseVisualization.VIRIDIS_COLORS[lowerIndex];
        const upper = MusicUniverseVisualization.VIRIDIS_COLORS[upperIndex];
        
        return [
            lower[0] + (upper[0] - lower[0]) * t,
            lower[1] + (upper[1] - lower[1]) * t,
            lower[2] + (upper[2] - lower[2]) * t
        ];
    }

    /**
     * Normalize feature values to 0-1 range
     */
    normalizeFeature(values) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        return values.map(v => range === 0 ? 0 : (v - min) / range);
    }

    /**
     * Create color legend with D3
     */
    createLegend(feature, animate = true) {
        const featureValues = this.parsedData.map(d => d[feature] || 0);
        
        let min, max;
        if (feature === 'loudness' || feature === 'key') {
            min = Math.min(...featureValues);
            max = Math.max(...featureValues);
        } else {
            min = 0;
            max = 1;
        }
        
        const container = d3.select(`#${this.containerId}`);
        const legendWidth = 20;
        const legendHeight = 300;
        const legendMargin = { top: 50, right: 30, bottom: 50 };
        
        let svg = d3.select('#color-legend');
        let g, axisGroup, titleText;
        
        if (svg.empty()) {
            const shadowPadding = 10;
            svg = container.append('svg')
                .attr('id', 'color-legend')
                .style('position', 'absolute')
                .style('right', '10px')
                .style('top', '50%')
                .style('transform', 'translateY(-50%)')
                .attr('width', legendWidth + legendMargin.right + 60 + shadowPadding * 2)
                .attr('height', legendHeight + legendMargin.top + legendMargin.bottom + shadowPadding * 2)
                .style('overflow', 'visible');
            
            // Add white background box
            svg.append('rect')
                .attr('class', 'legend-background')
                .attr('x', shadowPadding)
                .attr('y', shadowPadding)
                .attr('width', legendWidth + legendMargin.right + 60)
                .attr('height', legendHeight + legendMargin.top + legendMargin.bottom)
                .attr('rx', 12)
                .attr('ry', 12)
                .style('fill', 'rgba(255, 255, 255, 0.95)')
                .style('stroke', 'rgba(0, 0, 0, 0.1)')
                .style('stroke-width', '1px')
                .style('filter', 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))');
            
            g = svg.append('g')
                .attr('transform', `translate(${20 + shadowPadding}, ${legendMargin.top + shadowPadding})`);
            
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient')
                .attr('id', 'viridis-gradient')
                .attr('x1', '0%')
                .attr('y1', '100%')
                .attr('x2', '0%')
                .attr('y2', '0%');
            
            MusicUniverseVisualization.VIRIDIS_COLORS.forEach((color, i) => {
                gradient.append('stop')
                    .attr('offset', `${(i / (MusicUniverseVisualization.VIRIDIS_COLORS.length - 1)) * 100}%`)
                    .attr('stop-color', `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`);
            });
            
            g.append('rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .style('fill', 'url(#viridis-gradient)')
                .style('stroke', '#ccc')
                .style('stroke-width', 1);
            
            axisGroup = g.append('g')
                .attr('class', 'legend-axis')
                .attr('transform', `translate(${legendWidth}, 0)`)
                .style('font-size', '12px');
            
            titleText = g.append('text')
                .attr('class', 'legend-title')
                .attr('transform', `translate(70, ${legendHeight / 2}) rotate(90)`)
                .style('text-anchor', 'middle')
                .style('font-weight', 'bold')
                .style('font-size', '14px');
        } else {
            g = svg.select('g');
            axisGroup = g.select('.legend-axis');
            titleText = g.select('.legend-title');
        }
        
        const scale = d3.scaleLinear()
            .domain([min, max])
            .range([legendHeight, 0]);
        
        const axis = d3.axisRight(scale)
            .ticks(5)
            .tickFormat(d => d.toFixed(2));
        
        const transition = animate ? axisGroup.transition().duration(500).ease(d3.easeCubicInOut) : axisGroup;
        transition.call(axis);
        
        const featureName = feature.charAt(0).toUpperCase() + feature.slice(1);
        titleText.text(featureName);
    }

    /**
     * Update dimensions based on container size
     */
    updateDimensions() {
        const container = document.getElementById(this.containerId);
        const rect = container.getBoundingClientRect();
        
        // Use container dimensions directly
        this.width = rect.width || window.innerWidth;
        this.height = rect.height || window.innerHeight;
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.updateDimensions();
        
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(this.width, this.height);
    }

    /**
     * Setup event listeners for dropdown, genre filter, and window resize
     */
    setupEventListeners() {
        const dropdown = document.getElementById('color-feature');
        dropdown.addEventListener('change', () => {
            // Remove placeholder styling when a real option is selected
            if (dropdown.value !== '') {
                dropdown.classList.remove('placeholder-active');
            }
            // Default to 'none' if placeholder is somehow selected
            const selectedValue = dropdown.value || 'none';
            this.updateColors(selectedValue, true);
        });
        
        // Genre filter search
        const genreInput = document.getElementById('genre-filter');
        const genreSuggestions = document.getElementById('genre-suggestions');
        const clearButton = document.getElementById('clear-genre');
        
        genreInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (searchTerm.length === 0) {
                genreSuggestions.style.display = 'none';
                return;
            }
            
            // Filter genres (already sorted by count)
            const matches = this.allGenres.filter(g => 
                g.genre.toLowerCase().includes(searchTerm)
            ).slice(0, 20); // Limit to 20 results
            
            if (matches.length > 0) {
                genreSuggestions.innerHTML = matches.map(g => 
                    `<div style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;" 
                          class="genre-option" data-genre="${g.genre}">
                        <span>${this.capitalizeGenre(g.genre)}</span>
                        <span style="color: #999; font-size: 12px;">${g.count}</span>
                    </div>`
                ).join('');
                genreSuggestions.style.display = 'block';
                
                // Add click handlers to suggestions
                genreSuggestions.querySelectorAll('.genre-option').forEach(option => {
                    option.addEventListener('click', () => {
                        const genre = option.getAttribute('data-genre');
                        this.filterByGenre(genre);
                        genreInput.value = this.capitalizeGenre(genre);
                        genreSuggestions.style.display = 'none';
                        clearButton.classList.remove('hidden');
                    });
                    
                    option.addEventListener('mouseenter', (e) => {
                        e.target.style.background = '#e3f2fd';
                    });
                    
                    option.addEventListener('mouseleave', (e) => {
                        e.target.style.background = 'white';
                    });
                });
            } else {
                genreSuggestions.innerHTML = '<div style="padding: 8px; color: #999;">No matches found</div>';
                genreSuggestions.style.display = 'block';
            }
        });
        
        // Clear filter button
        clearButton.addEventListener('click', () => {
            this.selectedGenre = null;
            genreInput.value = '';
            clearButton.classList.add('hidden');
            this.updateColors(this.currentColorFeature, true);
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!genreInput.contains(e.target) && !genreSuggestions.contains(e.target)) {
                genreSuggestions.style.display = 'none';
            }
        });
        
        // Reset view button
        const resetButton = document.getElementById('reset-view');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetView();
            });
        }
        
        // Add window resize listener
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Setup zoom modifier key requirement if enabled
        if (this.options.requireModifierForZoom) {
            this.setupModifierZoom();
        }
    }
    
    /**
     * Reset camera to home position
     */
    resetView() {
        // Animate camera back to home position
        const startPosition = this.camera.position.clone();
        const targetPosition = new THREE.Vector3(7, 4, 7);
        const startTarget = this.controls.target.clone();
        const targetTarget = new THREE.Vector3(0, 0, 0);
        
        const duration = 1000; // 1 second
        const startTime = performance.now();
        
        const animateReset = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate camera position
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            // Interpolate controls target
            this.controls.target.lerpVectors(startTarget, targetTarget, eased);
            
            if (progress < 1) {
                requestAnimationFrame(animateReset);
            }
        };
        
        requestAnimationFrame(animateReset);
    }
    
    /**
     * Setup modifier key requirement for zoom
     */
    setupModifierZoom() {
        this.controls.enableZoom = false; // Disable default zoom
        
        this.renderer.domElement.addEventListener('wheel', (event) => {
            // Only zoom if Cmd (Mac) or Ctrl (Windows/Linux) is held
            if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                
                const delta = event.deltaY;
                const zoomSpeed = 0.1;
                
                // Manual zoom by adjusting camera position
                const direction = new THREE.Vector3();
                this.camera.getWorldDirection(direction);
                
                if (delta < 0) {
                    // Zoom in
                    this.camera.position.addScaledVector(direction, zoomSpeed);
                } else {
                    // Zoom out
                    this.camera.position.addScaledVector(direction, -zoomSpeed);
                }
            }
        }, { passive: false });
    }
    
    /**
     * Capitalize genre name for display
     */
    capitalizeGenre(genre) {
        return genre
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    /**
     * Filter visualization by genre
     */
    filterByGenre(genre) {
        this.selectedGenre = genre;
        this.updateColors(this.currentColorFeature, true);
        console.log(`Filtering by genre: ${genre}`);
    }
}

// Initialize visualization when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're in the fullscreen demo or regular demo
    const isFullscreen = document.getElementById('canvas-container') !== null;

    if (isFullscreen) {
        const visualization = new MusicUniverseVisualization(
            'canvas-container',
            'data/processed/spotify_tracks_pca.ndjson',
            {
                showBorder: false,
                requireModifierForZoom: true
            }
        );
        visualization.init();
    } else {
        const visualization = new MusicUniverseVisualization(
            'universe-vis',
            '../data/processed/spotify_tracks_pca.ndjson'
        );
        visualization.init();
    }
});
