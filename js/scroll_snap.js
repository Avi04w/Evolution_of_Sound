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
})();
