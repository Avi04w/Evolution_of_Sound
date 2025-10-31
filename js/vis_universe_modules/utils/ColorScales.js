/**
 * Color scale utilities for visualization
 */

/**
 * Viridis color scale - perceptually uniform colormap
 * Each entry is [R, G, B] in range [0, 1]
 */
export const VIRIDIS_COLORS = [
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

/**
 * Audio features that can be used for color encoding
 */
export const AUDIO_FEATURES = [
    'danceability', 
    'energy', 
    'key', 
    'loudness', 
    'mode', 
    'speechiness', 
    'acousticness', 
    'instrumentalness', 
    'liveness', 
    'valence'
];

/**
 * Interpolate between colors in the Viridis scale
 * @param {number} t - Value between 0 and 1
 * @param {Array<Array<number>>} colors - Array of RGB color arrays
 * @returns {Array<number>} Interpolated [R, G, B] color
 */
export function interpolateViridis(t, colors = VIRIDIS_COLORS) {
    const clampedT = Math.max(0, Math.min(1, t));
    const scaledT = clampedT * (colors.length - 1);
    const lowerIndex = Math.floor(scaledT);
    const upperIndex = Math.min(lowerIndex + 1, colors.length - 1);
    const fraction = scaledT - lowerIndex;

    const lower = colors[lowerIndex];
    const upper = colors[upperIndex];

    return [
        lower[0] + (upper[0] - lower[0]) * fraction,
        lower[1] + (upper[1] - lower[1]) * fraction,
        lower[2] + (upper[2] - lower[2]) * fraction
    ];
}

/**
 * Convert RGB array to hex color
 * @param {Array<number>} rgb - [R, G, B] in range [0, 1]
 * @returns {string} Hex color string (e.g., "#FF5733")
 */
export function rgbToHex(rgb) {
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert RGB array to THREE.Color
 * @param {Array<number>} rgb - [R, G, B] in range [0, 1]
 * @returns {number} Color as integer for THREE.js
 */
export function rgbToThreeColor(rgb) {
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    return (r << 16) | (g << 8) | b;
}
