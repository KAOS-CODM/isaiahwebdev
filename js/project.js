/**
 * project.js
 * Renders the homepage "Selected Work" section: one prominent featured project
 * beside a short, balanced grid of supporting projects, plus a single link to
 * the full project listing.
 *
 * Data comes from the shared loader (API first, /data/projects.json fallback).
 * Titles and buttons navigate to the dedicated project page; card imagery keeps
 * the existing image lightbox.
 *
 * The render helpers are pure (no DOM access) so they can be unit tested, and
 * the auto-init at the bottom is guarded so the module can be imported in Node.
 */

import { loadProjects } from './api-config.js';
import {
    escapeHtml,
    featuredProjects,
    projectPagePath,
} from './projects-schema.js';

/** How many supporting projects are shown beside the featured one. */
export const SUPPORTING_LIMIT = 3;

function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

/**
 * First usable image of a project, or null when it has none.
 * @param {object} project
 * @returns {{ src: string, alt: string } | null}
 */
function firstImage(project) {
    const image = project.images?.[0];
    const src = getImageSrc(image);

    return src
        ? { src, alt: getImageAlt(image, `${project.title} preview`) }
        : null;
}

/**
 * Split a normalized project list into the homepage's lead project and the
 * supporting projects shown beneath it.
 *
 * Only projects explicitly flagged `featured` after normalization are
 * eligible, whether the data came from the API/database or the JSON fallback.
 * Non-featured projects never fill the remaining slots, so the section shows
 * fewer cards (or its empty state) instead. The first featured project under
 * the shared ordering rules leads, followed by up to `SUPPORTING_LIMIT` more
 * featured projects.
 *
 * @param {object[]} projects
 * @returns {{ featured: object|null, supporting: object[] }}
 */
export function selectHomepageProjects(projects) {
    const featured = featuredProjects(projects);

    if (featured.length === 0) {
        return { featured: null, supporting: [] };
    }

    return {
        featured: featured[0],
        supporting: featured.slice(1, 1 + SUPPORTING_LIMIT),
    };
}

function renderTechLabels(technologies) {
    if (!Array.isArray(technologies) || technologies.length === 0) {
        return '';
    }

    const labels = technologies
        .map((technology) => `<li>${escapeHtml(technology)}</li>`)
        .join('');

    return `<ul class="work-tech">${labels}</ul>`;
}

/**
 * Render the featured project as one wide editorial panel.
 * @param {object} project
 * @returns {string}
 */
export function renderFeaturedProject(project) {
    const href = projectPagePath(project.slug);
    const title = escapeHtml(project.title);
    const description = escapeHtml(
        project.shortDescription || project.description || ''
    );
    const category = escapeHtml(project.category || '');
    const liveUrl = project.liveUrl || project.site || '';
    const githubUrl = project.githubUrl || project.github || '';
    const image = firstImage(project);

    // The image stays a lightbox trigger, as on the original homepage: the
    // shared lightbox binds the thumbnail click without preventing the default
    // action, so the wrapper must not be an anchor. The title and buttons are
    // the project-page links.
    const media = image
        ? ` <div class="work-featured__media">
                <img
                    class="thumb"
                    src="${escapeHtml(image.src)}"
                    alt="${escapeHtml(image.alt)}"
                    loading="lazy"
                >
            </div>`
        : ` <div class="work-featured__media" aria-hidden="true"></div>`;

    const actions = [
        `<a href="${href}" class="btn btn-primary">
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
            View Project
        </a>`,
        liveUrl
        ? `<a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer" class="btn">
                <i class="fas fa-external-link-alt" aria-hidden="true"></i>
                Live Demo
            </a>`
        : '',
        githubUrl
        ? `<a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="btn">
                <i class="fab fa-github" aria-hidden="true"></i>
                Source Code
            </a>`
        : '',
    ]
    .filter(Boolean)
    .join('\n');

    return `
    <article class="work-featured">${media}

        <div class="work-featured__body">

            <div class="work-featured__eyebrow">
                <span class="work-featured__kicker">Featured project</span>${category ?`\n
                <span class="work-pill">${category}</span>` : ''}
            </div>

            <h3 class="work-featured__title">
                <a href="${href}">${title}</a>
            </h3>

            <p class="work-featured__desc">
                ${description}
            </p>

            ${renderTechLabels(project.technologies)}

            <div class="work-featured__actions">
            ${actions}
            </div>

        </div>

    </article>`;
}

