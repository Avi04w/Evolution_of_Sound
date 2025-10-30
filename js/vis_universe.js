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
        
        // Billboard data
        this.billboardData = [];
        this.availableYears = [];
        this.availableWeeks = [];
        this.selectedYear = null;
        this.currentWeek = null; // Current week during animation
        this.billboardMode = false;
        this.timelineIsPlaying = false;
        this.timelineAnimationId = null;
        
        // Interaction
        this.raycaster = null;
        this.mouse = null;
        this.hoveredPoint = null;
        this.tooltip = null;
        
        // PCA Loading Vectors
        this.loadingVectors = null;
        this.loadingArrows = [];
        this.showLoadings = false;
        
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
            await this.loadBillboardData();
            await this.loadPCALoadings();
            this.initScene();
            this.setupEventListeners();
            this.setupIntersectionObserver();
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
     * Load Billboard Hot 100 chart data
     */
    async loadBillboardData() {
        try {
            const response = await fetch('data/processed/billboard.ndjson');
            const text = await response.text();
            
            this.billboardData = text.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => JSON.parse(line));

            // Sort by date for efficient filtering
            this.billboardData.sort((a, b) => a.date.localeCompare(b.date));

            console.log(`Loaded ${this.billboardData.length} Billboard chart entries`);
            
            // Filter to 1980 onwards
            this.billboardData = this.billboardData.filter(entry => 
                new Date(entry.date).getFullYear() >= 1980
            );
            
            console.log(`Filtered to ${this.billboardData.length} entries from 1980+`);
            
            // Extract unique years from dates
            const yearSet = new Set(this.billboardData.map(entry => {
                return new Date(entry.date).getFullYear();
            }));
            this.availableYears = Array.from(yearSet).sort((a, b) => b - a); // Most recent first
            
            console.log(`Found ${this.availableYears.length} unique years in Billboard data`);
            
            // Extract unique weeks sorted chronologically
            const weekSet = new Set(this.billboardData.map(entry => entry.date));
            this.availableWeeks = Array.from(weekSet).sort(); // Already sorted
            console.log(`Found ${this.availableWeeks.length} unique weeks in Billboard data`);
            
            // Create indexed data structures for faster lookups
            this.createBillboardIndexes();
            
            // Populate year dropdown
            this.populateYearDropdown();
        } catch (error) {
            console.error('Error loading Billboard data:', error);
        }
    }
    
    /**
     * Create indexed data structures for faster Billboard lookups
     */
    createBillboardIndexes() {
        // Index by week for O(1) lookups
        this.billboardByWeek = new Map();
        this.billboardData.forEach(entry => {
            if (!this.billboardByWeek.has(entry.date)) {
                this.billboardByWeek.set(entry.date, new Map());
            }
            this.billboardByWeek.get(entry.date).set(entry.id, entry.rank);
        });
        
        // Index by year for faster yearly aggregation
        this.billboardByYear = new Map();
        this.billboardData.forEach(entry => {
            const year = new Date(entry.date).getFullYear();
            if (!this.billboardByYear.has(year)) {
                this.billboardByYear.set(year, new Map());
            }
            const yearData = this.billboardByYear.get(year);
            const currentBest = yearData.get(entry.id);
            if (currentBest === undefined || entry.rank < currentBest) {
                yearData.set(entry.id, entry.rank);
            }
        });
        
        console.log('Created Billboard indexes for fast lookups');
    }
    
    /**
     * Load PCA loading vectors from CSV
     */
    async loadPCALoadings() {
        try {
            const response = await fetch('data/processed/spotify_track_pca_loadings.csv');
            const text = await response.text();
            
            // Parse CSV
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',').slice(1); // Skip first empty column
            
            this.loadingVectors = {};
            
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                const featureName = parts[0];
                const pc0 = parseFloat(parts[1]);
                const pc1 = parseFloat(parts[2]);
                const pc2 = parseFloat(parts[3]);
                
                this.loadingVectors[featureName] = { pc0, pc1, pc2 };
            }
            
            console.log('Loaded PCA loading vectors:', this.loadingVectors);
        } catch (error) {
            console.error('Error loading PCA loadings:', error);
        }
    }

    /**
     * Create the timeline UI with available years
     */
    populateYearDropdown() {
        // Create timeline
        this.createTimeline();
    }
    
    /**
     * Format date range display with fixed-width dash
     */
    formatDateRange(startDate, endDate) {
        const startStr = startDate.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        });
        const endStr = endDate.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        });
        
        // Pad to ensure dash stays in same position
        const maxLen = 16; // "MMM DD, YYYY" is ~13-14 chars
        const paddedStart = startStr.padEnd(maxLen, ' ');
        
        return `${paddedStart} – ${endStr}`;
    }
    
    /**
     * Create interactive timeline
     */
    createTimeline() {
        const container = document.getElementById('timeline-container');
        const slider = document.getElementById('timeline-slider');
        const track = document.getElementById('timeline-track');
        const labelsContainer = document.getElementById('timeline-labels');
        const yearDisplay = document.getElementById('timeline-year-display');
        
        if (!container || !slider || !track || !labelsContainer) return;
        
        // Sort years ascending for timeline
        const sortedYears = [...this.availableYears].sort((a, b) => a - b);
        const minYear = Math.max(1980, sortedYears[0]); // Set minimum to 1980
        const maxYear = sortedYears[sortedYears.length - 1];
        
        // Filter years to only include 1980 and later
        const filteredYears = sortedYears.filter(year => year >= 1980);
        
        // Store timeline state
        this.timelineMinYear = minYear;
        this.timelineMaxYear = maxYear;
        this.timelineSortedYears = filteredYears;
        
        // Create tick marks for each year
        const ticksContainer = document.getElementById('timeline-ticks');
        if (ticksContainer) {
            ticksContainer.innerHTML = '';
            
            // Create a tick for each year boundary
            for (let year = minYear; year <= maxYear; year++) {
                // Find the first week of this year
                const yearStart = `${year}-01-01`;
                const weekIndex = this.availableWeeks.findIndex(week => week >= yearStart);
                
                if (weekIndex >= 0) {
                    const tick = document.createElement('div');
                    tick.className = 'timeline-tick';
                    
                    // Make every 5th year a major tick
                    if (year % 5 === 0) {
                        tick.classList.add('major');
                    }
                    
                    const position = (weekIndex / (this.availableWeeks.length - 1)) * 100;
                    tick.style.left = `${position}%`;
                    ticksContainer.appendChild(tick);
                }
            }
        }
        
        // Calculate puck width (1 year = 52 weeks)
        const oneYearInWeeks = 52;
        const puckWidthPercent = (oneYearInWeeks / (this.availableWeeks.length - 1)) * 100;
        slider.style.width = `${puckWidthPercent}%`;
        
        // Create year labels (show every few years to avoid crowding)
        const yearRange = maxYear - minYear;
        const labelStep = yearRange <= 10 ? 1 : yearRange <= 20 ? 2 : 5;
        
        labelsContainer.innerHTML = '';
        for (let year = minYear; year <= maxYear; year += labelStep) {
            const label = document.createElement('div');
            label.textContent = year;
            label.style.flex = '0 0 auto';
            labelsContainer.appendChild(label);
        }
        
        // Add final year if not included
        if ((maxYear - minYear) % labelStep !== 0) {
            const label = document.createElement('div');
            label.textContent = maxYear;
            labelsContainer.appendChild(label);
        }
        
        // Timeline interaction - now based on weeks
        let isDragging = false;
        
        const updateSliderPosition = (clientX) => {
            const rect = track.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            const percentage = x / rect.width;
            
            // Map to week index (smooth, continuous position)
            let weekIndex = Math.round(percentage * (this.availableWeeks.length - 1));
            
            // Constrain the week index so that endDate doesn't exceed max date
            // Find max valid week index where week + 52 weeks <= last week
            const maxDate = new Date(this.availableWeeks[this.availableWeeks.length - 1]);
            const maxValidIndex = this.availableWeeks.findIndex(week => {
                const endDate = new Date(week);
                endDate.setFullYear(endDate.getFullYear() + 1);
                return endDate > maxDate;
            });
            
            // If we found a constraint, apply it; otherwise allow full range
            if (maxValidIndex > 0) {
                weekIndex = Math.min(weekIndex, maxValidIndex - 1);
            }
            
            const week = this.availableWeeks[weekIndex];
            const weekDate = new Date(week);
            const year = weekDate.getFullYear();
            
            // Update slider position smoothly based on week
            slider.style.left = `${(weekIndex / (this.availableWeeks.length - 1)) * 100}%`;
            
            // Store current week
            this.currentWeek = week;
            this.selectedYear = year;
            
            // Calculate end date (1 year later) - create independent Date objects
            const startDate = new Date(week);
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            // Update year display with new format
            const yearEl = yearDisplay.querySelector('.year');
            const dateRangeEl = yearDisplay.querySelector('.date-range');
            if (yearEl && dateRangeEl) {
                yearEl.textContent = year;
                dateRangeEl.textContent = this.formatDateRange(startDate, endDate);
            }
            
            // Update visualization
            this.billboardMode = true;
            this.updateColors('none', false); // No animation for smooth dragging
            
            // Show clear button
            const clearButton = document.getElementById('clear-billboard');
            if (clearButton) {
                clearButton.classList.remove('hidden');
            }
            
            // Disable color dropdown
            const dropdown = document.getElementById('color-feature');
            if (dropdown) {
                dropdown.disabled = true;
                dropdown.style.opacity = '0.5';
                dropdown.style.cursor = 'not-allowed';
            }
        };
        
        const startDrag = (e) => {
            isDragging = true;
            slider.style.cursor = 'grabbing';
            // Pause animation if user manually interacts
            this.pauseTimeline();
            updateSliderPosition(e.clientX || e.touches[0].clientX);
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            updateSliderPosition(e.clientX || e.touches[0].clientX);
        };
        
        const endDrag = () => {
            isDragging = false;
            slider.style.cursor = 'grab';
        };
        
        // Mouse events
        slider.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
        
        // Touch events
        slider.addEventListener('touchstart', startDrag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', endDrag);
        
        // Click on track to jump
        track.addEventListener('click', (e) => {
            updateSliderPosition(e.clientX);
        });
        
        // Store updateSliderPosition for use in play function
        this.updateTimelineSliderPosition = updateSliderPosition;
    }
    
    /**
     * Play timeline animation with weekly granularity
     */
    playTimeline() {
        if (this.timelineIsPlaying) return;
        
        this.timelineIsPlaying = true;
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.textContent = '⏸ Pause';
        }
        
        // Calculate max valid week index (where endDate doesn't exceed max date)
        const maxDate = new Date(this.availableWeeks[this.availableWeeks.length - 1]);
        const maxValidIndex = this.availableWeeks.findIndex(week => {
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            return endDate > maxDate;
        });
        const maxWeekIndex = maxValidIndex > 0 ? maxValidIndex - 1 : this.availableWeeks.length - 1;
        
        // Find current week index or start from beginning
        let currentWeekIndex = 0;
        if (this.selectedYear) {
            // Find the first week of the selected year
            const currentYearWeeks = this.availableWeeks.filter(week => 
                new Date(week).getFullYear() === parseInt(this.selectedYear)
            );
            if (currentYearWeeks.length > 0) {
                currentWeekIndex = this.availableWeeks.indexOf(currentYearWeeks[0]);
            }
        }
        
        const animateWeek = () => {
            if (!this.timelineIsPlaying) return;
            
            const week = this.availableWeeks[currentWeekIndex];
            const weekDate = new Date(week);
            const year = weekDate.getFullYear();
            
            // Store current week for visualization
            this.currentWeek = week;
            this.selectedYear = year;
            this.billboardMode = true;
            
            // Calculate end date (1 year later) - create independent Date objects
            const startDate = new Date(week);
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            // Update year display
            const yearDisplay = document.getElementById('timeline-year-display');
            if (yearDisplay) {
                const yearEl = yearDisplay.querySelector('.year');
                const dateRangeEl = yearDisplay.querySelector('.date-range');
                if (yearEl && dateRangeEl) {
                    yearEl.textContent = year;
                    dateRangeEl.textContent = this.formatDateRange(startDate, endDate);
                }
            }
            
            // Update slider position smoothly based on week index
            const slider = document.getElementById('timeline-slider');
            if (slider) {
                const percentage = currentWeekIndex / (this.availableWeeks.length - 1);
                slider.style.left = `${percentage * 100}%`;
            }
            
            // Update visualization with cumulative data up to this week
            this.updateColors('none', false); // No animation for smooth playback
            
            // Show clear button
            const clearButton = document.getElementById('clear-billboard');
            if (clearButton) {
                clearButton.classList.remove('hidden');
            }
            
            // Disable color dropdown
            const dropdown = document.getElementById('color-feature');
            if (dropdown) {
                dropdown.disabled = true;
                dropdown.style.opacity = '0.5';
                dropdown.style.cursor = 'not-allowed';
            }
            
            currentWeekIndex++;
            
            // Loop back to start or stop at end (respecting max valid index)
            if (currentWeekIndex > maxWeekIndex) {
                currentWeekIndex = 0; // Loop
            }
            
            // Advance every 50ms for smooth weekly animation (20 weeks per second)
            this.timelineAnimationId = setTimeout(animateWeek, 3);
        };
        
        animateWeek();
    }
    
    /**
     * Pause timeline animation
     */
    pauseTimeline() {
        this.timelineIsPlaying = false;
        this.currentWeek = null; // Clear week so it uses yearly aggregate
        
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.textContent = '▶ Play';
        }
        
        if (this.timelineAnimationId) {
            clearTimeout(this.timelineAnimationId);
            this.timelineAnimationId = null;
        }
        
        // Keep the current display (year and date range remain visible when paused)
        if (this.selectedYear) {
            // Refresh visualization with yearly aggregate
            this.updateColors('none', true);
        }
    }

    /**
     * Get Billboard peak rankings for a specific year (using index)
     * Returns a Map of track IDs to their best (lowest) ranking in that year
     */
    getBillboardPeakRankingsForYear(year) {
        return this.billboardByYear.get(parseInt(year)) || new Map();
    }
    
    /**
     * Get Billboard rankings for a rolling 1-year window starting from a specific week
     * Returns a Map of track IDs to their best ranking in the year following that week
     * Uses binary search on sorted data for efficient filtering
     */
    getBillboardRankingsUpToWeek(targetWeek) {
        const endDate = new Date(targetWeek);
        endDate.setFullYear(endDate.getFullYear() + 1);
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const rankings = new Map();
        
        // Binary search to find start index
        let startIdx = this.binarySearchWeek(targetWeek);
        if (startIdx === -1) return rankings;
        
        // Iterate from start until we exceed the end date
        for (let i = startIdx; i < this.billboardData.length; i++) {
            const entry = this.billboardData[i];
            if (entry.date >= endDateStr) break;
            
            const currentBest = rankings.get(entry.id);
            if (currentBest === undefined || entry.rank < currentBest) {
                rankings.set(entry.id, entry.rank);
            }
        }
        
        return rankings;
    }
    
    /**
     * Binary search to find the starting index for a given week
     */
    binarySearchWeek(targetWeek) {
        let left = 0;
        let right = this.billboardData.length - 1;
        let result = -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midDate = this.billboardData[mid].date;
            
            if (midDate < targetWeek) {
                left = mid + 1;
            } else {
                result = mid;
                right = mid - 1;
            }
        }
        
        return result;
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
        
        // Create loading arrows
        this.createLoadingArrows();
        
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
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    // Create circular shape directly in shader
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    // Discard fragments outside circle radius
                    if (dist > 0.5) discard;
                    
                    float finalAlpha = vAlpha;
                    
                    // For dimmed points, use much lower alpha
                    // if (vAlpha < 0.3) {
                    //     finalAlpha = finalAlpha * 0.15; // Very low alpha
                    // }
                    
                    // Use alpha test to reduce blending artifacts with depthWrite
                    // Only write depth for sufficiently opaque fragments
                    if (finalAlpha < 0.05) discard;
                    
                    gl_FragColor = vec4(vColor, finalAlpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            depthWrite: true,
            blending: THREE.NormalBlending,
            depthTest: true,
            alphaToCoverage: true
        });
        
        this.points = new THREE.Points(this.geometry, material);
        this.scene.add(this.points);
    }

    /**
     * Create high-quality circular texture for point markers
     * Creates a solid circle with sharp edges
     */
    createCircleTexture() {
        const size = 256; // Higher resolution
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 3; // Slightly smaller to avoid edge artifacts
        
        // Clear canvas
        ctx.clearRect(0, 0, size, size);
        
        // Draw solid circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Create PCA loading vector arrows
     */
    createLoadingArrows() {
        if (!this.loadingVectors) return;
        
        // Color map for each feature (store as class property for legend)
        this.featureColors = {
            'danceability': 0xFF0000,      // Red
            'energy': 0xFF7F00,            // Orange
            'key': 0xFFFF00,               // Yellow
            'loudness': 0x00FF00,          // Green
            'mode': 0x00FFFF,              // Cyan
            'speechiness': 0x0000FF,       // Blue
            'acousticness': 0x7F00FF,      // Purple
            'instrumentalness': 0xFF00FF,  // Magenta
            'liveness': 0xFFC0CB,          // Pink
            'valence': 0xA52A2A            // Brown
        };
        
        // Calculate reference length (use energy as reference)
        const energyLoading = this.loadingVectors['energy'];
        const energyDirection = new THREE.Vector3(energyLoading.pc0, energyLoading.pc1, energyLoading.pc2);
        const referenceLength = energyDirection.length() * 7; // Scale factor of 7
        
        Object.entries(this.loadingVectors).forEach(([feature, loading]) => {
            const direction = new THREE.Vector3(loading.pc0, loading.pc1, loading.pc2);
            // Normalize all arrows to the same length (reference length)
            const normalizedLength = referenceLength;
            const color = this.featureColors[feature] || 0xFFFFFF;
            
            // Create arrow (no text labels - we'll use a legend instead)
            const arrow = new THREE.ArrowHelper(
                direction.normalize(),
                new THREE.Vector3(0, 0, 0), // Origin
                normalizedLength,
                color,
                normalizedLength * 0.1, // Head length (reduced from 0.2)
                normalizedLength * 0.08  // Head width (reduced from 0.15)
            );
            
            arrow.visible = false; // Hidden by default
            arrow.userData.feature = feature;
            
            this.scene.add(arrow);
            this.loadingArrows.push(arrow);
        });
        
        console.log(`Created ${this.loadingArrows.length} loading vector arrows`);
        
        // Create legend for loading vectors
        this.createLoadingVectorLegend();
    }
    
    /**
     * Create legend for loading vectors
     */
    createLoadingVectorLegend() {
        const container = document.getElementById(this.containerId);
        
        // Create legend container
        const legend = document.createElement('div');
        legend.id = 'loading-vectors-legend';
        legend.style.position = 'absolute';
        legend.style.right = '10px';
        legend.style.background = 'rgba(255, 255, 255, 0.95)';
        legend.style.padding = '15px 20px';
        legend.style.borderRadius = '12px';
        legend.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        legend.style.display = 'none';
        legend.style.zIndex = '1000';
        legend.style.fontSize = '13px';
        legend.style.fontFamily = 'Arial, sans-serif';
        legend.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        // Add smooth transitions
        legend.style.transition = 'top 0.5s ease-in-out, transform 0.5s ease-in-out, opacity 0.3s ease-in-out';
        legend.style.opacity = '0';
        
        // Add title
        const title = document.createElement('div');
        title.textContent = 'Loading Vectors';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '10px';
        title.style.fontSize = '14px';
        title.style.borderBottom = '1px solid #ddd';
        title.style.paddingBottom = '8px';
        title.style.textAlign = 'center';
        legend.appendChild(title);
        
        // Add items for each feature
        Object.entries(this.featureColors).forEach(([feature, colorHex]) => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.marginBottom = '6px';
            
            // Color box
            const colorBox = document.createElement('div');
            colorBox.style.width = '16px';
            colorBox.style.height = '16px';
            colorBox.style.backgroundColor = `#${colorHex.toString(16).padStart(6, '0')}`;
            colorBox.style.marginRight = '10px';
            colorBox.style.border = '1px solid #999';
            colorBox.style.borderRadius = '2px';
            colorBox.style.flexShrink = '0';
            
            // Feature name
            const label = document.createElement('span');
            label.textContent = feature.charAt(0).toUpperCase() + feature.slice(1);
            label.style.fontSize = '12px';
            
            item.appendChild(colorBox);
            item.appendChild(label);
            legend.appendChild(item);
        });
        
        container.appendChild(legend);
        this.loadingVectorLegend = legend;
    }
    
    /**
     * Toggle visibility of loading arrows and legend
     */
    toggleLoadingArrows(visible) {
        this.showLoadings = visible;
        this.loadingArrows.forEach(arrow => {
            arrow.visible = visible;
        });
        
        // Toggle legend visibility with smooth transition
        if (this.loadingVectorLegend) {
            if (visible) {
                this.loadingVectorLegend.style.display = 'block';
                // Trigger reflow to enable transition
                this.loadingVectorLegend.offsetHeight;
                this.loadingVectorLegend.style.opacity = '1';
            } else {
                this.loadingVectorLegend.style.opacity = '0';
                setTimeout(() => {
                    if (!this.showLoadings) {
                        this.loadingVectorLegend.style.display = 'none';
                    }
                }, 300); // Match opacity transition duration
            }
        }
        
        // Recreate color legend with new size if it's visible
        const colorLegend = document.getElementById('color-legend');
        if (colorLegend && colorLegend.style.display !== 'none') {
            // Remove existing legend and recreate with new dimensions
            d3.select('#color-legend').remove();
            if (this.billboardMode && this.selectedYear) {
                this.createBillboardLegend(false);
            } else if (this.currentColorFeature !== 'none') {
                this.createLegend(this.currentColorFeature, false);
            }
        }
        
        // Reposition legends to center them as a unit
        this.repositionRightLegends();
        
        console.log(`Loading arrows ${visible ? 'shown' : 'hidden'}`);
    }
    
    /**
     * Reposition right-side legends to center them as a unit
     */
    repositionRightLegends() {
        const colorLegend = document.getElementById('color-legend');
        const loadingLegend = this.loadingVectorLegend;
        
        // Check visibility of both legends
        const colorLegendVisible = colorLegend && colorLegend.style.display !== 'none';
        const loadingLegendVisible = loadingLegend && loadingLegend.style.display !== 'none';
        
        if (!colorLegendVisible && !loadingLegendVisible) {
            return; // No legends to position
        }
        
        const gap = 20;
        
        // Center the unit vertically
        if (colorLegendVisible && loadingLegendVisible) {
            // Both legends visible - stack them
            // Get heights after a small delay to ensure rendering
            requestAnimationFrame(() => {
                const colorHeight = colorLegend.getBoundingClientRect().height;
                const loadingHeight = loadingLegend.getBoundingClientRect().height;
                const totalHeight = colorHeight + loadingHeight + gap;
                
                // Position color legend at top of the centered unit
                colorLegend.style.top = `calc(50% - ${totalHeight / 2}px)`;
                colorLegend.style.transform = 'none';
                
                // Position loading legend below color legend
                loadingLegend.style.top = `calc(50% - ${totalHeight / 2}px + ${colorHeight + gap}px)`;
                loadingLegend.style.transform = 'none';
            });
        } else if (colorLegendVisible) {
            // Only color legend - restore default centering
            colorLegend.style.top = '50%';
            colorLegend.style.transform = 'translateY(-50%)';
        } else if (loadingLegendVisible) {
            // Only loading legend - center it
            loadingLegend.style.top = '50%';
            loadingLegend.style.transform = 'translateY(-50%)';
        }
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
            
            // Find first intersected point that matches both genre and Billboard filters
            let validIntersect = null;
            for (let i = 0; i < intersects.length; i++) {
                const index = intersects[i].index;
                const track = this.parsedData[index];
                if (this.trackMatchesGenre(track) && this.trackMatchesBillboard(track)) {
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
        
        // Check if this track is in Billboard chart
        let billboardInfo = '';
        if (this.billboardMode && this.selectedYear) {
            const rankings = this.currentWeek 
                ? this.getBillboardRankingsUpToWeek(this.currentWeek)
                : this.getBillboardPeakRankingsForYear(this.selectedYear);
            const peakRank = rankings.get(data.id);
            if (peakRank !== undefined) {
                const timeframe = this.currentWeek 
                    ? `Next Year from ${new Date(this.currentWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : `${this.selectedYear}`;
                billboardInfo = `
                    <div style="margin-bottom: 8px; padding: 8px; background: rgba(255, 215, 0, 0.2); border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.5);">
                        <strong style="font-size: 12px; color: #FFD700;">🏆 Peak Rank: #${peakRank}</strong><br>
                        <span style="font-size: 11px; color: #999;">${timeframe}</span>
                    </div>
                `;
            }
        }
        
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
            ${billboardInfo}
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
     * Check if track is in current Billboard Hot 100 selection
     */
    trackMatchesBillboard(track) {
        if (!this.billboardMode || !this.selectedYear) return true;
        
        const rankings = this.currentWeek 
            ? this.getBillboardRankingsUpToWeek(this.currentWeek)
            : this.getBillboardPeakRankingsForYear(this.selectedYear);
        
        return rankings.has(track.id);
    }
    
    /**
     * Update point colors based on feature or Billboard mode
     */
    updateColors(feature, animate = true) {
        const colorAttribute = this.geometry.getAttribute('color');
        const alphaAttribute = this.geometry.getAttribute('alpha');
        const oldColors = new Float32Array(colorAttribute.array);
        const oldAlphas = new Float32Array(alphaAttribute.array);
        
        const newColors = new Float32Array(this.parsedData.length * 3);
        const newAlphas = new Float32Array(this.parsedData.length);
        
        // Check if we're in Billboard mode
        if (this.billboardMode && this.selectedYear) {
            // Use week-specific data if we're animating, otherwise use yearly aggregate
            const rankings = this.currentWeek 
                ? this.getBillboardRankingsUpToWeek(this.currentWeek)
                : this.getBillboardPeakRankingsForYear(this.selectedYear);
            
            for (let i = 0; i < this.parsedData.length; i++) {
                const track = this.parsedData[i];
                const peakRank = rankings.get(track.id);
                
                if (peakRank !== undefined) {
                    // Track charted - color by peak ranking (up to current week if animating)
                    // Rank 1 = best (yellow), Rank 100 = worst (dark purple)
                    // Invert: (100 - rank) / 99 so rank 1 gets 1.0, rank 100 gets 0.0
                    const normalizedRank = (100 - peakRank) / 99;
                    const color = this.getColorFromScale(normalizedRank);
                    newColors[i * 3] = color[0];
                    newColors[i * 3 + 1] = color[1];
                    newColors[i * 3 + 2] = color[2];
                    newAlphas[i] = 0.9;
                } else {
                    // Not on chart - grey out
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.3;
                }
            }
        } else if (feature === 'none') {
            // Set all points to grey (or dimmed if filtered by genre)
            for (let i = 0; i < this.parsedData.length; i++) {
                const matches = this.trackMatchesGenre(this.parsedData[i]);
                if (matches) {
                    newColors[i * 3] = 0.5;     // R
                    newColors[i * 3 + 1] = 0.5; // G
                    newColors[i * 3 + 2] = 0.5; // B
                    newAlphas[i] = 0.6;
                } else {
                    // Dimmed grey for non-matching
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.3; // Very low opacity
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
                    newAlphas[i] = 0.3; // Very low opacity
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
        
        // Update legend display
        if (this.billboardMode && this.selectedYear) {
            d3.select('#color-legend').style('display', 'block');
            this.createBillboardLegend();
        } else if (feature === 'none') {
            d3.select('#color-legend').style('display', 'none');
        } else {
            d3.select('#color-legend').style('display', 'block');
            this.createLegend(feature);
        }
        
        // Reposition legends after visibility changes
        setTimeout(() => this.repositionRightLegends(), 100);
        
        console.log(`Updated colors to ${this.billboardMode ? 'Billboard peak rankings' : feature}`);
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
        // Reduce height when loading vectors are visible to fit both legends
        const legendHeight = this.showLoadings ? 200 : 300;
        const legendMargin = { top: 40, right: 30, bottom: 40 };
        
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
                .style('overflow', 'visible')
                .style('transition', 'top 0.5s ease-in-out, transform 0.5s ease-in-out, height 0.5s ease-in-out');
            
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
     * Create Billboard ranking legend
     */
    createBillboardLegend(animate = true) {
        const container = d3.select(`#${this.containerId}`);
        const legendWidth = 20;
        // Reduce height when loading vectors are visible to fit both legends
        const legendHeight = this.showLoadings ? 200 : 300;
        const legendMargin = { top: 40, right: 30, bottom: 40 };
        
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
                .style('overflow', 'visible')
                .style('transition', 'top 0.5s ease-in-out, transform 0.5s ease-in-out, height 0.5s ease-in-out');
            
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
        
        // Rankings go from 1 (best) to 100 (worst)
        // Display inverted so #1 is at top
        const scale = d3.scaleLinear()
            .domain([100, 1])
            .range([legendHeight, 0]);
        
        const axis = d3.axisRight(scale)
            .tickValues([1, 25, 50, 75, 100])
            .tickFormat(d => `#${Math.round(d)}`);
        
        const transition = animate ? axisGroup.transition().duration(500).ease(d3.easeCubicInOut) : axisGroup;
        transition.call(axis);
        
        titleText.text('Peak Rank');
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
        
        // Billboard play button
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.addEventListener('click', () => {
                if (this.timelineIsPlaying) {
                    this.pauseTimeline();
                } else {
                    this.playTimeline();
                }
            });
        }
        
        // Billboard clear button
        const clearBillboard = document.getElementById('clear-billboard');
        
        if (clearBillboard) {
            clearBillboard.addEventListener('click', () => {
                // Stop animation if playing
                this.pauseTimeline();
                
                this.billboardMode = false;
                this.selectedYear = null;
                this.currentWeek = null;
                clearBillboard.classList.add('hidden');
                
                // Reset timeline display
                const yearEl = document.querySelector('#timeline-year-display .year');
                const dateRangeEl = document.querySelector('#timeline-year-display .date-range');
                if (yearEl) {
                    yearEl.textContent = '—';
                }
                if (dateRangeEl) {
                    dateRangeEl.textContent = 'No year selected';
                }
                
                // Reset slider to start
                const slider = document.getElementById('timeline-slider');
                if (slider) {
                    slider.style.left = '0%';
                }
                
                // Re-enable color feature dropdown
                dropdown.disabled = false;
                dropdown.style.opacity = '1';
                dropdown.style.cursor = 'pointer';
                
                // Reapply current color feature
                this.updateColors(this.currentColorFeature, true);
            });
        }
        
        // Reset view button
        const resetButton = document.getElementById('reset-view');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetView();
            });
        }
        
        // PCA loadings checkbox
        const showLoadingsCheckbox = document.getElementById('show-loadings');
        if (showLoadingsCheckbox) {
            showLoadingsCheckbox.addEventListener('change', (e) => {
                this.toggleLoadingArrows(e.target.checked);
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
     * Setup intersection observer to auto-check loading vectors when scrolled into view
     */
    setupIntersectionObserver() {
        const pcaSection = document.getElementById('pca-loadings-section');
        const showLoadingsCheckbox = document.getElementById('show-loadings');
        
        if (!pcaSection || !showLoadingsCheckbox) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.showLoadings) {
                    // Auto-check the checkbox when section becomes visible
                    showLoadingsCheckbox.checked = true;
                    this.toggleLoadingArrows(true);
                }
            });
        }, {
            threshold: 0.5 // Trigger when 50% of the section is visible
        });
        
        observer.observe(pcaSection);
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
