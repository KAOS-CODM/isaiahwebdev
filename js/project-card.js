/**
 * project-card.js
 * Pure markup renderer for a compact project card on the /projects listing.
 *
 * Kept free of DOM access so the same renderer can be used by:
 *   - js/projects-page.js when the browser hydrates the listing, and
 *   - scripts/generate-static-projects.mjs when the initial HTML is generated.
 *
 * Projects must already be normalized by js/projects-schema.js.
 */

import { escapeHtml, projectPagePath } from './projects-schema.js';

function getImageSrc(image) {
    return image?.src ?? image ?? '';
}

function getImageAlt(image, fallback) {
    // CMS records may store an empty alt string; keep a meaningful fallback
    // instead of emitting alt="" for a project screenshot.
    return image?.alt || fallback;
}

/**
 * Render one published project as a listing card.
 * @param {object} project - A project normalized by the shared schema.
 * @returns {string}
 */
export function renderProjectCard(project) {
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
