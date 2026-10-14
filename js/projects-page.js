/**
 * projects-page.js
 * Renders the full project list on /projects as compact cards.
 * Data comes from the shared loader (API first, /data/projects.json fallback).
 * Each card links to its dedicated, server-rendered project page.
 */

import { loadProjects } from './api-config.js';
import { escapeHtml, projectPagePath, publishedProjects } from './projects-schema.js';

const projectsContainer = document.getElementById('projects-container-full');

function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

function renderCard(project) {
    const firstImage = project.images?.[0] ?? {};
    const href = projectPagePath(project.slug);
    const title = escapeHtml(project.title);
    const alt = escapeHtml(getImageAlt(firstImage, `${project.title} Thumbnail`));
    const category = escapeHtml(project.category || '');
    const description = escapeHtml(project.shortDescription || project.description || '');

    return `
        <article class="project-card bg-card-bg border border-[rgba(255,0,60,0.15)] rounded-2xl overflow-hidden transition-all duration-300 backdrop-blur-[10px] text-center hover:-translate-y-1 hover:border-neon-red hover:shadow-[0_15px_30px_rgba(255,0,60,0.2)] hover:bg-white/10">
            <a href="${href}" class="block" aria-label="View details for ${title}">
                <div class="overflow-hidden">
                    <img
                        src="${escapeHtml(getImageSrc(firstImage))}"
                        alt="${alt}"
                        class="w-full h-auto shadow-[0_5px_15px_rgba(0,0,0,0.1)] transition-smooth duration-300 hover:scale-105 hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                        loading="lazy"
                    >
                </div>

                <div class="p-[clamp(12px,2vw,20px)]">
                    ${category
                        ? `<span class="inline-block mb-2 px-2 py-[2px] rounded-full border border-[rgba(255,0,60,0.35)] text-neon-red text-[0.7rem] uppercase tracking-wide">${category}</span>`
                        : ''}
                    <h3 class="text-text-light font-orbitron text-[clamp(1rem,2.5vw,1.3rem)] mb-1">
                        ${title}
                    </h3>
                    ${description
                        ? `<p class="text-text-dim text-[0.9rem] mb-3">${description}</p>`
                        : ''
                    }
                    <span class="inline-flex items-center gap-1 text-neon-red text-[0.8rem] font-medium transition-all duration-300 hover:gap-2">
                        View Details <i class="fas fa-arrow-right" style="font-size:0.7rem;"></i>
                    </span>
                </div>
            </a>
        </article>
    `;
}

function displayProjects(projects) {
    if (!projectsContainer) return;

    if (!projects.length) {
        projectsContainer.innerHTML =
            '<p class="no-projects">No projects available at the moment.</p>';
        return;
    }

    projectsContainer.innerHTML = projects.map(renderCard).join('');
}

async function init() {
    if (!projectsContainer) return;

    try {
        const { projects } = await loadProjects();
        displayProjects(publishedProjects(projects));
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsContainer.innerHTML =
            '<p class="error">Failed to load projects. Please try again later.</p>';
    }
}

init();
