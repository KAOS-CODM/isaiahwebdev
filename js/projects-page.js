/**
 * projects-page.js
 * Renders the full project list on /projects as compact cards.
 * Data comes from the shared loader (API first, /data/projects.json fallback).
 * Each card links to its dedicated query-string project page.
 *
 * The card markup itself lives in js/project-card.js so the same renderer can
 * generate the initial (crawlable) HTML without executing page JavaScript.
 */

import { loadProjects } from './api-config.js';
import { publishedProjects } from './projects-schema.js';
import { renderProjectCard } from './project-card.js';

const projectsContainer = document.getElementById('projects-container-full');

function displayProjects(projects) {
    if (!projectsContainer) return;

    if (!projects.length) {
        projectsContainer.innerHTML =
            '<p class="no-projects">No projects available at the moment.</p>';
        return;
    }

    projectsContainer.innerHTML = projects.map(renderProjectCard).join('');
}

async function init() {
    if (!projectsContainer) return;

    try {
        const { projects, source } = await loadProjects();

        // The listing ships a generated snapshot of the published API data.
        // Do not overwrite it with the local JSON fallback, which currently
        // contains records the production API does not publish. The API result
        // still replaces the snapshot when it is available.
        if (source === 'local' && projectsContainer.dataset?.staticProjects === 'true') {
            return;
        }

        displayProjects(publishedProjects(projects));
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsContainer.innerHTML =
            '<p class="error">Failed to load projects. Please try again later.</p>';
    }
}

init();
