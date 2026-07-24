/**
 * projects-page.js
 * Loads project data from projects.json, renders compact project cards,
 * and opens the project details modal on card click.
 *
 * Dependencies:
 *   - js/projects-modal.js (provides window.openProjectModal)
 *   - data/projects.json
 */

const projectsContainer = document.getElementById('projects-container-full');

// ─── Helper utilities ─────────────────────────────────────────────────
function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

// ─── Load & render projects ──────────────────────────────────────────
async function loadProjects() {
    try {
        const response = await fetch('data/projects.json');
        const data = await response.json();

        if (!projectsContainer) return;

        if (!data.length) {
            projectsContainer.innerHTML =
                '<p class="no-projects">No projects available at the moment.</p>';
            return;
        }

        displayProjects(data);

    } catch (error) {
        console.error('Error loading projects:', error);
        if (projectsContainer) {
            projectsContainer.innerHTML =
                '<p class="error">Failed to load projects. Please try again later.</p>';
        }
    }
}

/**
 * Render compact project cards.
 * Each card shows: thumbnail, title, and a subtle "View Details" indicator.
 * Cards are fully clickable – clicking anywhere opens the modal.
 */
function displayProjects(projects) {
    if (!projectsContainer) return;

    projectsContainer.innerHTML = projects.map((project, index) => {
        const firstImage = project.images?.[0] ?? {};
        return `
            <div
                class="project-card bg-card-bg border border-[rgba(255,0,60,0.15)] rounded-2xl overflow-hidden transition-all duration-300 backdrop-blur-[10px] text-center cursor-pointer hover:-translate-y-1 hover:border-neon-red hover:shadow-[0_15px_30px_rgba(255,0,60,0.2)] hover:bg-white/10"
                data-index="${index}"
                role="button"
                tabindex="0"
                aria-label="View details for ${project.title}"
            >
                <!-- Thumbnail -->
                <div class="overflow-hidden">
                    <img
                        src="${getImageSrc(firstImage)}"
                        alt="${getImageAlt(firstImage, project.title + ' Thumbnail')}"
                        class="w-full h-auto shadow-[0_5px_15px_rgba(0,0,0,0.1)] transition-smooth duration-300 hover:scale-105 hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                        loading="lazy"
                    >
                </div>

                <!-- Title + View Details indicator -->
                <div class="p-[clamp(12px,2vw,20px)]">
                    <h3 class="text-text-light font-orbitron text-[clamp(1rem,2.5vw,1.3rem)] mb-1">
                        ${project.title}
                    </h3>
                    <span class="inline-flex items-center gap-1 text-neon-red text-[0.8rem] font-medium transition-all duration-300 hover:gap-2">
                        View Details <i class="fas fa-arrow-right" style="font-size:0.7rem;"></i>
                    </span>
                </div>
            </div>
        `;
    }).join('');

    // Attach click + keyboard listeners to each card
    attachCardListeners(projects);
}

/**
 * Attach click and keyboard event listeners to each project card.
 * Uses event delegation via the container for performance.
 * Also re-attaches directly on each card for simplicity.
 */
function attachCardListeners(projects) {
    const cards = projectsContainer.querySelectorAll('.project-card');

    cards.forEach((card) => {
        const index = parseInt(card.dataset.index, 10);

        // Click to open modal
        card.addEventListener("click", function (e) {
            if (e.target.closest("a")) return;
        
            e.preventDefault();
        
            window.openProjectModal(projects, index);
        });
        
        card.addEventListener("keydown", function (e) {
        
            if (e.key === "Enter" || e.key === " ") {
        
                e.preventDefault();
        
                window.openProjectModal(projects, index);
        
            }
        
        });
    });
}

/**
 * Open the project details modal.
 * Delegates to the shared modal module (window.openProjectModal).
 *
function openProjectModal(projects, index) {
    if (typeof window.openProjectModal === 'function') {
        window.openProjectModal(projects, index);
    } else {
        console.error('[projects-page] window.openProjectModal is not available. Ensure projects-modal.js is loaded.');
    }
}*/

// ─── Init ─────────────────────────────────────────────────────────────
loadProjects();


