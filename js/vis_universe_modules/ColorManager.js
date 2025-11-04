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
     * Update point colors based on feature or Billboard mode
     */
    updateColors(feature, animate = true) {
        const trackData = this.dataManager.getTrackData();
        const geometry = this.sceneManager.getGeometry();
        if (!geometry) return;
        
        const colorAttribute = geometry.getAttribute('color');
        const alphaAttribute = geometry.getAttribute('alpha');
        const oldColors = new Float32Array(colorAttribute.array);
        const oldAlphas = new Float32Array(alphaAttribute.array);
        
        const newColors = new Float32Array(trackData.length * 3);
        const newAlphas = new Float32Array(trackData.length);
        
        // Check if we're in Billboard mode
        if (this.billboardMode && this.selectedYear) {
            const rankings = this.currentWeek 
                ? this.dataManager.getBillboardRankingsUpToWeek(this.currentWeek)
                : this.dataManager.getBillboardPeakRankingsForYear(this.selectedYear);
            
            for (let i = 0; i < trackData.length; i++) {
                const track = trackData[i];
                const peakRank = rankings.get(track.id);
                
                if (peakRank !== undefined) {
                    const normalizedRank = (100 - peakRank) / 99;
                    const color = this.getColorFromScale(normalizedRank);
                    newColors[i * 3] = color[0];
                    newColors[i * 3 + 1] = color[1];
                    newColors[i * 3 + 2] = color[2];
                    newAlphas[i] = 0.9;
                } else {
                    newColors[i * 3] = 0.3;
                    newColors[i * 3 + 1] = 0.3;
                    newColors[i * 3 + 2] = 0.3;
                    newAlphas[i] = 0.25;
                }
            }
        } else if (feature === 'none') {
            for (let i = 0; i < trackData.length; i++) {
                const matches = this.trackMatchesGenre(trackData[i]);
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
            const featureValues = trackData.map(d => d[feature] || 0);
            const normalized = this.normalizeFeature(featureValues);
            
            normalized.forEach((value, i) => {
                const matches = this.trackMatchesGenre(trackData[i]);
                
                if (matches) {
                    const color = this.getColorFromScale(value);
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
        if (this.billboardMode && this.selectedYear) {
            d3.select('#color-legend').style('display', 'block');
            this.createBillboardLegend();
        } else if (feature === 'none') {
            d3.select('#color-legend').style('display', 'none');
        } else {
            d3.select('#color-legend').style('display', 'block');
            this.createLegend(feature);
        }
        
        console.log(`Updated colors to ${this.billboardMode ? 'Billboard peak rankings' : feature}`);
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
            
            // Interpolate colors
            for (let i = 0; i < trackData.length; i++) {
                colorAttribute.array[i * 3] = fromColors[i * 3] + (toColors[i * 3] - fromColors[i * 3]) * easedProgress;
                colorAttribute.array[i * 3 + 1] = fromColors[i * 3 + 1] + (toColors[i * 3 + 1] - fromColors[i * 3 + 1]) * easedProgress;
                colorAttribute.array[i * 3 + 2] = fromColors[i * 3 + 2] + (toColors[i * 3 + 2] - fromColors[i * 3 + 2]) * easedProgress;
                
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
     * Get color from Viridis scale
     */
    getColorFromScale(value) {
        return interpolateViridis(value, VIRIDIS_COLORS);
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
     * Check if track matches selected genre
     */
    trackMatchesGenre(track) {
        if (!this.selectedGenre) return true;
        if (!track.genres) return false;
        
        const genres = Array.isArray(track.genres) ? track.genres : [track.genres];
        return genres.some(genre => genre && genre.trim() === this.selectedGenre);
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
        // Color legend is now fixed at top: 20px
        // Loading vector legend is fixed at bottom: 20px via CSS
        // No dynamic repositioning needed
    }
    
    // Getters
    getCurrentColorFeature() { return this.currentColorFeature; }
}
