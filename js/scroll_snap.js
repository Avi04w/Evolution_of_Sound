// js/scrollSnap.js
(function () {
    const sections = Array.from(document.querySelectorAll('.vis-section'));
    const header = document.querySelector('header');
    const watched = [header, ...sections].filter(Boolean);

    const hideIds = new Set([
        'conclusion-section',
        'era-section',
        'bubble-section',
        'feature-selection-section',
        'record-player-container'
    ]);

    let mostVisible = null;
    let debounceTimer = null;
    let lastIOTimestamp = 0;

    function computeMostVisibleFallback() {
        const all = [header, ...sections].filter(Boolean);
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;

        let best = { id: null, ratio: 0 };

        for (const el of all) {
            const rect = el.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const bottom = rect.bottom + window.scrollY;

            const visible = Math.min(bottom, viewportBottom) - Math.max(top, viewportTop);
            const ratio = visible / rect.height;

            if (ratio > best.ratio) {
                best = { id: el.id, ratio };
            }
        }

        return best.id;
    }

    function applyVisibility(id) {
        const persistentEl = document.getElementById('persistent-feature-control');
        if (!persistentEl) return;


        // Check if dna-section is the current most visible
        const dnaSection = document.getElementById('dna-section');

        if (dnaSection.classList.contains('is-active')) {
            const dnaMain = document.getElementById('vis-dna');
            const dnaYearly = document.getElementById('vis-dna-yearly');

            if (id === 'dna-section') {
                // Case 1: yearly hidden → show persistent selector
                if (dnaMain && dnaMain.style.display === 'none' &&
                    dnaYearly && dnaYearly.style.display !== 'none') {
                    console.log("hide persistent");
                    persistentEl.classList.add('hidden');
                    return;
                }

                // Case 2: yearly visible → don't show persistent selector
                if (dnaYearly && dnaYearly.style.display !== 'none') {
                    persistentEl.classList.remove('hidden');
                    return;
                }
            }
        }

        const shouldHide = hideIds.has(id);
        persistentEl.classList.toggle('hidden', shouldHide);
    }

    window._applyPersistentVisibility = applyVisibility;

    const io = new IntersectionObserver((entries) => {
        lastIOTimestamp = performance.now();

        // Highlight logic
        entries.forEach(entry => {
            let el = entry.target;
            if (el.classList.contains('vis-section')) {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                    el.classList.add('is-active');
                } else {
                    el.classList.remove('is-active');
                }
            }
        });

        // Determine most visible
        const candidates = entries
            .filter(e => e.isIntersecting)
            .map(e => ({ id: e.target.id, ratio: e.intersectionRatio }));

        if (candidates.length > 0) {
            const top = candidates.reduce((a, b) => (a.ratio > b.ratio ? a : b));
            mostVisible = top.id;
        }

        // Debounced update
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => applyVisibility(mostVisible), 100);
    }, {
        root: null,
        threshold: Array.from({ length: 11 }, (_, i) => i / 10)
    });

    watched.forEach(el => io.observe(el));

    window.addEventListener('scroll', () => {
        const now = performance.now();

        // IO fired in last 120ms → use IO state (smooth)
        if (now - lastIOTimestamp < 120) return;

        // IO stale → use fallback
        const fallbackId = computeMostVisibleFallback();
        applyVisibility(fallbackId);
    }, { passive: true });


    watched.forEach(el => io.observe(el));

    window.addEventListener('keydown', (ev) => {
        if (['ArrowDown','PageDown',' '].includes(ev.key)) {
            ev.preventDefault();
            snapBy(1);
        } else if (['ArrowUp','PageUp'].includes(ev.key)) {
            ev.preventDefault();
            snapBy(-1);
        }
    });

    function snapBy(delta) {
        const all = [header, ...sections].filter(Boolean);
        const mid = window.scrollY + window.innerHeight / 2;

        const centers = all.map(el => {
            const r = el.getBoundingClientRect();
            const top = r.top + window.scrollY;
            const center = top + r.height / 2;
            return { el, d: Math.abs(center - mid) };
        }).sort((a, b) => a.d - b.d);

        const idx = all.indexOf(centers[0].el);
        const next = all[Math.min(all.length - 1, Math.max(0, idx + delta))];
        next?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.addEventListener('DOMContentLoaded', function () {
        const hint = document.getElementById('scroll-hint');
        const targets = ['bubble-section', 'feature-selection-section']
            .map(id => document.getElementById(id))
            .filter(Boolean);
        const scroller = document.querySelector('.pageScroller');

        if (!hint || targets.length === 0) return;

        const observerOptions = {
            root: scroller || null,
            threshold: 0.5
        };

        const visible = new Set();

        if ('IntersectionObserver' in window) {
            const obs = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const id = entry.target.id;
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        visible.add(id);
                    } else {
                        visible.delete(id);
                    }
                });
                if (visible.size > 0) hint.classList.remove('hide'); else hint.classList.add('hide');
            }, observerOptions);

            targets.forEach(t => obs.observe(t));
        } else {
            // Fallback: simple check for any target being >=50% visible
            const checkAny = () => {
                const rootRect = (scroller && scroller.getBoundingClientRect()) || { top: 0, bottom: window.innerHeight };
                let anyVisible = false;
                for (const target of targets) {
                    const rect = target.getBoundingClientRect();
                    const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
                    const ratio = visibleHeight / rect.height;
                    if (ratio >= 0.5) { anyVisible = true; break; }
                }
                if (anyVisible) hint.classList.remove('hide'); else hint.classList.add('hide');
            };

            (scroller || window).addEventListener('scroll', checkAny, { passive: true });
            checkAny();
        }
    });

})();
