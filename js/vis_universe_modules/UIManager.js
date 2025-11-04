/**
 * UIManager.js
 * Manages UI event listeners, genre autocomplete, and button states
 */

export class UIManager {
    constructor(sceneManager, dataManager) {
        this.sceneManager = sceneManager;
        this.dataManager = dataManager;
        
        // Callbacks
        this.onColorChangeCallback = null;
        this.onGenreFilterCallback = null;
        this.onClearGenreCallback = null;
        this.onPlayTimelineCallback = null;
        this.onPauseTimelineCallback = null;
        this.onClearBillboardCallback = null;
        this.onResetViewCallback = null;
        this.onToggleLoadingsCallback = null;
        this.onSpeedChangeCallback = null;
    }
    
    /**
     * Set callbacks for UI events
     */
    setCallbacks(callbacks) {
        this.onColorChangeCallback = callbacks.onColorChange;
        this.onGenreFilterCallback = callbacks.onGenreFilter;
        this.onClearGenreCallback = callbacks.onClearGenre;
        this.onPlayTimelineCallback = callbacks.onPlayTimeline;
        this.onPauseTimelineCallback = callbacks.onPauseTimeline;
        this.onClearBillboardCallback = callbacks.onClearBillboard;
        this.onResetViewCallback = callbacks.onResetView;
        this.onToggleLoadingsCallback = callbacks.onToggleLoadings;
        this.onSpeedChangeCallback = callbacks.onSpeedChange;
    }
    
    /**
     * Initialize all event listeners
     */
    setupEventListeners(options = {}) {
        this.setupColorDropdown();
        this.setupGenreFilter();
        this.setupBillboardControls();
        this.setupResetButton();
        this.setupPCALoadings();
        this.setupWindowResize();
        
        if (options.requireModifierForZoom) {
            this.setupModifierZoom();
        }
    }
    
    /**
     * Setup color feature dropdown
     */
    setupColorDropdown() {
        const dropdown = document.getElementById('color-feature');
        if (!dropdown) return;
        
        dropdown.addEventListener('change', () => {
            // Remove placeholder styling when a real option is selected
            if (dropdown.value !== '') {
                dropdown.classList.remove('placeholder-active');
            }
            
            // Clear billboard if callback provided
            if (this.onClearBillboardCallback) {
                this.onClearBillboardCallback();
            }
            
            // Re-enable dropdown if it was disabled
            dropdown.disabled = false;
            dropdown.style.opacity = '1';
            dropdown.style.cursor = 'pointer';
            
            // Default to 'none' if placeholder is somehow selected
            const selectedValue = dropdown.value || 'none';
            
            if (this.onColorChangeCallback) {
                this.onColorChangeCallback(selectedValue);
            }
        });
    }
    
