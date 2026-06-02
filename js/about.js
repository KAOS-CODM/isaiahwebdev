document.addEventListener('DOMContentLoaded', () => {
    loadSkillsData();
    setupBackToTop();
});

async function loadSkillsData() {
    try {
        const response = await fetch('data/skills.json');
        const skillsData = await response.json();

        renderSkillCards(skillsData.skillCards);
        renderDetailedSkills(skillsData.skillCategories);
        setupSkillAnimations();
    } catch (error) {
        console.error('Error loading skills data:', error);
        document.getElementById('skills-cards-container').innerHTML = '<p class="error">Failed to load skills data.</p>';
        document.getElementById('skills-detailed-container').innerHTML = '<p class="error">Failed to load skills data.</p>';
    }
}

function renderSkillCards(skillCards) {
    const container = document.getElementById('skills-cards-container');
    if (!container) return;

    container.innerHTML = skillCards.map(card => `
        <div class="skill-card">
            <i class="${card.icon}"></i>
            <h3>${card.title}</h3>
            <p>${card.description}</p>
        </div>
    `).join('');
}

function renderDetailedSkills(skillCategories) {
    const container = document.getElementById('skills-detailed-container');
    if (!container) return;

    container.innerHTML = skillCategories.map(category => `
        <div class="skill-category">
            <h3><i class="${category.icon}"></i> ${category.name}</h3>
            ${category.skills.map(skill => `
                <div class="skill-item">
                    <div class="skill-info">
                        <span>${skill.name}</span>
                        <span>${skill.level}%</span>
                    </div>
                    <div class="skill-bar">
                        <div class="skill-progress" style="width: ${skill.level}%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function setupSkillAnimations() {
    const observerOptions = {
        threshold: 0.3,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const progressBar = entry.target;
                const targetWidth = progressBar.style.width;
                progressBar.style.width = '0%';

                setTimeout(() => {
                    progressBar.style.width = targetWidth;
                    progressBar.style.animation = 'skillFill 1.5s ease-out forwards';
                }, 100);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.skill-progress').forEach(progress => {
        observer.observe(progress);
    });
}

function setupBackToTop() {
    const backToTop = document.getElementById('backToTop');
    if (!backToTop) return;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.style.display = 'flex';
        } else {
            backToTop.style.display = 'none';
        }
    });

    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