/**
 * Render one supporting project as a compact card.
 * @param {object} project
 * @returns {string}
 */
export function renderSupportingCard(project) {
    const href = projectPagePath(project.slug);
    const title = escapeHtml(project.title);
    const description = escapeHtml(
        project.shortDescription || project.description || ''
    );
    const image = firstImage(project);

    // Lightbox trigger, not a link (see renderFeaturedProject).
    const media = image
        ? ` <div class="work-card__media">
                <img
                    class="thumb"
                    src="${escapeHtml(image.src)}"
                    alt="${escapeHtml(image.alt)}"
                    loading="lazy"
                >
            </div>`
        : ' <div class="work-card__media" aria-hidden="true"></div>';

    return `
    <article class="work-card">${media}

        <div class="work-card__body">

            <h3 class="work-card__title">
                <a href="${href}">${title}</a>
            </h3>

            <p class="work-card__desc">
                ${description}
            </p>

            <span class="work-card__cta">
                <a href="${href}">View Details</a>
                <i class="fas fa-arrow-right" aria-hidden="true"></i>
            </span>

        </div>

    </article>`;
}

/**
 * Build the full Selected Work markup plus the project list for the lightbox.
 *
 * `lightboxProjects` is ordered to match the `.thumb` elements in `html`: the
 * featured project first (when it has an image), then the supporting projects.
 * Projects without an image render no `.thumb` and are omitted.
 *
 * @param {object[]} projects
 * @returns {{ featured: object|null, supporting: object[], html: string, lightboxProjects: object[] }}
 */
export function buildHomepageWork(projects) {
    const { featured, supporting } = selectHomepageProjects(projects);

    if (!featured) {
        return { featured: null, supporting: [], html: '', lightboxProjects: [] };
    }

    const lightboxProjects = [];
    const sections = [];

    sections.push(renderFeaturedProject(featured));
    if (firstImage(featured)) {
        lightboxProjects.push(featured);
    }

    if (supporting.length) {
        const cards = supporting
            .map((project) => {
                if (firstImage(project)) {
                    lightboxProjects.push(project);
                }
                return renderSupportingCard(project);
            })
            .join('');

        sections.push(`
                <div class="work-grid">${cards}
                </div>`);
    }

    return {
        featured,
        supporting,
        html: sections.join(''),
        lightboxProjects,
    };
}

/**
 * Load the projects and render the Selected Work section into
 * `#projects-container`, wiring the shared image lightbox.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {Promise<void>}
 */
export async function initHomepageWork(doc = document, win = window) {
    const container = doc.getElementById('projects-container');
    if (!container) return;

    try {
        const { projects } = await loadProjects();
        const { featured, html, lightboxProjects } = buildHomepageWork(projects);

        if (!featured) {
            container.innerHTML =
                '<p class="no-projects">No projects available at the moment.</p>';
            return;
        }

        container.innerHTML = html;

        // Keep the existing image lightbox for the displayed thumbnails.
        if (win && typeof win.initProjectsLightbox === 'function') {
            win.initProjectsLightbox(lightboxProjects);
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        container.innerHTML =
            '<p class="error">Failed to load projects. Please try again later.</p>';
    }
}

// Auto-initialize in a browser. Guarded so the module can be imported and tested
// in Node (which has no `document`/`window`).
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initHomepageWork();
        });
    } else {
        initHomepageWork();
    }
}
