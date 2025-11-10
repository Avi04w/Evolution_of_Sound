// js/scrollSnap.js
(function () {
    const sections = Array.from(document.querySelectorAll('.vis-section'));
    const header = document.querySelector('header');
    const watched = [header, ...sections].filter(Boolean);

    // highlight whichever section is mostly in view
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            const el = e.target;
            if (el.classList.contains('vis-section')) {
                if (e.isIntersecting && e.intersectionRatio >= 0.6) {
                    el.classList.add('is-active');
                } else {
                    el.classList.remove('is-active');
                }
            }
        });
    }, { root: null, threshold: [0.0, 0.6, 1.0] });

    watched.forEach(el => io.observe(el));

    // optional: keyboard navigation between snap points
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

// js/scrollSnap.js (replace the existing DOMContentLoaded handler)
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
