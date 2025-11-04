/**
 * BillboardController.js
 * Manages Billboard Hot 100 timeline UI and animation
 */

export class BillboardController {
    constructor(dataManager, colorManager) {
        this.dataManager = dataManager;
        this.colorManager = colorManager;
        
        // Timeline state
        this.timelineIsPlaying = false;
        this.timelineAnimationId = null;
        this.currentWeek = null;
        this.selectedYear = null;
        this.billboardMode = false;
        this.pausedWeekIndex = null; // Store exact week index when paused
        this.playbackSpeed = 1; // Default speed multiplier
        
        // Timeline metadata
        this.timelineMinYear = null;
        this.timelineMaxYear = null;
        this.timelineSortedYears = [];
        
        // Callback for external updates
        this.onUpdateCallback = null;
        this.onClearGenreCallback = null;
    }
    
    /**
     * Set callback for when timeline updates
     */
    setUpdateCallback(callback) {
        this.onUpdateCallback = callback;
    }
    
    /**
     * Set callback for clearing genre filter
     */
    setClearGenreCallback(callback) {
        this.onClearGenreCallback = callback;
    }
    
    /**
     * Initialize timeline - wrapper for backwards compatibility
     */
    populateYearDropdown() {
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
        
        const maxLen = 16;
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
        
        const availableYears = this.dataManager.getAvailableYears();
        const availableWeeks = this.dataManager.getAvailableWeeks();
        
        // Sort years ascending for timeline
        const sortedYears = [...availableYears].sort((a, b) => a - b);
        const minYear = Math.max(1980, sortedYears[0]);
        const maxYear = sortedYears[sortedYears.length - 1];
        
        const filteredYears = sortedYears.filter(year => year >= 1980);
        
        // Store timeline state
        this.timelineMinYear = minYear;
        this.timelineMaxYear = maxYear;
        this.timelineSortedYears = filteredYears;
        
        // Create tick marks
        const ticksContainer = document.getElementById('timeline-ticks');
        if (ticksContainer) {
            ticksContainer.innerHTML = '';
            
            for (let year = minYear; year <= maxYear; year++) {
                const yearStart = `${year}-01-01`;
                const weekIndex = availableWeeks.findIndex(week => week >= yearStart);
                
                if (weekIndex >= 0) {
                    const tick = document.createElement('div');
                    tick.className = 'timeline-tick';
                    
                    if (year % 5 === 0) {
                        tick.classList.add('major');
                    }
                    
                    const position = (weekIndex / (availableWeeks.length - 1)) * 100;
                    tick.style.left = `${position}%`;
                    ticksContainer.appendChild(tick);
                }
            }
        }
        
        // Calculate puck width (1 year = 52 weeks)
        const oneYearInWeeks = 52;
        const puckWidthPercent = (oneYearInWeeks / (availableWeeks.length - 1)) * 100;
        slider.style.width = `${puckWidthPercent}%`;
        
        // Create year labels - only show decades, centered on their tick positions
        labelsContainer.innerHTML = '';
        
        // Find first decade year (round up to nearest decade)
        const firstDecade = Math.ceil(minYear / 10) * 10;
        
        // Create labels for each decade
        for (let year = firstDecade; year <= maxYear; year += 10) {
            const yearStart = `${year}-01-01`;
            const weekIndex = availableWeeks.findIndex(week => week >= yearStart);
            
            if (weekIndex >= 0) {
                const label = document.createElement('div');
                // Format as '80s, '90s, etc.
                const decadeLabel = `'${year.toString().slice(2)}s`;
                label.textContent = decadeLabel;
                label.style.position = 'absolute';
                label.style.left = `${(weekIndex / (availableWeeks.length - 1)) * 100}%`;
                label.style.transform = 'translateX(-50%)';
                labelsContainer.appendChild(label);
            }
        }
        
        // Timeline interaction
        let isDragging = false;
        
        const updateSliderPosition = (clientX) => {
            const rect = track.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            const percentage = x / rect.width;
            
            let weekIndex = Math.round(percentage * (availableWeeks.length - 1));
            
            // Constrain week index
            const maxDate = new Date(availableWeeks[availableWeeks.length - 1]);
            const maxValidIndex = availableWeeks.findIndex(week => {
                const endDate = new Date(week);
                endDate.setFullYear(endDate.getFullYear() + 1);
                return endDate > maxDate;
            });
            
            if (maxValidIndex > 0) {
                weekIndex = Math.min(weekIndex, maxValidIndex - 1);
            }
            
            const week = availableWeeks[weekIndex];
            const weekDate = new Date(week);
            const year = weekDate.getFullYear();
            
            slider.style.left = `${(weekIndex / (availableWeeks.length - 1)) * 100}%`;
            
            this.currentWeek = week;
            this.pausedWeekIndex = weekIndex; // Store for pause/resume
            this.selectedYear = year;
            this.billboardMode = true;
            
            const startDate = new Date(week);
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            // Update year display
            const dateRangeEl = yearDisplay.querySelector('.date-range');
            if (dateRangeEl) {
                dateRangeEl.textContent = this.formatDateRange(startDate, endDate);
            }
            
            // Update visualization
            this.colorManager.setFilterState(null, this.billboardMode, this.selectedYear, this.currentWeek);
            this.colorManager.updateColors('none', false);
            
            // Enable clear button
            const clearButton = document.getElementById('clear-billboard');
            if (clearButton) {
                clearButton.disabled = false;
            }
            
            // Reset color dropdown
            const dropdown = document.getElementById('color-feature');
            if (dropdown) {
                dropdown.value = '';
                dropdown.classList.add('placeholder-active');
            }
            
            // Clear genre filter
            if (this.onClearGenreCallback) {
                this.onClearGenreCallback();
            }
            
            // Notify external listeners
            if (this.onUpdateCallback) {
                this.onUpdateCallback({
                    billboardMode: this.billboardMode,
                    selectedYear: this.selectedYear,
                    currentWeek: this.currentWeek
                });
            }
        };
        
        const startDrag = (e) => {
            isDragging = true;
            slider.classList.add('cursor-grabbing');
            slider.classList.remove('cursor-grab');
            this.pause();
            updateSliderPosition(e.clientX || e.touches[0].clientX);
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            updateSliderPosition(e.clientX || e.touches[0].clientX);
        };
        
        const endDrag = () => {
            isDragging = false;
            slider.classList.add('cursor-grab');
            slider.classList.remove('cursor-grabbing');
        };
        
        slider.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
        
        slider.addEventListener('touchstart', startDrag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', endDrag);
        
        track.addEventListener('click', (e) => {
            updateSliderPosition(e.clientX);
        });
        
        this.updateTimelineSliderPosition = updateSliderPosition;
    }
    
    /**
     * Play timeline animation
     */
    play() {
        if (this.timelineIsPlaying) return;
        
        this.timelineIsPlaying = true;
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.textContent = '⏸ Pause';
        }
        
        const availableWeeks = this.dataManager.getAvailableWeeks();
        
        // Calculate max valid week index
        const maxDate = new Date(availableWeeks[availableWeeks.length - 1]);
        const maxValidIndex = availableWeeks.findIndex(week => {
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            return endDate > maxDate;
        });
        const maxWeekIndex = maxValidIndex > 0 ? maxValidIndex - 1 : availableWeeks.length - 1;
        
        // Find current week index or start from beginning
        let currentWeekIndex = 0;
        
        // If we have a paused position, resume from exactly that index
        if (this.pausedWeekIndex !== null) {
            currentWeekIndex = this.pausedWeekIndex;
            this.pausedWeekIndex = null; // Clear after using
        } else if (this.selectedYear) {
            // Otherwise start from the beginning of the selected year
            const currentYearWeeks = availableWeeks.filter(week => 
                new Date(week).getFullYear() === parseInt(this.selectedYear)
            );
            if (currentYearWeeks.length > 0) {
                currentWeekIndex = availableWeeks.indexOf(currentYearWeeks[0]);
            }
        }
        
        const animateWeek = () => {
            if (!this.timelineIsPlaying) return;
            
            const week = availableWeeks[currentWeekIndex];
            const weekDate = new Date(week);
            const year = weekDate.getFullYear();
            
            this.currentWeek = week;
            this.pausedWeekIndex = currentWeekIndex; // Store for pause/resume
            this.selectedYear = year;
            this.billboardMode = true;
            
            const startDate = new Date(week);
            const endDate = new Date(week);
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            // Update year display
            const yearDisplay = document.getElementById('timeline-year-display');
            if (yearDisplay) {
                const dateRangeEl = yearDisplay.querySelector('.date-range');
                if (dateRangeEl) {
                    dateRangeEl.textContent = this.formatDateRange(startDate, endDate);
                }
            }
            
            // Update slider position
            const slider = document.getElementById('timeline-slider');
            if (slider) {
                const percentage = currentWeekIndex / (availableWeeks.length - 1);
                slider.style.left = `${percentage * 100}%`;
            }
            
            // Update visualization
            this.colorManager.setFilterState(null, this.billboardMode, this.selectedYear, this.currentWeek);
            this.colorManager.updateColors('none', false);
            
            // Enable clear button
            const clearButton = document.getElementById('clear-billboard');
            if (clearButton) {
                clearButton.disabled = false;
            }
            
            // Reset color dropdown
            const dropdown = document.getElementById('color-feature');
            if (dropdown) {
                dropdown.value = '';
                dropdown.classList.add('placeholder-active');
            }
            
            // Clear genre filter
            if (this.onClearGenreCallback) {
                this.onClearGenreCallback();
            }
            
            // Notify external listeners
            if (this.onUpdateCallback) {
                this.onUpdateCallback({
                    billboardMode: this.billboardMode,
                    selectedYear: this.selectedYear,
                    currentWeek: this.currentWeek
                });
            }
            
            currentWeekIndex++;
            
            if (currentWeekIndex > maxWeekIndex) {
                currentWeekIndex = 0;
            }
            
            // Calculate delay based on playback speed (base delay is 3ms)
            const baseDelay = 10;
            const delay = baseDelay / this.playbackSpeed;
            
            this.timelineAnimationId = setTimeout(animateWeek, delay);
        };
        
        animateWeek();
    }
    
