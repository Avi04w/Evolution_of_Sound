/**
 * SceneManager.js
 * Manages Three.js scene setup, rendering, and 3D elements
 */

export class SceneManager {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = options;
        
        // Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = null;
        
        // Geometry and materials
        this.geometry = null;
        this.points = null;
        this.loadingArrows = [];
        this.loadingVectorLegend = null;
        
        // Dimensions
        this.width = 0;
        this.height = 0;
        
        // Feature colors for loading vectors
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
        
        // Animation
        this.animationRunning = false;
    }
    
    /**
     * Initialize the Three.js scene
     */
    initialize() {
        const container = document.getElementById(this.containerId);
        
        // Calculate dimensions
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
            this.renderer.domElement.classList.add('canvas-highlight');
        }
        
        container.appendChild(this.renderer.domElement);
        
        // Initialize raycaster
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.3;
        this.mouse = new THREE.Vector2();
        
        // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);
        
        // Add helpers
        const axesHelper = new THREE.AxesHelper(10);
        axesHelper.material.opacity = 0.5;
        axesHelper.material.transparent = true;
        this.scene.add(axesHelper);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        console.log('Three.js scene initialized');
    }
    
    /**
     * Create point cloud from track data
     */
    createPointCloud(trackData) {
        this.geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(trackData.length * 3);
        const colors = new Float32Array(trackData.length * 3);
        const alphas = new Float32Array(trackData.length);
        
        trackData.forEach((d, i) => {
            positions[i * 3] = d.pc0 || 0;
            positions[i * 3 + 1] = d.pc1 || 0;
            positions[i * 3 + 2] = d.pc2 || 0;
            alphas[i] = 1.0;
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
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    if (dist > 0.5) discard;
                    
                    float finalAlpha = vAlpha;
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
        
        console.log(`Created point cloud with ${trackData.length} points`);
    }
    
    /**
     * Create PCA loading vector arrows
     */
    createLoadingArrows(loadingVectors) {
        if (!loadingVectors) return;
        
        // Calculate reference length (use energy as reference)
        const energyLoading = loadingVectors['energy'];
        const energyDirection = new THREE.Vector3(energyLoading.pc0, energyLoading.pc1, energyLoading.pc2);
        const referenceLength = energyDirection.length() * 7;
        
        Object.entries(loadingVectors).forEach(([feature, loading]) => {
            const direction = new THREE.Vector3(loading.pc0, loading.pc1, loading.pc2);
            const normalizedLength = referenceLength;
            const color = this.featureColors[feature] || 0xFFFFFF;
            
            const arrow = new THREE.ArrowHelper(
                direction.normalize(),
                new THREE.Vector3(0, 0, 0),
                normalizedLength,
                color,
                normalizedLength * 0.1,
                normalizedLength * 0.08
            );
            
            arrow.visible = false;
            arrow.userData.feature = feature;
            
            this.scene.add(arrow);
            this.loadingArrows.push(arrow);
        });
        
        console.log(`Created ${this.loadingArrows.length} loading vector arrows`);
    }
    
    /**
     * Create legend for loading vectors
     */
    createLoadingVectorLegend() {
        const container = document.getElementById(this.containerId);
        
        const legend = document.createElement('div');
        legend.id = 'loading-vector-legend';
        
        const title = document.createElement('div');
        title.className = 'legend-title';
        title.textContent = 'Loading Vectors';
        legend.appendChild(title);
        
        // Track visibility state for each feature
        this.vectorVisibility = {};
        
        Object.entries(this.featureColors).forEach(([feature, colorHex]) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.cursor = 'pointer';
            item.dataset.feature = feature;
            
            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color-box';
            colorBox.style.backgroundColor = `#${colorHex.toString(16).padStart(6, '0')}`;
            
            const label = document.createElement('span');
            label.className = 'legend-label';
            label.textContent = feature.charAt(0).toUpperCase() + feature.slice(1);
            
            item.appendChild(colorBox);
            item.appendChild(label);
            
            // Initialize as visible (since loadings start visible when checkbox is checked)
            this.vectorVisibility[feature] = true;
            
            // Add click handler to toggle individual vector
            item.addEventListener('click', () => {
                this.toggleIndividualVector(feature);
            });
            
            legend.appendChild(item);
        });
        
        container.appendChild(legend);
        this.loadingVectorLegend = legend;
    }
    
    /**
     * Toggle visibility of a single loading vector
     */
    toggleIndividualVector(feature) {
        // Toggle the visibility state
        this.vectorVisibility[feature] = !this.vectorVisibility[feature];
        const isVisible = this.vectorVisibility[feature];
        
        // Update the arrow visibility
        this.loadingArrows.forEach(arrow => {
            if (arrow.userData.feature === feature) {
                arrow.visible = isVisible;
            }
        });
        
        // Update the legend item appearance
        const legendItem = this.loadingVectorLegend.querySelector(`[data-feature="${feature}"]`);
        if (legendItem) {
            if (isVisible) {
                legendItem.style.opacity = '1';
                legendItem.style.textDecoration = 'none';
            } else {
                legendItem.style.opacity = '0.4';
                legendItem.style.textDecoration = 'line-through';
            }
        }
        
        console.log(`Loading vector '${feature}' ${isVisible ? 'shown' : 'hidden'}`);
    }
    
    /**
     * Toggle visibility of loading arrows and legend
     */
    toggleLoadingArrows(visible, onToggle = null) {
        if (visible) {
            // When showing, respect individual vector visibility states
            this.loadingArrows.forEach(arrow => {
                const feature = arrow.userData.feature;
                arrow.visible = this.vectorVisibility && this.vectorVisibility[feature] !== false;
            });
        } else {
            // When hiding all, hide everything
            this.loadingArrows.forEach(arrow => {
                arrow.visible = false;
            });
        }
        
        if (this.loadingVectorLegend) {
            if (visible) {
                this.loadingVectorLegend.style.display = 'block';
                this.loadingVectorLegend.offsetHeight; // Trigger reflow
                this.loadingVectorLegend.style.opacity = '1';
            } else {
                this.loadingVectorLegend.style.opacity = '0';
                setTimeout(() => {
                    if (this.loadingVectorLegend && this.loadingVectorLegend.style.opacity === '0') {
                        this.loadingVectorLegend.style.display = 'none';
                    }
                }, 300);
            }
        }
        
        // Callback for legend repositioning
        if (onToggle) {
            onToggle(visible);
        }
        
        console.log(`Loading arrows ${visible ? 'shown' : 'hidden'}`);
        return visible;
    }
    
    /**
     * Start animation loop
     */
    startAnimation() {
        if (this.animationRunning) return;
        this.animationRunning = true;
        this.animate();
    }
    
    /**
     * Animation loop
     */
    animate() {
        if (!this.animationRunning) return;
        
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    /**
     * Stop animation loop
     */
    stopAnimation() {
        this.animationRunning = false;
    }
    
    /**
     * Reset camera to default view
     */
    resetView() {
        if (this.camera && this.controls) {
            this.camera.position.set(7, 4, 7);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }
    
    /**
     * Update dimensions based on container size
     */
    updateDimensions() {
        const container = document.getElementById(this.containerId);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
    }
    
    /**
     * Handle window resize
     */
    onWindowResize() {
        this.updateDimensions();
        
        if (this.camera) {
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
        }
        
        if (this.renderer) {
            this.renderer.setSize(this.width, this.height);
        }
    }
    
    /**
     * Update point colors
     */
    updatePointColors(colors, alphas) {
        if (!this.geometry) return;
        
        const colorAttribute = this.geometry.getAttribute('color');
        const alphaAttribute = this.geometry.getAttribute('alpha');
        
        colorAttribute.array.set(colors);
        colorAttribute.needsUpdate = true;
        
        alphaAttribute.array.set(alphas);
        alphaAttribute.needsUpdate = true;
    }
    
    // Getters
    getScene() { return this.scene; }
    getCamera() { return this.camera; }
    getRenderer() { return this.renderer; }
    getControls() { return this.controls; }
    getRaycaster() { return this.raycaster; }
    getMouse() { return this.mouse; }
    getGeometry() { return this.geometry; }
    getPoints() { return this.points; }
    getFeatureColors() { return this.featureColors; }
}
