const projectsContainer = document.getElementById("projects-container");

// Load projects
async function loadProjects() {
    try {
        const response = await fetch("data/projects.json");
        const data = await response.json();

        if (!projectsContainer) return;

        if (!data.length) {
            projectsContainer.innerHTML = `<p class="no-projects">No projects available at the moment.</p>`;
            return;
        }

        displayProjects(data);

        // Use shared lightbox logic (created in js/projects-lightbox.js)
        if (typeof window.initProjectsLightbox === "function") {
            window.initProjectsLightbox(data);
        }

    } catch (error) {
        console.error("Error loading projects:", error);
        if (projectsContainer) {
            projectsContainer.innerHTML = `<p class="error">Failed to load projects. Please try again later.</p>`;
        }
    }
}

function getImageSrc(image) {
    return image?.src ?? image ?? "";
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

// Render projects
function displayProjects(projects) {
    if (!projectsContainer) return;

    projectsContainer.innerHTML = projects.map((project, index) => {
        const firstImage = project.images?.[0] ?? {};

        return `
            <div class="bg-card-bg border border-[rgba(255,0,60,0.15)] rounded-2xl p-[clamp(20px,4vw,30px)] transition-all duration-300 backdrop-blur-[10px] text-center hover:-translate-y-1 hover:border-neon-red hover:shadow-[0_15px_30px_rgba(255,0,60,0.2)] hover:bg-white/10"
                 data-index="${index}">

                <h3 class="text-text-light font-orbitron mb-[clamp(10px,2vw,15px)] text-[clamp(1.3rem,3vw,1.6rem)]">
                    ${project.title}
                </h3>

                <div class="mb-[clamp(10px,2vw,15px)] overflow-hidden rounded-[10px] max-h-62.5">
                    <img
                        src="${getImageSrc(firstImage)}"
                        alt="${getImageAlt(firstImage, project.title + ' Thumbnail')}"
                        class="thumb w-full h-auto cursor-pointer shadow-[0_5px_15px_rgba(0,0,0,0.1)] transition-smooth duration-300 hover:scale-105 hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                        loading="lazy"
                    >
                </div>

                <p class="text-text-dim mb-2.5">
                    ${project.description}
                </p>

                ${
                    project.technologies
                        ? `<p><strong>Technologies:</strong> ${project.technologies.join(", ")}</p>`
                        : ""
                }

                <div class="flex gap-[clamp(10px,2vw,15px)] justify-center mt-[clamp(15px,3vw,20px)]">

                    <a
                        href="${project.site}"
                        target="_blank"
                        class="project-link flex gap-[clamp(10px,2vw,15px)] mt-[clamp(15px,3vw,20px)] sm:flex-col"
                    >
                        <i class="fas fa-external-link-alt"></i> Live Demo
                    </a>

                    <a
                        href="${project.github}"
                        target="_blank"
                        class="project-link flex gap-[clamp(10px,2vw,15px)] mt-[clamp(15px,3vw,20px)] sm:flex-col"
                    >
                        <i class="fab fa-github"></i> Source Code
                    </a>
                </div>
            </div>
        `;
    }).join("");
}

// Init
loadProjects();

