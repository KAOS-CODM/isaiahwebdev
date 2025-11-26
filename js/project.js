const projectsContainer = document.getElementById("projects-container");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const closeBtn = document.querySelector(".close");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

let currentGroup = [];
let currentIndex = 0;

// Load projects
async function loadProjects() {
    try {
        const response = await fetch("data/projects.json");
        const data = await response.json();
        
        if (data.length === 0) {
            projectsContainer.innerHTML = '<p class="no-projects">No projects available at the moment.</p>';
            return;
        }
        
        displayProjects(data);
        setupLightbox(data);
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsContainer.innerHTML = '<p class="error">Failed to load projects. Please try again later.</p>';
    }
}

function displayProjects(projects) {
    projectsContainer.innerHTML = projects.map((project, index) => `
        <div class="project" data-index="${index}">
            <h3>${project.title}</h3>
            <div class="project-thumb">
                <img src="${project.images[0]}" alt="${project.title} Thumbnail" class="thumb" loading="lazy">
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
    `).join('');
}

function setupLightbox(projects) {
    document.querySelectorAll('.thumb').forEach((thumb, index) => {
        thumb.addEventListener('click', () => {
            currentGroup = projects[index].images;
            currentIndex = 0;
            lightboxImg.src = currentGroup[currentIndex];
            lightbox.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    });
}

// Lightbox controls
closeBtn.addEventListener('click', closeLightbox);
prevBtn.addEventListener('click', showPrevImage);
nextBtn.addEventListener('click', showNextImage);

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        closeLightbox();
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (lightbox.style.display === 'flex') {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') showPrevImage();
        if (e.key === 'ArrowRight') showNextImage();
    }
});

function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function showPrevImage() {
    if (currentGroup.length) {
        currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
        lightboxImg.src = currentGroup[currentIndex];
    }
}

function showNextImage() {
    if (currentGroup.length) {
        currentIndex = (currentIndex + 1) % currentGroup.length;
        lightboxImg.src = currentGroup[currentIndex];
    }
}

// Initialize
loadProjects();
