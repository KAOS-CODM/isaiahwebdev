let projectsCurrentGroup = [];
let projectsCurrentIndex = 0;

function getProjectsElements() {
    return {
        projectsContainer: document.getElementById('projects-container-full'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.getElementById('lightbox-img'),
        closeBtn: document.querySelector('.close'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn')
    };
}

async function loadProjects() {
    try {
        const response = await fetch('data/projects.json');
        const data = await response.json();
        const { projectsContainer } = getProjectsElements();
        if (!projectsContainer) return;

        if (!data.length) {
            projectsContainer.innerHTML = '<p class="no-projects">No projects available at the moment.</p>';
            return;
        }

        displayProjects(data);
        setupLightbox(data);
    } catch (error) {
        console.error('Error loading projects:', error);
        const { projectsContainer } = getProjectsElements();
        if (projectsContainer) {
            projectsContainer.innerHTML = '<p class="error">Failed to load projects. Please try again later.</p>';
        }
    }
}

function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

function displayProjects(projects) {
    const { projectsContainer } = getProjectsElements();
    if (!projectsContainer) return;

    projectsContainer.innerHTML = projects.map((project, index) => {
        const firstImage = project.images?.[0] ?? {};
        return `
            <div class="project" data-index="${index}">
                <h3>${project.title}</h3>
                <div class="project-thumb">
                    <img src="${getImageSrc(firstImage)}" alt="${getImageAlt(firstImage, `${project.title} Thumbnail`)}" class="thumb" loading="lazy">
                </div>
                <p>${project.description}</p>
                ${project.technologies ? `<p><strong>Technologies:</strong> ${project.technologies.join(', ')}</p>` : ''}
                <div class="project-links">
                    <a href="${project.site}" target="_blank" class="project-link">
                        <i class="fas fa-external-link-alt"></i> Live Demo
                    </a>
                    <a href="${project.github}" target="_blank" class="project-link">
                        <i class="fab fa-github"></i> Source Code
                    </a>
                </div>
            </div>
        `;
    }).join('');
}

function updateLightboxImage(lightboxImg) {
    const image = projectsCurrentGroup[projectsCurrentIndex] ?? {};
    lightboxImg.src = getImageSrc(image);
    lightboxImg.alt = getImageAlt(image, `Project image ${projectsCurrentIndex + 1}`);
}

function setupLightbox(projects) {
    const { lightbox, closeBtn, prevBtn, nextBtn } = getProjectsElements();
    if (!lightbox || !closeBtn || !prevBtn || !nextBtn) return;

    document.querySelectorAll('.thumb').forEach((thumb, index) => {
        thumb.addEventListener('click', () => {
            projectsCurrentGroup = projects[index].images ?? [];
            projectsCurrentIndex = 0;
            updateLightboxImage(document.getElementById('lightbox-img'));
            lightbox.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    });

    closeBtn.addEventListener('click', () => {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    prevBtn.addEventListener('click', () => {
        if (projectsCurrentGroup.length) {
            projectsCurrentIndex = (projectsCurrentIndex - 1 + projectsCurrentGroup.length) % projectsCurrentGroup.length;
            updateLightboxImage(document.getElementById('lightbox-img'));
        }
    });

    nextBtn.addEventListener('click', () => {
        if (projectsCurrentGroup.length) {
            projectsCurrentIndex = (projectsCurrentIndex + 1) % projectsCurrentGroup.length;
            updateLightboxImage(document.getElementById('lightbox-img'));
        }
    });

    lightbox.addEventListener('click', e => {
        if (e.target === lightbox) {
            lightbox.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });

    document.addEventListener('keydown', e => {
        if (lightbox.style.display === 'flex') {
            if (e.key === 'Escape') {
                lightbox.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (e.key === 'ArrowLeft') {
                prevBtn.click();
            }
            if (e.key === 'ArrowRight') {
                nextBtn.click();
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
});
