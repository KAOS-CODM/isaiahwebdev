document.addEventListener('DOMContentLoaded', function() {
    const profileWrapper = document.querySelector('.profile-wrapper');
    const particleCount = 30;

    // Pages without a profile hero (e.g. generated project pages) skip particles.
    if (!profileWrapper) return;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 8 + 2;
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        const duration = Math.random() * 6 + 4;
        const delay = Math.random() * 5;
        const opacity = Math.random() * 0.5 + 0.1;

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        particle.style.animationDuration = `${duration}s`;
        particle.style.animationDelay = `${delay}s`;
        particle.style.opacity = opacity;
        particle.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
        particle.style.animation = `float ${Math.random() * 10 +5}s infinite ease-in-out`;

        profileWrapper.appendChild(particle);
    }

    document.querySelectorAll('.particle').forEach(particle => {
        const keyframes = `
            @keyframes float-${Math.random().toString(36).
            substr(2, 5)} {
                0% { transform: translate(0, 0); }
                50% { transform: translate(${Math.random() * 40 -20}px, ${Math.random() * 40 - 20}px;) }
                100% { transform: translate(0, 0); }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = keyframes;
        document.head.appendChild(styleSheet);

        particle.style.animation = `float-${styleSheet.sheet.cssRules[0].name.match(/-(\w+)/)[1]} ${Math.random() * 10 + 5}s infinite ease-in-out`
    });
});