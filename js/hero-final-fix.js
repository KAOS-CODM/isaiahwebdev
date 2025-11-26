// Nuclear option - ensure hero sections are below navbar
document.addEventListener('DOMContentLoaded', function() {
    const heroSections = document.querySelectorAll('#hero, #about-hero, #certificates-hero, #contact-hero, #projects-hero');
    const navbar = document.querySelector('.navbar');
    
    if (navbar && heroSections.length > 0) {
        const navbarHeight = navbar.offsetHeight;
        const extraSpace = 20; // Extra pixels for safety
        
        heroSections.forEach(section => {
            // Force the padding
            section.style.paddingTop = (navbarHeight + extraSpace) + 'px';
            section.style.boxSizing = 'border-box';
            
            console.log('Applied padding to', section.id, ':', navbarHeight + extraSpace + 'px');
        });
    }
});

// Also fix on window resize
window.addEventListener('resize', function() {
    const heroSections = document.querySelectorAll('#hero, #about-hero, #certificates-hero, #contact-hero, #projects-hero');
    const navbar = document.querySelector('.navbar');
    
    if (navbar && heroSections.length > 0) {
        const navbarHeight = navbar.offsetHeight;
        const extraSpace = 20;
        
        heroSections.forEach(section => {
            section.style.paddingTop = (navbarHeight + extraSpace) + 'px';
        });
    }
});
