// Provide detailed explanations for each audio feature and expose a global `feature` variable
var featureDescriptions = {
  danceability: "Measures how suitable a track is for dancing based on tempo, rhythm stability, and beat clarity.",
  energy: "Measures the overall intensity of a track, with higher values corresponding to louder, faster, and more active music.",
  loudness: "The average volume of a track measured in decibels (dB).",
  speechiness: "Measures how much spoken content is present in a track, with higher values indicating more speech-like audio.",
  acousticness: "Measures how strongly a track relies on natural, non-electronic sound sources, with higher values indicating minimal electronic production or synthesized elements.",
  valence: "Indicates how positive or negative a track sounds emotionally, with higher values sounding more upbeat.",
  tempo: "The speed of a track measured in beats per minute (BPM)."
};

// Expose a global feature variable and sync it with the dropdown selection.
// Default to 'energy' (this can be changed if you prefer a different initial feature).
var feature = 'acousticness';
const GEO_EMBED_SELECTOR = ".geographical-embed";

const featureOrder = ['acousticness','danceability','energy','loudness','speechiness','tempo','valence'];

function updateFeatureDescription(selected) {
  const descEl = document.getElementById('feature-description');
  if (!descEl) return;
  const sel = selected || window.feature || 'acousticness';
  let html = '<div class="feature-list"><dl>';
  featureOrder.forEach((key) => {
      const title = key.charAt(0).toUpperCase() + key.slice(1);
      const body = featureDescriptions[key] || 'No description available.';
      const cls = (key === sel) ? 'selected-feature' : '';
      html += `<dt class="${cls}"><strong>${title}: </strong>${body}</dt>`;
  });
  html += '</dl></div>';
  descEl.innerHTML = html;
}

// When the DOM is ready, wire up the selector and set the initial description.
document.addEventListener('DOMContentLoaded', function() {
  const persistentSelect = document.getElementById('persistent-feature-select');
  if (persistentSelect) {
      // initialize persistent selector to current global feature
      persistentSelect.value = window.feature || 'acousticness';
      // when changed, delegate to existing setGlobalFeature (which also updates descriptions)
      persistentSelect.addEventListener('change', (e) => {
          setGlobalFeature(e.target.value);
          // ensure description highlighting is immediately applied (setGlobalFeature calls updateFeatureDescription,
          // but call again to be safe if overwritten elsewhere)
          updateFeatureDescription(e.target.value);
      });
  }

  // ensure initial rendered description highlights the default
  updateFeatureDescription(window.feature || 'acousticness');
});


// Initialize the DNA visualization using the (now-defined) feature variable.
// The VisDNA instance is created after this script block below in the original file — keep that timing.

// expose the instance on window so other scripts (like the top-level feature selector) can call methods on it
window.dnaVis = new VisDNA("#vis-dna", { height: 360, feature: feature});
// start is optional; VisDNA will begin animating after data loads. Keep optional start call for compatibility.
window.dnaVis.start?.();


function setGlobalFeature(f) {
  // 1. update global variable
  window.feature = f;

  // 2. sync all dropdowns
  const top = document.getElementById("feature-select");
  const titleSpan = document.getElementById("feature-timeline-title");
  const dna = document.getElementById("visdna-feature-select");

  if (top) top.value = f;
  if (titleSpan) titleSpan.textContent = f.charAt(0).toUpperCase() + f.slice(1);
  if (dna) dna.value = f;

  // 3. update feature descriptions in main text
  if (typeof updateFeatureDescription === "function") {
      updateFeatureDescription(f);
  }

  // 4. update the timeline
  if (window.featureTimeline) {
      window.featureTimeline.setFeature(f);
  }

  // 5. update the DNA helix
  if (window.dnaVis) {
      window.dnaVis.feature = f;
      window.dnaVis.setColorScales();
      window.dnaVis.updateLegend();
      window.dnaVis.updateDescription();
  }

  // 6. update the title label text
  // Keep the chart title start text intact; the visible feature name is handled by the span above

  // 7. update the universe visualization
  const universeIframe = document.querySelector('.universe-embed');
  if (universeIframe && universeIframe.contentWindow) {
      universeIframe.contentWindow.postMessage({
          type: 'set-feature',
          feature: f
      }, '*');
  }
  syncGeographicalViz();
}

function syncGeographicalViz() {
  if (!window.feature) return;
  const iframe = document.querySelector(GEO_EMBED_SELECTOR);
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(
      { type: "global-feature-change", feature: window.feature },
      "*"
  );
}

// Listen for requests from the iframe
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'get-initial-feature') {
      const universeIframe = document.querySelector('.universe-embed');
      if (universeIframe && universeIframe.contentWindow) {
          universeIframe.contentWindow.postMessage({
              type: 'set-feature',
              feature: window.feature // Send the current global feature
          }, '*');
      }
  }
});
