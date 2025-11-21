/**
 * ColorManager.js
 * Manages color encoding, legends, and color transitions
 */

import { VIRIDIS_COLORS, interpolateViridis } from './utils/ColorScales.js';

export class ColorManager {
    constructor(containerId, sceneManager, dataManager) {
        this.containerId = containerId;
        this.sceneManager = sceneManager;
        this.dataManager = dataManager;
        
        // State
        this.currentColorFeature = 'none';
        this.animationFrameId = null;
        this.showLoadings = false;
        
        // For filtering
        this.selectedGenre = null;
        this.billboardMode = false;
        this.selectedYear = null;
        this.currentWeek = null;
        
        // Feature-specific color scales matching DNA visualization
        this.featureColorScales = {
            energy: { start: [0.737, 1.0, 0.769], end: [0.114, 0.306, 0.0] },       // #bcffc4 to #1d4e00
            tempo: { start: [1.0, 0.784, 0.784], end: [0.467, 0.0, 0.0] },          // #ffc8c8 to #770000
            acousticness: { start: [0.835, 0.914, 1.0], end: [0.004, 0.169, 0.259] }, // #d5e9ff to #012b42
            valence: { start: [0.0, 0.322, 0.514], end: [0.871, 0.843, 0.0] },      // #005283 to #ded700
            danceability: { start: [1.0, 0.780, 0.871], end: [0.137, 0.016, 0.396] }, // #ffc7de to #230465
            speechiness: { start: [1.0, 0.914, 0.714], end: [0.416, 0.298, 0.0] },  // #ffe9b6 to #6a4c00
            loudness: { start: [0.729, 1.0, 0.961], end: [0.0, 0.486, 0.400] }      // #bafff5 to #007c66
        };
    }
    
    /**
     * Set filter state
     */
    setFilterState(selectedGenre, billboardMode, selectedYear, currentWeek) {
        this.selectedGenre = selectedGenre;
        this.billboardMode = billboardMode;
        this.selectedYear = selectedYear;
        this.currentWeek = currentWeek;
    }
    
    /**
     * Set loading vector visibility state
     */
    setLoadingVisibility(visible) {
        this.showLoadings = visible;
    }
    
    /**
     * Update point colors based on feature (Billboard mode only affects filtering, not colors)
     */
    updateColors(feature, animate = true) {
        const trackData = this.dataManager.getTrackData();
        const geometry = this.sceneManager.getGeometry();
        if (!geometry) return;
        
        // Cancel any ongoing animation first
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        const colorAttribute = geometry.getAttribute('color');
        const alphaAttribute = geometry.getAttribute('alpha');
        
        // Copy and clamp current colors to ensure they're in valid range
        const oldColors = new Float32Array(trackData.length * 3);
        const oldAlphas = new Float32Array(trackData.length);
        for (let i = 0; i < trackData.length; i++) {
            oldColors[i * 3] = Math.max(0, Math.min(1, colorAttribute.array[i * 3]));
            oldColors[i * 3 + 1] = Math.max(0, Math.min(1, colorAttribute.array[i * 3 + 1]));
            oldColors[i * 3 + 2] = Math.max(0, Math.min(1, colorAttribute.array[i * 3 + 2]));
            oldAlphas[i] = Math.max(0, Math.min(1, alphaAttribute.array[i]));
        }
        
        const newColors = new Float32Array(trackData.length * 3);
        const newAlphas = new Float32Array(trackData.length);
        
        // Determine which tracks match Billboard filter (if active)
        let billboardTracks = null;
        if (this.billboardMode && this.selectedYear) {
            billboardTracks = this.currentWeek 
                ? this.dataManager.getBillboardRankingsUpToWeek(this.currentWeek)
                : this.dataManager.getBillboardPeakRankingsForYear(this.selectedYear);
        }
        
        if (feature === 'none') {
            // No feature selected - use neutral gray
            for (let i = 0; i < trackData.length; i++) {
                const track = trackData[i];
                const matchesGenre = this.trackMatchesGenre(track);
                const matchesBillboard = !billboardTracks || billboardTracks.has(track.id);
                const matches = matchesGenre && matchesBillboard;
                
                if (matches) {
                    newColors[i * 3] = 0.5;
                    newColors[i * 3 + 1] = 0.5;
                    newColors[i * 3 + 2] = 0.5;
                    newAlphas[i] = 0.7;
                } else {
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.25;
                }
            }
        } else {
            // Feature selected - use feature-based colors
            const featureValues = trackData.map(d => d[feature] || 0);
            const normalized = this.normalizeFeature(featureValues);
            
            normalized.forEach((value, i) => {
                const track = trackData[i];
                const matchesGenre = this.trackMatchesGenre(track);
                const matchesBillboard = !billboardTracks || billboardTracks.has(track.id);
                const matches = matchesGenre && matchesBillboard;
                
                if (matches) {
                    const color = this.getColorFromScale(value, feature);
                    newColors[i * 3] = color[0];
                    newColors[i * 3 + 1] = color[1];
                    newColors[i * 3 + 2] = color[2];
                    newAlphas[i] = 0.8;
                } else {
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.25;
                }
            });
        }
        
        if (animate) {
            this.animateColorTransition(oldColors, newColors, oldAlphas, newAlphas);
        } else {
            this.sceneManager.updatePointColors(newColors, newAlphas);
        }
        
        this.currentColorFeature = feature;
        
        // Update legend display
        if (feature === 'none') {
            d3.select('#color-legend').style('display', 'none');
        } else {
            d3.select('#color-legend').style('display', 'block');
            this.createLegend(feature);
        }
        
        const modeDesc = this.billboardMode ? 'Billboard filtered' : 'all tracks';
        console.log(`Updated colors to ${feature} (${modeDesc})`);
    }
    
