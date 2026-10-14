/**
 * project.js
 * Renders the featured project on the homepage.
 * Data comes from the shared loader (API first, /data/projects.json fallback).
 * The project title, "View Project" button and card link navigate to the
 * dedicated project page; the thumbnail keeps the existing image lightbox.
 */

import { loadProjects } from './api-config.js';
import { escapeHtml, featuredProjects, projectPagePath } from './projects-schema.js';

const projectsContainer = document.getElementById('projects-container');

function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

function renderFeatured(project) {
    const firstImage = project.images?.[0] ?? {};
    const href = projectPagePath(project.slug);
    const title = escapeHtml(project.title);
    const description = escapeHtml(project.shortDescription || project.description);
    const category = escapeHtml(project.category || '');
    const liveUrl = project.liveUrl || project.site;
    const githubUrl = project.githubUrl || project.github;

    return `
        <article class="bg-card-bg border border-[rgba(255,0,60,0.15)] rounded-2xl p-[clamp(20px,4vw,30px)] transition-all duration-300 backdrop-blur-[10px] text-center hover:-translate-y-1 hover:border-neon-red hover:shadow-[0_15px_30px_rgba(255,0,60,0.2)] hover:bg-white/10">
            <h3 class="text-text-light font-orbitron mb-[clamp(10px,2vw,15px)] text-[clamp(1.3rem,3vw,1.6rem)]">
                <a href="${href}">${title}</a>
            </h3>

            ${category
                ? `<p class="mb-2.5"><span class="inline-block px-3 py-0.5 border border-[rgba(255,0,60,0.35)] rounded-full text-neon-red text-[0.8rem]">${category}</span></p>`
                : ''
            }

            <div class="mb-[clamp(10px,2vw,15px)] overflow-hidden rounded-[10px] aspect-video">
                <img
                    src="${escapeHtml(getImageSrc(firstImage))}"
                    alt="${escapeHtml(getImageAlt(firstImage, `${project.title} Thumbnail`))}"
                    class="thumb w-full h-full object-cover cursor-pointer transition-smooth duration-300 hover:scale-105"
                    loading="lazy"
                >
            </div>

            <p class="text-text-dim mb-2.5">
                ${description}
            </p>

            ${project.technologies.length
                ? `<p><strong>Technologies:</strong> ${escapeHtml(project.technologies.join(', '))}</p>`
                : ''
            }

            <div class="flex justify-center gap-[clamp(10px,2vw,15px)] mt-[clamp(15px,3vw,20px)]">
                <a href="${href}" class="project-link flex gap-[clamp(10px,2vw,15px)] sm:flex-col">
                    <i class="fas fa-arrow-right"></i>
                    View Project
                </a>

                ${liveUrl
                    ? `<a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer" class="project-link flex gap-[clamp(10px,2vw,15px)] sm:flex-col">
                            <i class="fas fa-external-link-alt"></i>
                            Live Demo
                       </a>`
                    : ''
                }

                ${githubUrl
                    ? `<a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="project-link flex gap-[clamp(10px,2vw,15px)] sm:flex-col">
                            <i class="fab fa-github"></i>
                            Source Code
                       </a>`
                    : ''
                }
            </div>
        </article>
    `;
}

function displayProjects(projects) {
    if (!projectsContainer) return;

    projectsContainer.innerHTML = projects.map(renderFeatured).join('');

    // Keep the existing image lightbox for the displayed thumbnails.
    if (typeof window.initProjectsLightbox === 'function') {
        window.initProjectsLightbox(projects);
    }
}

async function init() {
    if (!projectsContainer) return;

    try {
        const { projects } = await loadProjects();
        const featured = featuredProjects(projects).slice(0, 1);

        if (!featured.length) {
            projectsContainer.innerHTML =
                '<p class="no-projects">No featured project available at the moment.</p>';
            return;
        }

        displayProjects(featured);
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsContainer.innerHTML =
            '<p class="error">Failed to load projects. Please try again later.</p>';
    }
}

init();
