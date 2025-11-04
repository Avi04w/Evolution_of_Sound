/**
 * DOM manipulation helper utilities
 */

/**
 * Create a DOM element with optional classes and styles
 * @param {string} tag - HTML tag name
 * @param {string|Array<string>} className - Class name(s) to add
 * @param {Object} styles - Style properties to apply
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, className = '', styles = {}) {
    const element = document.createElement(tag);
    
    if (className) {
        if (Array.isArray(className)) {
            element.classList.add(...className);
        } else if (className) {
            element.className = className;
        }
    }
    
    Object.entries(styles).forEach(([key, value]) => {
        element.style[key] = value;
    });
    
    return element;
}

/**
 * Fade in an element
 * @param {HTMLElement} element - Element to fade in
 * @param {number} duration - Duration in milliseconds
 * @returns {Promise} Resolves when animation completes
 */
export function fadeIn(element, duration = 300) {
    return new Promise(resolve => {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        setTimeout(() => {
            element.style.transition = `opacity ${duration}ms ease-in-out`;
            element.style.opacity = '1';
            
            setTimeout(resolve, duration);
        }, 10);
    });
}

/**
 * Fade out an element
 * @param {HTMLElement} element - Element to fade out
 * @param {number} duration - Duration in milliseconds
 * @returns {Promise} Resolves when animation completes
 */
export function fadeOut(element, duration = 300) {
    return new Promise(resolve => {
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        
        setTimeout(() => {
            element.style.display = 'none';
            resolve();
        }, duration);
    });
}

/**
 * Add a CSS class with optional removal after delay
 * @param {HTMLElement} element - Target element
 * @param {string} className - Class to add
 * @param {number} removeAfter - Milliseconds to wait before removing (0 = don't remove)
 */
export function addClass(element, className, removeAfter = 0) {
    element.classList.add(className);
    
    if (removeAfter > 0) {
        setTimeout(() => {
            element.classList.remove(className);
        }, removeAfter);
    }
}

/**
 * Remove a CSS class
 * @param {HTMLElement} element - Target element
 * @param {string} className - Class to remove
 */
export function removeClass(element, className) {
    element.classList.remove(className);
}

/**
 * Toggle a CSS class
 * @param {HTMLElement} element - Target element
 * @param {string} className - Class to toggle
 * @returns {boolean} True if class is now present
 */
export function toggleClass(element, className) {
    return element.classList.toggle(className);
}

/**
 * Check if element has a class
 * @param {HTMLElement} element - Target element
 * @param {string} className - Class to check
 * @returns {boolean} True if element has class
 */
export function hasClass(element, className) {
    return element.classList.contains(className);
}
