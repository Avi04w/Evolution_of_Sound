function showSpotifyPlayer(spotify_id) {
    const container = document.getElementById("spotify-player-container");
    const iframe = document.getElementById("spotify-iframe");

    if (!spotify_id) return console.warn("Missing Spotify ID");

    iframe.src = `https://open.spotify.com/embed/track/${spotify_id}?utm_source=generator`;

    if (container) {
        container.style.display = "flex";
        container.style.opacity = 0;
        container.style.transition = "opacity 0.3s ease";
        requestAnimationFrame(() => (container.style.opacity = 1));
    }

    // Hide the show button if it exists (ensure it's hidden whenever the player is shown)
    const showBtn = document.getElementById('spotify-show-btn');
    if (showBtn) {
        showBtn.style.display = 'none';
    }

    // If user explicitly showed the player programmatically, clear the "hidden" flag
    try {
        localStorage.removeItem('spotifyHidden');
    } catch (e) { /* ignore */ }
}

// Wire the hide/show buttons and persist visibility
document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('spotify-player-container');
    const hideBtn = document.getElementById('spotify-hide-btn');
    let showBtn = document.getElementById('spotify-show-btn');

    if (!container) return; // nothing to do

    // Ensure there is a show button (in case HTML didn't include it)
    if (!showBtn) {
        showBtn = document.createElement('button');
        showBtn.id = 'spotify-show-btn';
        showBtn.title = 'Show Spotify player';
        showBtn.setAttribute('aria-label', 'Show Spotify player');
        showBtn.innerText = '♫';
        showBtn.style.display = 'none';
        document.body.appendChild(showBtn);
    }

    // Apply saved state
    const hidden = (function () {
        try { return localStorage.getItem('spotifyHidden') === '1'; } catch (e) { return false; }
    })();

    if (hidden) {
        container.style.display = 'none';
        showBtn.style.display = 'flex';
    } else {
        // If the container is currently hidden (inline style or stylesheet), show the show-button by default
        if (getComputedStyle(container).display === 'none') {
            container.style.display = 'none';
            showBtn.style.display = 'flex';
        } else {
            container.style.display = 'flex';
            showBtn.style.display = 'none';
        }
    }

    hideBtn?.addEventListener('click', function () {
        container.style.display = 'none';
        showBtn.style.display = 'flex';
        try { localStorage.setItem('spotifyHidden', '1'); } catch (e) { /* ignore */ }
    });

    showBtn.addEventListener('click', function () {
        container.style.display = 'flex';
        showBtn.style.display = 'none';
        try { localStorage.removeItem('spotifyHidden'); } catch (e) { /* ignore */ }
    });
});
