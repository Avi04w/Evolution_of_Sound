console.log('Three.js script loaded');

// Import utilities and managers
import { VIRIDIS_COLORS, AUDIO_FEATURES, interpolateViridis, rgbToThreeColor } from './vis_universe_modules/utils/ColorScales.js';
import { DataManager } from './vis_universe_modules/DataManager.js';
import { SceneManager } from './vis_universe_modules/SceneManager.js';
import { ColorManager } from './vis_universe_modules/ColorManager.js';
import { BillboardController } from './vis_universe_modules/BillboardController.js';
import { InteractionManager } from './vis_universe_modules/InteractionManager.js';
import { UIManager } from './vis_universe_modules/UIManager.js';

/**
 * MusicUniverseVisualization - 3D visualization of music features using Three.js
 * Displays songs as points in a PCA-reduced 3D space with interactive color encoding
 */
class MusicUniverseVisualization {
    // Static constants (keeping for backwards compatibility)
    static VIRIDIS_COLORS = VIRIDIS_COLORS;
    static AUDIO_FEATURES = AUDIO_FEATURES;

    constructor(containerId, dataUrl, options = {}) {
        this.containerId = containerId;
        this.dataUrl = dataUrl;
        this.options = {
            showBorder: true,
            requireModifierForZoom: false,
            ...options
        };
        
        // Initialize managers
        this.dataManager = new DataManager(dataUrl);
        this.sceneManager = new SceneManager(containerId, options);
        // ColorManager, BillboardController, InteractionManager, and UIManager will be initialized after DataManager loads data
        this.colorManager = null;
        this.billboardController = null;
        this.interactionManager = null;
        this.uiManager = null;
        
        // Three.js components (delegated to SceneManager, but keep references for compatibility)
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.geometry = null;
        
        // Data and state (delegated to DataManager, but keep references for compatibility)
        this.parsedData = [];
        this.currentColorFeature = 'none';
        this.animationFrameId = null;
        this.allGenres = [];
        this.selectedGenre = null;
        
        // Billboard data (delegated to DataManager, but keep references for compatibility)
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
        
        // PCA Loading Vectors (delegated to DataManager, but keep reference for compatibility)
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
            // Load all data through DataManager
            await this.dataManager.loadAllData();
            
            // Sync data to this instance for backwards compatibility
            this.parsedData = this.dataManager.getTrackData();
            this.allGenres = this.dataManager.getAllGenres();
            this.billboardData = this.dataManager.billboardData;
            this.availableYears = this.dataManager.getAvailableYears();
            this.availableWeeks = this.dataManager.getAvailableWeeks();
            this.loadingVectors = this.dataManager.getPCALoadings();
            
            // Initialize scene through SceneManager
            this.sceneManager.initialize();
            this.sceneManager.createPointCloud(this.parsedData);
            this.sceneManager.createLoadingArrows(this.loadingVectors);
            this.sceneManager.createLoadingVectorLegend();
            
            // Sync scene objects for backwards compatibility
            this.scene = this.sceneManager.getScene();
            this.camera = this.sceneManager.getCamera();
            this.renderer = this.sceneManager.getRenderer();
            this.controls = this.sceneManager.getControls();
            this.geometry = this.sceneManager.getGeometry();
            this.points = this.sceneManager.getPoints();
            this.raycaster = this.sceneManager.getRaycaster();
            this.mouse = this.sceneManager.getMouse();
            
            // Initialize ColorManager
            this.colorManager = new ColorManager(this.containerId, this.sceneManager, this.dataManager);
            
            // Initialize BillboardController
            this.billboardController = new BillboardController(this.dataManager, this.colorManager);
            this.billboardController.setUpdateCallback((state) => {
                this.billboardMode = state.billboardMode;
                this.selectedYear = state.selectedYear;
                this.currentWeek = state.currentWeek;
                
                // Update InteractionManager filter state
                if (this.interactionManager) {
                    this.interactionManager.setFilterState(state.billboardMode, state.selectedYear, state.currentWeek);
                }
            });
            this.billboardController.setClearGenreCallback(() => {
                const genreInput = document.getElementById('genre-filter');
                if (genreInput && genreInput.value) {
                    genreInput.value = '';
                    if (this.interactionManager) {
                        this.interactionManager.filterByGenre('');
                    }
                }
                const clearGenreButton = document.getElementById('clear-genre');
                if (clearGenreButton) {
                    clearGenreButton.classList.add('hidden');
                }
            });
            
            // Initialize InteractionManager
            this.interactionManager = new InteractionManager(this.containerId, this.sceneManager, this.dataManager);
            this.interactionManager.initialize();
            this.interactionManager.setFilterChangeCallback(() => {
                this.updateColors(this.currentColorFeature, true);
            });
            
            // Sync state from InteractionManager for backwards compatibility
            this.tooltip = this.interactionManager.tooltip;
            this.hoveredPoint = null; // Will be read from interactionManager when needed
            
            // Create timeline UI
            this.createTimeline();
            
            // Set initial colors
            this.colorManager.updateColors('none', false);
            
            // Start animation
            this.sceneManager.startAnimation();
            
            // Initialize UIManager
            this.uiManager = new UIManager(this.sceneManager, this.dataManager);
            this.uiManager.setCallbacks({
                onColorChange: (feature) => this.updateColors(feature, true),
                onGenreFilter: (genre) => this.filterByGenre(genre),
                onClearGenre: () => {
                    if (this.interactionManager) {
                        this.interactionManager.filterByGenre('');
                    }
                },
                onPlayTimeline: () => this.playTimeline(),
                onPauseTimeline: () => this.pauseTimeline(),
                onClearBillboard: () => {
                    if (this.billboardController) {
                        this.billboardController.clear();
                        this.updateColors(this.currentColorFeature, true);
                    }
                },
                onResetView: () => this.resetView(),
                onToggleLoadings: (visible) => this.toggleLoadingArrows(visible),
                onSpeedChange: (speed) => {
                    if (this.billboardController) {
                        this.billboardController.setPlaybackSpeed(speed);
                    }
                }
            });
            this.uiManager.setupEventListeners(this.options);
            this.uiManager.setupIntersectionObserver();
            
            console.log('Three.js visualization ready');
        } catch (error) {
            console.error('Error initializing visualization:', error);
        }
    }

    /**
     * ========================================
     * BILLBOARD CONTROLLER ORCHESTRATION
     * Methods that delegate to BillboardController
     * ========================================
     */
    
    /**
     * Populate year dropdown for Billboard timeline
     * Delegated to BillboardController
     */
    populateYearDropdown() {
        if (this.billboardController) {
            this.billboardController.populateYearDropdown();
        }
    }
    
    /**
     * Format date range for display
     * Delegated to BillboardController
     */
    formatDateRange(startDate, endDate) {
        if (this.billboardController) {
            return this.billboardController.formatDateRange(startDate, endDate);
        }
        return '';
    }
    
    /**
     * Create Billboard timeline UI
     * Delegated to BillboardController
     */
    createTimeline() {
        if (this.billboardController) {
            this.billboardController.createTimeline();
            // Sync state for backwards compatibility
            this.timelineMinYear = this.billboardController.timelineMinYear;
            this.timelineMaxYear = this.billboardController.timelineMaxYear;
            this.timelineSortedYears = this.billboardController.timelineSortedYears;
        }
    }
    
    /**
     * Start Billboard timeline animation
     * Delegated to BillboardController
     */
    playTimeline() {
        if (this.billboardController) {
            this.billboardController.play();
            this.timelineIsPlaying = this.billboardController.isPlaying();
        }
    }
    
    /**
     * Pause Billboard timeline animation
     * Delegated to BillboardController
     */
    pauseTimeline() {
        if (this.billboardController) {
            this.billboardController.pause();
            this.timelineIsPlaying = this.billboardController.isPlaying();
            this.currentWeek = this.billboardController.getCurrentWeek();
        }
    }
    
    /**
     * ========================================
     * DATA MANAGER ORCHESTRATION
     * Billboard query methods delegated to DataManager
     * ========================================
     */
    
    /**
     * Get Billboard peak rankings for a specific year
     * Delegated to DataManager
     */
    getBillboardPeakRankingsForYear(year) {
        return this.dataManager.getBillboardPeakRankingsForYear(year);
    }
    
    /**
     * Get Billboard rankings up to a specific week
     * Delegated to DataManager
     */
    getBillboardRankingsUpToWeek(targetWeek) {
        return this.dataManager.getBillboardRankingsUpToWeek(targetWeek);
    }
    
    /**
     * ========================================
     * SCENE MANAGER ORCHESTRATION
     * Methods that delegate to SceneManager
     * ========================================
     */
    
    /**
     * Toggle visibility of PCA loading vector arrows
     * Orchestrates between SceneManager and ColorManager
     */
    toggleLoadingArrows(visible) {
        this.showLoadings = visible;
        this.colorManager.setLoadingVisibility(visible);
        
        const wasVisible = this.sceneManager.toggleLoadingArrows(visible, (isVisible) => {
            // Recreate color legend with new size if it's visible
            const colorLegend = document.getElementById('color-legend');
            if (colorLegend && colorLegend.style.display !== 'none') {
                d3.select('#color-legend').remove();
                if (this.billboardMode && this.selectedYear) {
                    this.colorManager.createBillboardLegend(false);
                } else if (this.currentColorFeature !== 'none') {
                    this.colorManager.createLegend(this.currentColorFeature, false);
                }
            }
        });
        
        return wasVisible;
    }

    /**
     * Reposition right-side legends (color legend and PCA loadings legend)
     * Delegated to ColorManager
     */
    repositionRightLegends() {
        if (this.colorManager) {
            this.colorManager.repositionRightLegends();
        }
    }

    /**
     * ========================================
     * COLOR MANAGER ORCHESTRATION
     * Methods that delegate to ColorManager
     * ========================================
     */
    
    /**
     * Animate color transition between two color states
     * Delegated to ColorManager
     */
    animateColorTransition(fromColors, toColors, fromAlphas, toAlphas, duration = 500) {
        if (this.colorManager) {
            this.colorManager.animateColorTransition(fromColors, toColors, fromAlphas, toAlphas, duration);
        }
    }
    
    /**
     * Update point colors based on selected feature or Billboard mode
     * Orchestrates between ColorManager and InteractionManager for filtering
     */
    updateColors(feature, animate = true) {
        if (this.colorManager) {
            const selectedGenre = this.interactionManager ? this.interactionManager.getSelectedGenre() : null;
            this.colorManager.setFilterState(selectedGenre, this.billboardMode, this.selectedYear, this.currentWeek);
            this.colorManager.updateColors(feature, animate);
            this.currentColorFeature = feature;
        }
    }

    /**
     * Get color RGB values from viridis scale
     * Delegated to ColorManager
     */
    getColorFromScale(value) {
        if (this.colorManager) {
            return this.colorManager.getColorFromScale(value);
        }
        return [0.5, 0.5, 0.5];
    }

    /**
     * Normalize feature values to 0-1 range
     * Delegated to ColorManager
     */
    normalizeFeature(values) {
        if (this.colorManager) {
            return this.colorManager.normalizeFeature(values);
        }
        return values;
    }

    /**
     * Create color legend for audio features
     * Delegated to ColorManager
     */
    createLegend(feature, animate = true) {
        if (this.colorManager) {
            this.colorManager.createLegend(feature, animate);
        }
    }

    /**
     * Create Billboard ranking legend
     * Delegated to ColorManager
     */
    createBillboardLegend(animate = true) {
        if (this.colorManager) {
            this.colorManager.createBillboardLegend(animate);
        }
    }

    /**
     * Update canvas dimensions
     * Delegated to SceneManager
     */
    updateDimensions() {
        if (this.sceneManager) {
            this.sceneManager.updateDimensions();
            this.width = this.sceneManager.width;
            this.height = this.sceneManager.height;
        }
    }

    /**
     * Handle window resize event
     * Delegated to SceneManager
     */
    onWindowResize() {
        if (this.sceneManager) {
            this.sceneManager.onWindowResize();
            this.width = this.sceneManager.width;
            this.height = this.sceneManager.height;
        }
    }

    /**
     * Reset camera to home position with animation
     * Orchestrates the camera reset animation using SceneManager components
     */
    resetView() {
        // Animate camera back to home position
        const startPosition = this.sceneManager.camera.position.clone();
        const targetPosition = new THREE.Vector3(7, 4, 7);
        const startTarget = this.sceneManager.controls.target.clone();
        const targetTarget = new THREE.Vector3(0, 0, 0);
        
        const duration = 1000; // 1 second
        const startTime = performance.now();
        
        const animateReset = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate camera position
            this.sceneManager.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            // Interpolate controls target
            this.sceneManager.controls.target.lerpVectors(startTarget, targetTarget, eased);
            
            if (progress < 1) {
                requestAnimationFrame(animateReset);
            }
        };
        
        requestAnimationFrame(animateReset);
    }
    
    /**
     * ========================================
     * INTERACTION MANAGER ORCHESTRATION
     * Methods that delegate to InteractionManager
     * ========================================
     */
    
    /**
     * Filter visualization by genre
     * Delegated to InteractionManager
     */
    filterByGenre(genre) {
        if (this.interactionManager) {
            this.interactionManager.filterByGenre(genre);
        }
        // Filter change callback will trigger updateColors
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