    /**
     * Animate color transition
     */
    animateColorTransition(fromColors, toColors, fromAlphas, toAlphas, duration = 500) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const startTime = performance.now();
        const geometry = this.sceneManager.getGeometry();
        const colorAttribute = geometry.getAttribute('color');
        const alphaAttribute = geometry.getAttribute('alpha');
        const trackData = this.dataManager.getTrackData();
        
        const updateFrame = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Cubic easing
            const easedProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Interpolate colors with clamping to ensure valid range
            for (let i = 0; i < trackData.length; i++) {
                const r = fromColors[i * 3] + (toColors[i * 3] - fromColors[i * 3]) * easedProgress;
                const g = fromColors[i * 3 + 1] + (toColors[i * 3 + 1] - fromColors[i * 3 + 1]) * easedProgress;
                const b = fromColors[i * 3 + 2] + (toColors[i * 3 + 2] - fromColors[i * 3 + 2]) * easedProgress;
                const a = fromAlphas[i] + (toAlphas[i] - fromAlphas[i]) * easedProgress;
                
                colorAttribute.array[i * 3] = Math.max(0, Math.min(1, r));
                colorAttribute.array[i * 3 + 1] = Math.max(0, Math.min(1, g));
                colorAttribute.array[i * 3 + 2] = Math.max(0, Math.min(1, b));
                alphaAttribute.array[i] = Math.max(0, Math.min(1, a));
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
     * Get color from scale (feature-specific colors)
     */
    getColorFromScale(value, feature) {
        // Use feature-specific color scale if available
        if (feature && this.featureColorScales[feature]) {
            const scale = this.featureColorScales[feature];
            const start = scale.start;
            const end = scale.end;
            
            return [
                start[0] + (end[0] - start[0]) * value,
                start[1] + (end[1] - start[1]) * value,
                start[2] + (end[2] - start[2]) * value
            ];
        }
        
        // Fallback to neutral gray if no feature specified
        return [0.5, 0.5, 0.5];
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
     * Check if track matches selected supergenre
     */
    trackMatchesGenre(track) {
        if (!this.selectedGenre) return true;
        
        // Get the track's supergenre using DataManager
        const trackSupergenre = this.dataManager.getSuperGenre(track);
        return trackSupergenre === this.selectedGenre;
    }
    
    /**
     * Create color legend with D3
     */
    createLegend(feature, animate = true) {
        const trackData = this.dataManager.getTrackData();
        const featureValues = trackData.map(d => d[feature] || 0);
        
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
        const legendHeight = 175;
        const legendMargin = { top: 40, right: 30, bottom: 40 };
        
        let svg = d3.select('#color-legend');
        let g, axisGroup, titleText;
        
        if (svg.empty()) {
            const shadowPadding = 10;
            svg = container.append('svg')
                .attr('id', 'color-legend')
                .style('position', 'absolute')
                .style('right', '20px')
                .style('top', '20px')
                .attr('width', legendWidth + legendMargin.right + 60 + shadowPadding * 2)
                .attr('height', legendHeight + legendMargin.top + legendMargin.bottom + shadowPadding * 2)
                .style('overflow', 'visible');
            
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
            
            // Create gradient for feature-specific colors
            const featureGradient = defs.append('linearGradient')
                .attr('id', 'feature-gradient')
                .attr('x1', '0%')
                .attr('y1', '100%')
                .attr('x2', '0%')
                .attr('y2', '0%');
            
            // Create gradient for Viridis (Billboard)
            const viridisGradient = defs.append('linearGradient')
                .attr('id', 'viridis-gradient')
                .attr('x1', '0%')
                .attr('y1', '100%')
                .attr('x2', '0%')
                .attr('y2', '0%');
            
            VIRIDIS_COLORS.forEach((color, i) => {
                viridisGradient.append('stop')
                    .attr('offset', `${(i / (VIRIDIS_COLORS.length - 1)) * 100}%`)
                    .attr('stop-color', `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`);
            });
            
            g.append('rect')
                .attr('class', 'legend-rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .style('fill', 'url(#feature-gradient)')
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
        
        // Update gradient for the current feature
        const featureGradient = svg.select('#feature-gradient');
        featureGradient.selectAll('stop').remove();
        
        if (this.featureColorScales[feature]) {
            const scale = this.featureColorScales[feature];
            const stops = 10;
            for (let i = 0; i <= stops; i++) {
                const t = i / stops;
                const color = this.getColorFromScale(t, feature);
                featureGradient.append('stop')
                    .attr('offset', `${t * 100}%`)
                    .attr('stop-color', `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`);
            }
        }
        
        // Update the legend rect to use the feature gradient
        const legendRect = g.select('.legend-rect');
        if (!legendRect.empty()) {
            legendRect.style('fill', 'url(#feature-gradient)');
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
        const legendHeight = 175;
        const legendMargin = { top: 40, right: 30, bottom: 40 };
        
        let svg = d3.select('#color-legend');
        let g, axisGroup, titleText;
        
        if (svg.empty()) {
            const shadowPadding = 10;
            svg = container.append('svg')
                .attr('id', 'color-legend')
                .style('position', 'absolute')
                .style('right', '20px')
                .style('top', '20px')
                .attr('width', legendWidth + legendMargin.right + 60 + shadowPadding * 2)
                .attr('height', legendHeight + legendMargin.top + legendMargin.bottom + shadowPadding * 2)
                .style('overflow', 'visible');
            
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
            
            VIRIDIS_COLORS.forEach((color, i) => {
                gradient.append('stop')
                    .attr('offset', `${(i / (VIRIDIS_COLORS.length - 1)) * 100}%`)
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
        
        // Switch to Viridis gradient for Billboard
        const legendRect = g.select('.legend-rect');
        if (!legendRect.empty()) {
            legendRect.style('fill', 'url(#viridis-gradient)');
        }
        
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
     * Reposition right-side legends (no longer needed - legends have fixed positions)
     * Kept for backwards compatibility
     */
    repositionRightLegends() {
        // Position loading vector legend below the color legend
        const colorLegend = document.getElementById('color-legend');
        const loadingLegend = document.getElementById('loading-vector-legend');
        
        if (colorLegend && loadingLegend) {
            const colorLegendRect = colorLegend.getBoundingClientRect();
            const containerRect = document.getElementById(this.containerId).getBoundingClientRect();
            
            // Calculate position: color legend bottom + gap (10px)
            const topPosition = (colorLegendRect.bottom - containerRect.top) + 10;
            loadingLegend.style.top = `${topPosition}px`;
        }
    }
    
    // Getters
    getCurrentColorFeature() { return this.currentColorFeature; }
}