    /**
     * Set playback speed
     */
    setPlaybackSpeed(speed) {
        this.playbackSpeed = speed;
        console.log(`Playback speed set to ${speed}×`);
        
        // If currently playing, restart with new speed
        if (this.timelineIsPlaying) {
            const wasPlaying = this.timelineIsPlaying;
            this.pause();
            if (wasPlaying) {
                // Small delay to ensure clean restart
                setTimeout(() => this.play(), 10);
            }
        }
    }
    
    /**
     * Pause timeline animation
     */
    pause() {
        this.timelineIsPlaying = false;
        
        // Store the exact week index from the current slider position
        if (this.currentWeek) {
            const availableWeeks = this.dataManager.getAvailableWeeks();
            this.pausedWeekIndex = availableWeeks.indexOf(this.currentWeek);
        }
        
        // Clear currentWeek to trigger yearly aggregate display
        this.currentWeek = null;
        
        const playButton = document.getElementById('play-timeline');
        if (playButton) {
            playButton.textContent = '▶ Play';
        }
        
        if (this.timelineAnimationId) {
            clearTimeout(this.timelineAnimationId);
            this.timelineAnimationId = null;
        }
    }
    
    /**
     * Clear Billboard mode
     */
    clear() {
        this.pause();
        
        this.billboardMode = false;
        this.selectedYear = null;
        this.currentWeek = null;
        this.pausedWeekIndex = null;
        
        // Disable clear button
        const clearButton = document.getElementById('clear-billboard');
        if (clearButton) {
            clearButton.disabled = true;
        }
        
        // Reset timeline display
        const yearDisplay = document.getElementById('timeline-year-display');
        if (yearDisplay) {
            const dateRangeEl = yearDisplay.querySelector('.date-range');
            if (dateRangeEl) dateRangeEl.textContent = 'No year selected';
        }
        
        // Reset slider
        const slider = document.getElementById('timeline-slider');
        if (slider) {
            slider.style.left = '0%';
        }
        
        // Reset color manager state
        this.colorManager.setFilterState(null, false, null, null);
        
        // Notify external listeners
        if (this.onUpdateCallback) {
            this.onUpdateCallback({
                billboardMode: false,
                selectedYear: null,
                currentWeek: null
            });
        }
    }
    
    // Getters
    isPlaying() { return this.timelineIsPlaying; }
    getCurrentWeek() { return this.currentWeek; }
    getSelectedYear() { return this.selectedYear; }
    isBillboardMode() { return this.billboardMode; }
    
    // Backwards compatibility aliases
    playTimeline() { this.play(); }
    pauseTimeline() { this.pause(); }
}
