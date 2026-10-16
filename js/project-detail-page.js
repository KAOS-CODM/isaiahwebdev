/**
 * project-detail-page.js
 * Client-side renderer for the static project detail shell (`project.html`).
 *
 * The shell is reached through the query-string route `/project?slug=<slug>`
 * and renders the selected project on the frontend origin, so the existing
 * root-relative assets (`/css`, `/js`, `/assets`) resolve correctly. Content is
 * loaded through the existing shared loader (`js/api-config.js`): the CMS API
 * first, then `/data/projects.json`.
 *
 * Slug matching relies on the exact slugs produced by the shared schema
 * (`js/projects-schema.js`) for both API and fallback records, so a project's URL
 * is identical whichever source served it. No API/fallback logic is duplicated
 * here.
 *
 * The pure helpers (slug resolution, image path resolution, HTML and metadata
 * building) are exported so they can be unit-tested in Node without a DOM.
 */

import { loadProjectBySlug } from './api-config.js';
import { escapeHtml } from './projects-schema.js';

export const DEFAULT_SITE_URL = 'https://isaiahwebdev.onrender.com';

/** Robots directive applied once a real project is resolved. */
export const INDEX_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

/** Robots directive kept for not-found and failure states (soft-404 safety). */
export const NOINDEX_ROBOTS = 'noindex, follow';

export const NOT_FOUND_TITLE = 'Project not found | IsaiahWebDev Portfolio';

/** Human-readable labels for the development lifecycle states. */
const DEVELOPMENT_STATUS_LABELS = {
  'in-progress': 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}

/**
 * Resolve a project slug from the URL query string.
 *
 * The project detail page is served as `/project?slug=<slug>`, so the slug
 * is read from the `slug` query parameter. Returns '' when no slug is present.
 *
 * @param {string} [search] - The URL query string, e.g. `?slug=my-project`.
 * @returns {string}
 */
export function resolveProjectSlug(search = '') {
  let params;
  try {
    params = new URLSearchParams(typeof search === 'string' ? search : '');
  } catch {
    return '';
  }
  return asText(params.get('slug'));
}

/**
 * Turn a possibly-relative image path into a root-relative URL so it resolves on
 * the frontend origin regardless of the current route (`/project?slug=…`).
 * Absolute http(s) URLs (e.g. Cloudinary uploads) are left untouched.
 *
 * @param {unknown} src
 * @returns {string}
 */
export function toRootRelative(src) {
  const value = asText(src);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

function toAbsolute(siteUrl, src) {
  const value = asText(src);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

/** The card/blurb summary, preferring the current field over the legacy names. */
export function projectSummary(project) {
  return (
    asText(project && project.shortDescription) ||
    asText(project && project.description) ||
    asText(project && project.summary)
  );
}

/** The live demo URL, preferring the current field name. */
export function projectLiveUrl(project) {
  return asText(project && project.liveUrl) || asText(project && project.site);
}

/** The repository URL, preferring the current field name. */
export function projectGithubUrl(project) {
  return asText(project && project.githubUrl) || asText(project && project.github);
}

/** Only published projects are renderable on the public shell. */
export function isRenderableProject(project) {
  return Boolean(project) && project.status === 'published';
}

/** Normalize every image to { src, alt }, dropping entries without a src. */
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      if (typeof image === 'string') {
        const src = image.trim();
        return src ? { src, alt: '' } : null;
      }
      if (image && typeof image === 'object') {
        const src = asText(image.src);
        const alt = asText(image.alt);
        return src ? { src, alt } : null;
      }
      return null;
    })
    .filter(Boolean);
}

/** Category and development-status badges shown under the project title. */
export function renderProjectMeta(project) {
  const parts = [];

  const category = asText(project.category);
  if (category) {
    parts.push(
      `<span class="project-meta-badge project-meta-badge--category">${escapeHtml(category)}</span>`
    );
  }

  const developmentStatus = asText(project.developmentStatus).toLowerCase();
  if (DEVELOPMENT_STATUS_LABELS[developmentStatus]) {
    parts.push(
      `<span class="project-meta-badge project-meta-badge--status">${escapeHtml(DEVELOPMENT_STATUS_LABELS[developmentStatus])}</span>`
    );
  }

  if (!parts.length) return '';
  return `<div class="project-meta">${parts.join('')}</div>`;
}

