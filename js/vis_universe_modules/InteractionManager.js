/**
 * InteractionManager.js
 * Manages mouse interactions, tooltips, and genre filtering
 */

export class InteractionManager {
    constructor(containerId, sceneManager, dataManager) {
        this.containerId = containerId;
        this.sceneManager = sceneManager;
        this.dataManager = dataManager;
        
        // Tooltip state
        this.tooltip = null;
        this.hoveredPoint = null;
        
        // Filter state
        this.selectedGenre = null;
        this.billboardMode = false;
        this.selectedYear = null;
        this.currentWeek = null;
        
        // Callbacks
        this.onFilterChangeCallback = null;
    }
    
    /**
     * Set callback for when filter changes
     */
    setFilterChangeCallback(callback) {
        this.onFilterChangeCallback = callback;
    }
    
    /**
     * Initialize interactions
     */
    initialize() {
        this.createTooltip();
        this.setupMouseInteraction();
    }
    
    /**
     * Create tooltip element
     */
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'track-tooltip';
        document.getElementById(this.containerId).appendChild(this.tooltip);
    }
    
    /**
     * Setup mouse interaction for hover tooltips
     */
    setupMouseInteraction() {
        const renderer = this.sceneManager.getRenderer();
        const camera = this.sceneManager.getCamera();
        const raycaster = this.sceneManager.getRaycaster();
        const mouse = this.sceneManager.getMouse();
        const points = this.sceneManager.getPoints();
        
        renderer.domElement.addEventListener('mousemove', (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(points);
            
            // Find first intersected point that matches both genre and Billboard filters
            let validIntersect = null;
            for (let i = 0; i < intersects.length; i++) {
                const index = intersects[i].index;
                const track = this.dataManager.getTrackData()[index];
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
        
        renderer.domElement.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
            this.hoveredPoint = null;
        });
    }
    
    /**
     * Show tooltip with song information and feature bars
     */
    showTooltip(index, event, rect) {
        const data = this.dataManager.getTrackData()[index];
        const artistName = Array.isArray(data.artists) 
            ? data.artists.join(', ') 
            : data.artists || 'Unknown';
        
        // Check if this track is in Billboard chart
        let billboardInfo = '';
        if (this.billboardMode && this.selectedYear) {
            const rankings = this.currentWeek 
                ? this.dataManager.getBillboardRankingsUpToWeek(this.currentWeek)
                : this.dataManager.getBillboardPeakRankingsForYear(this.selectedYear);
            const peakRank = rankings.get(data.id);
            if (peakRank !== undefined) {
                const timeframe = this.currentWeek 
                    ? `Next Year from ${new Date(this.currentWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : `${this.selectedYear}`;
                billboardInfo = `
                    <div class="tooltip-peak-rank">
                        <strong>🏆 Peak Rank: #${peakRank}</strong><br>
                        <span>${timeframe}</span>
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
                <div class="tooltip-feature">
                    <div class="tooltip-feature-header">
                        <span>${feature.name}</span>
                        <span>${displayValue}</span>
                    </div>
                    <div class="tooltip-feature-bar-container">
                        <div class="tooltip-feature-bar" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        });
        
        this.tooltip.innerHTML = `
            <div class="tooltip-track-info">
                <strong>${data.name || 'Unknown'}</strong><br>
                <em>${artistName}</em>
            </div>
            ${billboardInfo}
            <hr class="tooltip-divider">
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
            ? this.dataManager.getBillboardRankingsUpToWeek(this.currentWeek)
            : this.dataManager.getBillboardPeakRankingsForYear(this.selectedYear);
        
        return rankings.has(track.id);
    }
    
    /**
     * Filter by genre
     */
    filterByGenre(genre) {
        this.selectedGenre = genre;
        
        // Notify main class that filter changed
        if (this.onFilterChangeCallback) {
            this.onFilterChangeCallback();
        }
        
        console.log(`Filtering by genre: ${genre}`);
    }
    
    /**
     * Update filter state (called by main class when billboard mode changes)
     */
    setFilterState(billboardMode, selectedYear, currentWeek) {
        this.billboardMode = billboardMode;
        this.selectedYear = selectedYear;
        this.currentWeek = currentWeek;
    }
    
    /**
     * Get current genre filter
     */
    getSelectedGenre() {
        return this.selectedGenre;
    }
    
    /**
     * Get hovered point index
     */
    getHoveredPoint() {
        return this.hoveredPoint;
    }
}
