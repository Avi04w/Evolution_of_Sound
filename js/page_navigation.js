// Page Navigation - Scroll hint and page indicator functionality

// Show/hide scroll hint based on scroll position
(function() {
    const scrollHint = document.getElementById('scroll-hint');
    if (!scrollHint) return;
    
    let hideTimeout = null;
    
    function updateScrollHint() {
        const scrollY = document.body.scrollTop || window.scrollY || document.documentElement.scrollTop;
        
        if (scrollY <= 50) {
            // Near the top - show the hint
            clearTimeout(hideTimeout);
            scrollHint.style.display = 'block';
            // Force reflow to restart animation
            scrollHint.offsetHeight;
            scrollHint.classList.remove('hide');
        } else {
            // Scrolled down - hide the hint
            scrollHint.classList.add('hide');
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                scrollHint.style.display = 'none';
            }, 500);
        }
    }
    
    // Check on page load
    updateScrollHint();
    
    // Update on scroll - listen to both window and body
    window.addEventListener('scroll', updateScrollHint);
    document.body.addEventListener('scroll', updateScrollHint);
})();

// Page indicator dots
(function() {
    const pages = document.querySelectorAll('.page');
    const dots = document.querySelectorAll('.page-dot');
    
    if (pages.length === 0 || dots.length === 0) return;
    
    function updateActiveDot() {
        const scrollY = document.body.scrollTop || window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        
        // Find which page is currently most visible
        let currentPage = 0;
        let maxVisibility = 0;
        
        pages.forEach((page, index) => {
            const rect = page.getBoundingClientRect();
            const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
            const visibility = Math.max(0, visibleHeight) / windowHeight;
            
            if (visibility > maxVisibility) {
                maxVisibility = visibility;
                currentPage = index;
            }
        });
        
        // Update active dot
        dots.forEach((dot, index) => {
            if (index === currentPage) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
    
    // Click to navigate to page
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            if (pages[index]) {
                pages[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Update on page load
    updateActiveDot();
    
    // Update on scroll - listen to both window and body
    window.addEventListener('scroll', updateActiveDot);
    document.body.addEventListener('scroll', updateActiveDot);
    
    // Update on resize
    window.addEventListener('resize', updateActiveDot);
})();
