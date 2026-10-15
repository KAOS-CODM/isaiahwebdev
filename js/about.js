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
            <h3><i class="${category.icon}" aria-hidden="true"></i> ${category.name}</h3>
            ${category.skills.map(skill => `
                <div class="skill-item">
                    <div class="skill-info">
                        <span>${skill}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

