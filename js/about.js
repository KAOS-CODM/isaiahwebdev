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
        <div class="bg-card-bg  p-[clamp(25px,5vw,40px) rounded-2xl text-center border border-solid border-[rgba(255,0,60,0.15)] transition-smooth backdrop-blur-[10px] hover:-translate-y-2.5 hover:border-neon-red hover:shadow-[255,9,60,0.2] hover:bg-[255,255,255,0.1] md:p-[30px,20px]">
            <i class="${card.icon} text-[clamp(2.5rem,6vw,3rem)] text-neon-red mb-[clamp(15px,3vw,20px)]"></i>
            <h3 class="font-orbitron mb-[clamp(10px,2vw,15px)] text-text-light">${card.title}</h3>
            <p class="text-text-dim m-0">${card.description}</p>
        </div>
    `).join('');
}

function renderDetailedSkills(skillCategories) {
    const container = document.getElementById('skills-detailed-container');
    if (!container) return;

    container.innerHTML = skillCategories.map(category => `
        <div class="skill-category">
            <h3 class="text-text-light font-orbitron text-[1.2rem] border-b-(--neon-red) box-border mb-6.25 m-0 pb-2.5 p-0 border-b-2 border-solid"><i class="${category.icon}"></i> ${category.name}</h3>
            ${category.skills.map(skill => `
                <div class="mb-6">
                    <div class="flex justify-between mb-2 text-[0.95rem]">
                        <span class="first:text-text-light first:font-medium last:text-neon-red last:font-semibold">${skill.name}</span>
                        <span class="first:text-text-light first:font-medium last:text-neon-red last:font-semibold">${skill.level}%</span>
                    </div>
                    <div class=" skill-bar">
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
