/**
 * project-detail.js
 * Gallery enhancement for the server-rendered project detail pages.
 *
 * The page's title, description, technologies, gallery and links are already in
 * the served HTML, so crawlers and no-JS users get the full content. This module
 * only wires up in-page gallery switching; it never requests or replaces the
 * server-rendered content, so the authoritative (CMS) content is preserved.
 */

function initGallery() {
    const main = document.getElementById('project-gallery-main');
    const thumbs = document.querySelectorAll('.project-gallery-thumb');
    if (!main || thumbs.length === 0) return;

    thumbs.forEach((thumb) => {
        thumb.addEventListener('click', () => {
            const src = thumb.dataset.src;
            const alt = thumb.dataset.alt;
            if (src) main.src = src;
            if (alt) main.alt = alt;
        });
    });
}

initGallery();