function renderGallery(project) {
  const images = normalizeImages(project.images);
  if (!images.length) return '';

  const main = images[0];
  const mainSrc = escapeHtml(toRootRelative(main.src));
  const mainAlt = escapeHtml(main.alt || `${project.title} screenshot 1`);

  const thumbs = images.length > 1
    ? `
            <div class="project-gallery-thumbs" role="group" aria-label="Project screenshots">
              ${images
                .map((image, index) => {
                  const src = escapeHtml(toRootRelative(image.src));
                  const alt = escapeHtml(
                    image.alt || `${project.title} screenshot ${index + 1}`
                  );
                  const current = index === 0 ? ' aria-current="true"' : '';
                  return `
              <button
                type="button"
                class="project-gallery-thumb"
                data-src="${src}"
                data-alt="${alt}"
                aria-label="Show screenshot ${index + 1}"${current}
              >
                <img src="${src}" alt="${alt}" loading="lazy">
              </button>`;
                })
                .join('')}
            </div>`
    : '';

  return `
        <figure class="project-gallery">
          <img
            id="project-gallery-main"
            class="project-gallery__main"
            src="${mainSrc}"
            alt="${mainAlt}"
            loading="eager"
          >
        </figure>${thumbs}`;
}

function renderLinks(project) {
  const links = [];
  const liveUrl = projectLiveUrl(project);
  const githubUrl = projectGithubUrl(project);

  if (liveUrl) {
    links.push(`
                        <a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                            <i class="fas fa-external-link-alt" aria-hidden="true"></i> Live Demo
                        </a>`);
  }

  if (githubUrl) {
    links.push(`
                        <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="btn">
                            <i class="fab fa-github" aria-hidden="true"></i> Source Code
                        </a>`);
  }

  links.push(`
                        <a href="/projects" class="btn">
                            <i class="fas fa-arrow-left" aria-hidden="true"></i> Back to Projects
                        </a>`);

  return links.join('');
}

/**
 * Optional long-form case-study content, rendered only when the source supplies it.
 */
function renderCaseStudy(project) {
  const blocks = [];

  const summary = asText(project.summary);
  const shortDescription = projectSummary(project);
  if (summary && summary !== shortDescription) {
    blocks.push(`<p class="project-case-study__lead">${escapeHtml(summary)}</p>`);
  }

  const sections = [
    { heading: 'Problem statement', body: asText(project.problemStatement) || asText(project.problem) },
    { heading: 'Solution', body: asText(project.solution) },
    { heading: 'Key features', items: asList(project.keyFeatures) },
    { heading: 'My role', body: asText(project.role) },
    { heading: 'Why it matters', body: asText(project.problemSignificance) },
    { heading: 'Challenges', body: asText(project.challenges) },
    { heading: 'Trade-offs', body: asText(project.tradeoffs) },
    { heading: 'Lessons learned', body: asText(project.lessonsLearned) },
    { heading: 'Outcomes', items: asList(project.outcomes) },
  ];

  for (const section of sections) {
    if (section.items && section.items.length) {
      blocks.push(
        `<section class="project-section">
          <h2 class="project-section__title">${escapeHtml(section.heading)}</h2>
          <ul class="project-section__list">${section.items
            .map((item) => `
            <li>${escapeHtml(item)}</li>`)
            .join('')}
          </ul>
        </section>`
      );
    } else if (section.body) {
      blocks.push(
        `<section class="project-section">
          <h2 class="project-section__title">${escapeHtml(section.heading)}</h2>
          <p class="project-section__body">${escapeHtml(section.body)}</p>
        </section>`
      );
    }
  }

  if (!blocks.length) return '';
  return `
                    <div class="project-case-study">
        ${blocks.join('\n        ')}
                    </div>`;
}

/**
 * Render the full project page body (hero + content sections) for one project.
 * This is the markup for the live public detail page (the static shell served
 * at /project?slug=<slug>); the separate backend SSR renderer is not used.
 * All project data is escaped.
 *
 * @param {object} project - A project normalized by the shared schema.
 * @returns {string}
 */
export function renderProjectContent(project) {
  const title = escapeHtml(project.title);
  const description = escapeHtml(
    projectSummary(project) || `${project.title} — a project by Isaiah Adelowo.`
  );
  const technologies = asList(project.technologies);

  const technologiesBlock = technologies.length
    ? `
                    <p id="project-technologies" class="project-technologies">
                      <span class="project-technologies__label">Technologies:</span>
                      <span class="project-technologies__value">${escapeHtml(technologies.join(', '))}</span>
                    </p>`
    : '';

  return `
        <section id="project-hero" class="project-hero">
            <div class="container">
                <div class="project-detail">
                    <nav class="project-breadcrumb" aria-label="Breadcrumb">
                        <a href="/">Home</a>
                        <span class="project-breadcrumb__sep" aria-hidden="true">/</span>
                        <a href="/projects">Projects</a>
                        <span class="project-breadcrumb__sep" aria-hidden="true">/</span>
                        <span aria-current="page">${title}</span>
                    </nav>
                    <h1 id="project-title">${title}</h1>
                    ${renderProjectMeta(project)}
                    <p id="project-description" class="project-lede">${description}</p>
                </div>
            </div>
        </section>

        <section id="project-content" class="section-padding project-detail-body">
            <div class="container">
                <div class="project-detail">${renderGallery(project)}${technologiesBlock}${renderCaseStudy(project)}
                    <div class="project-actions">${renderLinks(project)}
                    </div>
                </div>
            </div>
        </section>`;
}