    /**
     * Setup genre filter with autocomplete
     */
    setupGenreFilter() {
        const genreInput = document.getElementById('genre-filter');
        const genreSuggestions = document.getElementById('genre-suggestions');
        const clearButton = document.getElementById('clear-genre');
        
        if (!genreInput || !genreSuggestions) return;
        
        const allGenres = this.dataManager.getAllGenres();
        
        genreInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (searchTerm.length === 0) {
                genreSuggestions.style.display = 'none';
                return;
            }
            
            // Filter genres (already sorted by count)
            const matches = allGenres.filter(g => 
                g.genre.toLowerCase().includes(searchTerm)
            ).slice(0, 20); // Limit to 20 results
            
            if (matches.length > 0) {
                genreSuggestions.innerHTML = matches.map(g => 
                    `<div class="genre-option" data-genre="${g.genre}">
                        <span>${this.capitalizeGenre(g.genre)}</span>
                        <span class="genre-count">${g.count}</span>
                    </div>`
                ).join('');
                genreSuggestions.style.display = 'block';
                
                // Add click handlers to suggestions
                genreSuggestions.querySelectorAll('.genre-option').forEach(option => {
                    option.addEventListener('click', () => {
                        const genre = option.getAttribute('data-genre');
                        
                        // Clear billboard if callback provided
                        if (this.onClearBillboardCallback) {
                            this.onClearBillboardCallback();
                        }
                        
                        // Apply genre filter
                        if (this.onGenreFilterCallback) {
                            this.onGenreFilterCallback(genre);
                        }
                        
                        genreInput.value = this.capitalizeGenre(genre);
                        genreSuggestions.style.display = 'none';
                        
                        if (clearButton) {
                            clearButton.classList.remove('hidden');
                        }
                    });
                });
            } else {
                genreSuggestions.innerHTML = '<div class="genre-no-matches">No matches found</div>';
                genreSuggestions.style.display = 'block';
            }
        });
        
        // Clear filter button
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                genreInput.value = '';
                clearButton.classList.add('hidden');
                
                if (this.onClearGenreCallback) {
                    this.onClearGenreCallback();
                }
            });
        }
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!genreInput.contains(e.target) && !genreSuggestions.contains(e.target)) {
                genreSuggestions.style.display = 'none';
            }
        });
    }
    
    /**
     * Setup Billboard timeline controls
     */
    setupBillboardControls() {
        // Play/Pause button
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.addEventListener('click', () => {
                const isPlaying = playButton.textContent.includes('Pause');
                
                if (isPlaying && this.onPauseTimelineCallback) {
                    this.onPauseTimelineCallback();
                } else if (!isPlaying && this.onPlayTimelineCallback) {
                    this.onPlayTimelineCallback();
                }
            });
        }
        
        // Clear billboard button
        const clearBillboard = document.getElementById('clear-billboard');
        if (clearBillboard) {
            clearBillboard.addEventListener('click', () => {
                if (this.onClearBillboardCallback) {
                    this.onClearBillboardCallback();
                }
                
                // Re-enable color feature dropdown
                const dropdown = document.getElementById('color-feature');
                if (dropdown) {
                    dropdown.disabled = false;
                    dropdown.style.opacity = '1';
                    dropdown.style.cursor = 'pointer';
                }
            });
        }
        
        // Speed control buttons
        const speedButtons = document.querySelectorAll('.speed-btn');
        speedButtons.forEach(button => {
            button.addEventListener('click', () => {
                const speed = parseFloat(button.dataset.speed);
                
                // Update active state
                speedButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Notify callback (will be connected to BillboardController)
                if (this.onSpeedChangeCallback) {
                    this.onSpeedChangeCallback(speed);
                }
            });
        });
    }
    
    /**
     * Setup reset view button
     */
    setupResetButton() {
        const resetButton = document.getElementById('reset-view');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                if (this.onResetViewCallback) {
                    this.onResetViewCallback();
                }
            });
        }
    }
    
    /**
     * Setup PCA loadings checkbox
     */
    setupPCALoadings() {
        const showLoadingsCheckbox = document.getElementById('show-loadings');
        if (showLoadingsCheckbox) {
            showLoadingsCheckbox.addEventListener('change', (e) => {
                if (this.onToggleLoadingsCallback) {
                    this.onToggleLoadingsCallback(e.target.checked);
                }
            });
        }
    }
    
    /**
     * Setup window resize handler
     */
    setupWindowResize() {
        window.addEventListener('resize', () => {
            if (this.sceneManager) {
                this.sceneManager.onWindowResize();
            }
        });
    }
    
    /**
     * Setup intersection observer for PCA section
     */
    setupIntersectionObserver() {
        const pcaSection = document.getElementById('pca-loadings-section');
        const showLoadingsCheckbox = document.getElementById('show-loadings');
        
        if (!pcaSection || !showLoadingsCheckbox) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Auto-check the checkbox when section becomes visible
                    const isAlreadyChecked = showLoadingsCheckbox.checked;
                    if (!isAlreadyChecked) {
                        showLoadingsCheckbox.checked = true;
                        if (this.onToggleLoadingsCallback) {
                            this.onToggleLoadingsCallback(true);
                        }
                    }
                }
            });
        }, {
            threshold: 0.5 // Trigger when 50% of the section is visible
        });
        
        observer.observe(pcaSection);
    }
    
    /**
     * Setup modifier key requirement for zoom
     */
    setupModifierZoom() {
        const controls = this.sceneManager.getControls();
        const renderer = this.sceneManager.getRenderer();
        const camera = this.sceneManager.getCamera();
        
        if (!controls || !renderer || !camera) return;
        
        controls.enableZoom = false; // Disable default zoom
        
        renderer.domElement.addEventListener('wheel', (event) => {
            // Only zoom if Cmd (Mac) or Ctrl (Windows/Linux) is held
            if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                
                const delta = event.deltaY;
                const zoomSpeed = 0.1;
                
                // Manual zoom by adjusting camera position
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                
                if (delta < 0) {
                    // Zoom in
                    camera.position.addScaledVector(direction, zoomSpeed);
                } else {
                    // Zoom out
                    camera.position.addScaledVector(direction, -zoomSpeed);
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
}