/** The default (pre-JavaScript) body state, kept until a project is resolved. */
export function renderLoadingState() {
  return `
        <section id="project-content" class="section-padding project-detail-body">
            <div class="container">
                <div class="project-detail">
                    <p class="project-state">Loading project…</p>
                </div>
            </div>
        </section>`;
}

/** Genuine not-found UI for an unknown slug. Never shows another project. */
export function renderNotFoundState() {
  return `
        <section id="project-content" class="section-padding project-detail-body">
            <div class="container">
                <div class="project-detail">
                    <div class="project-state">
                        <h1>Project not found</h1>
                        <p>The project you are looking for does not exist or is no longer available.</p>
                        <div class="project-actions">
                            <a href="/projects" class="btn btn-primary">View all projects</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
}

/** Failure UI shown when neither the API nor the fallback could be loaded. */
export function renderFailureState() {
  return `
        <section id="project-content" class="section-padding project-detail-body">
            <div class="container">
                <div class="project-detail">
                    <div class="project-state">
                        <h1>Temporarily unavailable</h1>
                        <p>This project page could not be loaded right now. Please try again shortly.</p>
                        <div class="project-actions">
                            <a href="/projects" class="btn btn-primary">View all projects</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
}

/**
 * Serialize structured data without allowing a `</script>` breakout.
 * `<`, `>` and `&` become JSON unicode escapes, which keeps the JSON valid while
 * making the payload inert inside a <script> element.
 * @param {object} value
 * @returns {string}
 */
export function safeJsonLd(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Build the document metadata and structured data for a resolved project.
 * Returns the values only; the DOM layer decides where to place them.
 *
 * @param {object} project - A project normalized by the shared schema.
 * @param {string} [siteUrl] - Public frontend origin.
 * @returns {{ title: string, description: string, canonical: string, robots: string,
 *   image: string, imageAlt: string, jsonLd: object[] }}
 */
export function buildProjectMetadata(project, siteUrl = DEFAULT_SITE_URL) {
  const site = (
    typeof siteUrl === 'string' && /^https?:\/\//i.test(siteUrl.trim())
      ? siteUrl.trim()
      : DEFAULT_SITE_URL
  ).replace(/\/+$/, '');

  const canonical = `${site}/project?slug=${encodeURIComponent(project.slug)}`;
  const pageTitle = `${project.title} | IsaiahWebDev Portfolio`;
  const description = projectSummary(project) || `${project.title} — a project by Isaiah Adelowo.`;
  const technologies = asList(project.technologies);
  const firstImage = normalizeImages(project.images)[0];
  const image = firstImage ? toAbsolute(site, firstImage.src) : `${site}/images/profile.jpg`;
  const imageAlt = firstImage
    ? firstImage.alt || `${project.title} screenshot`
    : project.title;

  const liveUrl = projectLiveUrl(project);
  const githubUrl = projectGithubUrl(project);

  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${canonical}#project`,
    name: project.title,
    description,
    author: { '@id': `${site}/#isaiah-adelowo` },
    applicationCategory: 'WebApplication',
    operatingSystem: 'Web',
  };
  if (liveUrl) softwareApp.url = liveUrl;
  if (githubUrl) softwareApp.codeRepository = githubUrl;
  if (firstImage) softwareApp.image = image;
  if (technologies.length) softwareApp.programmingLanguage = technologies;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: `${site}/projects` },
      { '@type': 'ListItem', position: 3, name: project.title, item: canonical },
    ],
  };

  return {
    title: pageTitle,
    description,
    canonical,
    robots: INDEX_ROBOTS,
    image,
    imageAlt,
    jsonLd: [softwareApp, breadcrumb],
  };
}

// ---------------------------------------------------------------------------
// DOM wiring (browser only)
// ---------------------------------------------------------------------------

function siteUrlFrom(win) {
  const origin = win && win.location && win.location.origin;
  return typeof origin === 'string' && /^https?:\/\//i.test(origin) ? origin : DEFAULT_SITE_URL;
}

function upsertMeta(doc, attribute, key, content) {
  let el = doc.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attribute, key);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(doc, href) {
  let el = doc.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = doc.createElement('link');
    el.setAttribute('rel', 'canonical');
    doc.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeCanonical(doc) {
  const el = doc.head.querySelector('link[rel="canonical"]');
  if (el) el.remove();
}

function replaceJsonLd(doc, blocks) {
  doc.head.querySelectorAll('script[data-project-jsonld]').forEach((node) => node.remove());
  for (const block of blocks) {
    const script = doc.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-project-jsonld', '');
    script.textContent = safeJsonLd(block);
    doc.head.appendChild(script);
  }
}

function removeJsonLd(doc) {
  doc.head.querySelectorAll('script[data-project-jsonld]').forEach((node) => node.remove());
}

/** Apply project-specific SEO metadata, structured data and robots. */
export function applyProjectMetadata(doc, project, siteUrl) {
  const meta = buildProjectMetadata(project, siteUrl);

  doc.title = meta.title;
  upsertMeta(doc, 'name', 'description', meta.description);
  upsertMeta(doc, 'name', 'robots', meta.robots);
  upsertCanonical(doc, meta.canonical);

  upsertMeta(doc, 'property', 'og:site_name', 'IsaiahWebDev');
  upsertMeta(doc, 'property', 'og:title', meta.title);
  upsertMeta(doc, 'property', 'og:description', meta.description);
  upsertMeta(doc, 'property', 'og:type', 'article');
  upsertMeta(doc, 'property', 'og:url', meta.canonical);
  upsertMeta(doc, 'property', 'og:locale', 'en_NG');
  upsertMeta(doc, 'property', 'og:image', meta.image);
  upsertMeta(doc, 'property', 'og:image:alt', meta.imageAlt);

  upsertMeta(doc, 'name', 'twitter:card', 'summary_large_image');
  upsertMeta(doc, 'name', 'twitter:title', meta.title);
  upsertMeta(doc, 'name', 'twitter:description', meta.description);
  upsertMeta(doc, 'name', 'twitter:image', meta.image);

  replaceJsonLd(doc, meta.jsonLd);
}

/** Not-found/failure metadata: meaningful title, description and `noindex`. */
export function applyNoindexMetadata(doc, title, description) {
  doc.title = title;
  upsertMeta(doc, 'name', 'description', description);
  upsertMeta(doc, 'name', 'robots', NOINDEX_ROBOTS);
  removeCanonical(doc);
  removeJsonLd(doc);
}

/** Show one thumbnail's image in the main frame and mark it as current. */
function selectThumb(main, thumbs, index) {
  const thumb = thumbs[index];
  if (!thumb) return;
  if (thumb.dataset.src) main.src = thumb.dataset.src;
  if (thumb.dataset.alt) main.alt = thumb.dataset.alt;
  thumbs.forEach((item, itemIndex) => {
    if (itemIndex === index) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
}

function initGallery(root) {
  const main = root.querySelector('#project-gallery-main');
  const thumbs = Array.from(root.querySelectorAll('.project-gallery-thumb'));
  if (!main || thumbs.length === 0) return;

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => selectThumb(main, thumbs, index));
    thumb.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = (index + 1) % thumbs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = (index - 1 + thumbs.length) % thumbs.length;
      }
      if (next === null) return;
      event.preventDefault();
      thumbs[next].focus();
      selectThumb(main, thumbs, next);
    });
  });
}

function showNotFound(doc, root) {
  root.innerHTML = renderNotFoundState();
  applyNoindexMetadata(
    doc,
    NOT_FOUND_TITLE,
    'The requested project could not be found.'
  );
}

function showFailure(doc, root) {
  root.innerHTML = renderFailureState();
  applyNoindexMetadata(
    doc,
    'Project temporarily unavailable | IsaiahWebDev Portfolio',
    'This project page is temporarily unavailable.'
  );
}

/**
 * Resolve the slug from the URL, load the project through the shared loader and
 * render it. Falls back to a genuine not-found UI for unknown slugs and a
 * failure UI when nothing could be loaded.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {Promise<void>}
 */
export async function initProjectPage(doc = document, win = window) {
  const root = doc.getElementById('project-page');
  if (!root) return;

  const location = (win && win.location) || {};
  const slug = resolveProjectSlug(location.search || '');

  if (!slug) {
    showNotFound(doc, root);
    return;
  }

  try {
    const project = await loadProjectBySlug(slug);
    if (!isRenderableProject(project)) {
      showNotFound(doc, root);
      return;
    }

    root.innerHTML = renderProjectContent(project);
    initGallery(root);
    applyProjectMetadata(doc, project, siteUrlFrom(win));
  } catch (error) {
    console.error(
      '[project] Failed to load project:',
      error && error.message ? error.message : error
    );
    showFailure(doc, root);
  }
}

// Auto-initialize in a browser. Guarded so the module can be imported and tested
// in Node (which has no `document`/`window`).
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initProjectPage();
    });
  } else {
    initProjectPage();
  }
}
