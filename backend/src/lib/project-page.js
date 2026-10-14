/**
 * Server-side HTML rendering for the project detail pages.
 *
 * The markup mirrors the existing portfolio design (same navigation, sections,
 * classes and scripts) so the server-rendered pages are indistinguishable from
 * the rest of the site. All project data is interpolated into the response as
 * escaped HTML, and structured data is serialized safely, so the page is valid
 * and crawlable without any client-side JavaScript.
 *
 * Pure functions: everything needed (escapeHtml, the public site URL) is passed
 * in, which keeps the renderer trivially unit-testable.
 */

'use strict';

/** Same author node the rest of the site uses in JSON-LD. */
const AUTHOR_HANDLE = 'isaiah-adelowo';

/**
 * Turn a possibly-relative image path into a root-relative URL.
 * Absolute http(s) URLs (e.g. Cloudinary) are left untouched.
 * @param {unknown} src
 * @returns {string}
 */
function toRootRelative(src) {
  const value = String(src == null ? '' : src).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

/**
 * Serialize structured data without allowing a `</script>` breakout.
 * `<`, `>` and `&` are emitted as JSON unicode escapes, which keeps the JSON
 * valid while making the payload inert inside a <script> element.
 * @param {object} value
 * @returns {string}
 */
function safeJsonLd(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Normalize every image to { src, alt }, dropping entries without a src. */
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      if (typeof image === 'string') return image.trim() ? { src: image.trim(), alt: '' } : null;
      if (image && typeof image === 'object') {
        const src = typeof image.src === 'string' ? image.src.trim() : '';
        const alt = typeof image.alt === 'string' ? image.alt.trim() : '';
        return src ? { src, alt } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}

/** Human-readable labels for the development lifecycle states. */
const DEVELOPMENT_STATUS_LABELS = {
  'in-progress': 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

/** The card/hero blurb, preferring the current field over the legacy names. */
function projectSummary(project) {
  return asText(project.shortDescription) || asText(project.description) || asText(project.summary);
}

/** The live demo URL, preferring the current field name. */
function liveUrlOf(project) {
  return asText(project.liveUrl) || asText(project.site);
}

/** The repository URL, preferring the current field name. */
function githubUrlOf(project) {
  return asText(project.githubUrl) || asText(project.github);
}

/**
 * Category and development-status badges shown under the project title.
 * Development status is display-only and never affects publication, which is
 * decided upstream by `status`.
 * @param {object} project
 * @param {(value: unknown) => string} escapeHtml
 * @returns {string}
 */
function renderProjectMeta(project, escapeHtml) {
  const parts = [];

  const category = asText(project.category);
  if (category) {
    parts.push(
      `<span class="project-meta-badge" style="display:inline-block;padding:2px 10px;border:1px solid rgba(255,0,60,0.35);border-radius:999px;font-size:0.8rem;color:#ff5c7a;">${escapeHtml(category)}</span>`
    );
  }

  const developmentStatus = asText(project.developmentStatus).toLowerCase();
  if (DEVELOPMENT_STATUS_LABELS[developmentStatus]) {
    parts.push(
      `<span class="project-meta-badge" style="display:inline-block;padding:2px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:999px;font-size:0.8rem;color:#c9ccd3;">${escapeHtml(DEVELOPMENT_STATUS_LABELS[developmentStatus])}</span>`
    );
  }

  if (!parts.length) return '';
  return `<div class="project-meta" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 0.75rem;">${parts.join('')}</div>`;
}

/**
 * The canonical (crawlable) URL for a project page.
 * @param {string} siteUrl
 * @param {string} slug
 * @returns {string}
 */
function canonicalUrl(siteUrl, slug) {
  return `${siteUrl}/projects/${encodeURIComponent(slug)}`;
}

function toAbsolute(siteUrl, src) {
  const value = asText(src);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function renderGallery(project, escapeHtml) {
  const images = normalizeImages(project.images);
  if (!images.length) return '';

  const main = images[0];
  const mainSrc = escapeHtml(toRootRelative(main.src));
  const mainAlt = escapeHtml(main.alt || `${project.title} screenshot 1`);

  const thumbs = images.length > 1
    ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:12px;" class="project-gallery-thumbs">
          ${images
            .map((image, index) => `
          <button
            type="button"
            class="project-gallery-thumb"
            data-src="${escapeHtml(toRootRelative(image.src))}"
            data-alt="${escapeHtml(image.alt || `${project.title} screenshot ${index + 1}`)}"
            aria-label="Show screenshot ${index + 1}"
            style="padding:0;border:1px solid rgba(255,0,60,0.25);border-radius:10px;background:transparent;cursor:pointer;overflow:hidden;"
          >
            <img src="${escapeHtml(toRootRelative(image.src))}" alt="${escapeHtml(image.alt || `${project.title} screenshot ${index + 1}`)}" loading="lazy" style="width:100%;display:block;">
          </button>`)
            .join('')}
        </div>`
    : '';

  return `
        <figure class="project-gallery" style="margin:0;">
          <img
            id="project-gallery-main"
            src="${mainSrc}"
            alt="${mainAlt}"
            loading="eager"
            style="width:100%;max-height:65vh;object-fit:contain;border-radius:12px;background:rgba(0,0,0,0.25);"
          >
        </figure>${thumbs}`;
}

function renderLinks(project, escapeHtml) {
  const links = [];
  const liveUrl = liveUrlOf(project);
  const githubUrl = githubUrlOf(project);

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
function renderCaseStudy(project, escapeHtml) {
  const blocks = [];

  const summary = asText(project.summary);
  const shortDescription = projectSummary(project);
  if (summary && summary !== shortDescription) {
    blocks.push(`<p class="large-text">${escapeHtml(summary)}</p>`);
  }

  const sections = [
    { heading: 'Problem statement', body: asText(project.problemStatement) || asText(project.problem) },
    { heading: 'Solution', body: asText(project.solution) },
    { heading: 'Key features', items: asList(project.keyFeatures) },
    { heading: 'My role', body: asText(project.role) },
    // Legacy long-form content, preserved for records created before this milestone.
    { heading: 'Why it matters', body: asText(project.problemSignificance) },
    { heading: 'Challenges', body: asText(project.challenges) },
    { heading: 'Trade-offs', body: asText(project.tradeoffs) },
    { heading: 'Lessons learned', body: asText(project.lessonsLearned) },
    { heading: 'Outcomes', items: asList(project.outcomes) },
  ];

  for (const section of sections) {
    if (section.items && section.items.length) {
      blocks.push(
        `<h2>${escapeHtml(section.heading)}</h2>\n        <ul class="text-text-dim">${section.items
          .map((item) => `\n          <li>${escapeHtml(item)}</li>`)
          .join('')}\n        </ul>`
      );
    } else if (section.body) {
      blocks.push(
        `<h2>${escapeHtml(section.heading)}</h2>\n        <p class="text-text-dim">${escapeHtml(section.body)}</p>`
      );
    }
  }

  if (!blocks.length) return '';
  return `
                    <div class="project-case-study mt-16 text-left">
        ${blocks.join('\n        ')}
                    </div>`;
}

/**
 * Build the full HTML document for one published project.
 * @param {object} project - A project normalized by the shared schema.
 * @param {{ escapeHtml: (value: unknown) => string, siteUrl: string }} options
 * @returns {string}
 */
function buildProjectPage(project, { escapeHtml, siteUrl }) {
  const canonical = canonicalUrl(siteUrl, project.slug);
  const pageTitle = `${project.title} | IsaiahWebDev Portfolio`;
  const liveUrl = liveUrlOf(project);
  const githubUrl = githubUrlOf(project);
  const description =
    projectSummary(project) || `${project.title} — a project by Isaiah Adelowo.`;
  const technologies = asList(project.technologies);
  const firstImage = normalizeImages(project.images)[0];
  const ogImage = firstImage ? toAbsolute(siteUrl, firstImage.src) : `${siteUrl}/images/profile.jpg`;
  const ogImageAlt = firstImage ? firstImage.alt || `${project.title} screenshot` : project.title;

  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${canonical}#project`,
    name: project.title,
    description,
    author: { '@id': `${siteUrl}/#${AUTHOR_HANDLE}` },
    applicationCategory: 'WebApplication',
    operatingSystem: 'Web',
  };
  if (liveUrl) softwareApp.url = liveUrl;
  if (githubUrl) softwareApp.codeRepository = githubUrl;
  if (firstImage) softwareApp.image = ogImage;
  if (technologies.length) softwareApp.programmingLanguage = technologies;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/index` },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: `${siteUrl}/projects` },
      { '@type': 'ListItem', position: 3, name: project.title, item: canonical },
    ],
  };

  const title = escapeHtml(project.title);
  const escDescription = escapeHtml(description);
  const escPageTitle = escapeHtml(pageTitle);

  const technologiesBlock = technologies.length
    ? `
                    <p id="project-technologies" class="text-text-dim mt-16">
                      <strong>Technologies:</strong> ${escapeHtml(technologies.join(', '))}
                    </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escPageTitle}</title>
    <meta name="description" content="${escDescription}">
    <meta name="author" content="IsaiahWebDev">
    <link rel="canonical" href="${canonical}">
    <meta property="og:site_name" content="IsaiahWebDev">
    <meta property="og:title" content="${escPageTitle}">
    <meta property="og:description" content="${escDescription}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonical}">
    <meta property="og:locale" content="en_NG">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escPageTitle}">
    <meta name="twitter:description" content="${escDescription}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
    <script type="application/ld+json">
${safeJsonLd(softwareApp)}
    </script>
    <script type="application/ld+json">
${safeJsonLd(breadcrumb)}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,100..900;1,100..900&family=Orbitron:wght@400..900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/fontawesome-free-5.15.4-web/css/all.min.css">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="icon" href="/icon/favicon.ico">
</head>
<body>
    <main>
        <nav class="navbar">
            <a href="/index" class="logo">ISAIAH<span>WEB</span>DEV</a>
            <div class="nav-links">
                <a href="/index" class="nav-link">Home</a>
                <a href="/about" class="nav-link">About</a>
                <a href="/projects" class="nav-link active">Projects</a>
                <a href="/certificates" class="nav-link">Certificates</a>
                <a href="/resume" class="nav-link">Resume</a>
                <a href="/contact" class="nav-link">Contact</a>
            </div>
        </nav>
        <a href="#project-content" class="skip-link">Skip to main content</a>

        <section id="project-hero" data-reveal="up">
            <div class="container">
                <div class="content-wrapper text-left">
                    <p class="text-text-dim">
                        <a href="/index">Home</a> / <a href="/projects">Projects</a> / ${title}
                    </p>
                </div>
                <div class="section-header">
                    <h1 id="project-title">${title}</h1>
                    ${renderProjectMeta(project, escapeHtml)}
                    <p id="project-description">${escDescription}</p>
                </div>
            </div>
        </section>

        <section id="project-content" class="section-padding" data-reveal="up">
            <div class="container" data-project-detail data-project-slug="${escapeHtml(project.slug)}">
                <div class="content-wrapper text-left">
${renderGallery(project, escapeHtml)}${technologiesBlock}${renderCaseStudy(project, escapeHtml)}
                    <div class="btn-group center-buttons mt-16">${renderLinks(project, escapeHtml)}
                    </div>
                </div>
            </div>
        </section>

        <footer id="main-footer">
            <!-- Footer will be loaded here dynamically -->
        </footer>

        <div class="back-to-top" id="backToTop">
            <i class="fas fa-chevron-up" aria-hidden="true"></i>
        </div>
    </main>

    <script src="/js/script.js"></script>
    <script src="/js/reveal.js"></script>
    <script src="/js/top.js"></script>
    <script src="/js/footer-loader.js"></script>
    <script src="/js/hero-final-fix.js"></script>
    <script type="module" src="/js/project-detail.js"></script>
</body>
</html>
`;
}

/**
 * Build a small, styled HTML error page. Only static text is interpolated, so
 * no user input is ever reflected.
 * @param {{ title: string, message: string }} options
 * @returns {string}
 */
function buildProjectErrorPage({ title, message }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>${title} | IsaiahWebDev</title>
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="icon" href="/icon/favicon.ico">
</head>
<body>
    <main>
        <nav class="navbar">
            <a href="/index" class="logo">ISAIAH<span>WEB</span>DEV</a>
            <div class="nav-links">
                <a href="/index" class="nav-link">Home</a>
                <a href="/projects" class="nav-link active">Projects</a>
            </div>
        </nav>
        <section class="section-padding">
            <div class="container">
                <div class="section-header">
                    <h1>${title}</h1>
                    <p>${message}</p>
                </div>
                <div class="btn-group center-buttons">
                    <a href="/projects" class="btn btn-primary">View all projects</a>
                </div>
            </div>
        </section>
        <footer id="main-footer">
            <!-- Footer will be loaded here dynamically -->
        </footer>
    </main>
    <script src="/js/footer-loader.js"></script>
</body>
</html>
`;
}

module.exports = {
  buildProjectPage,
  buildProjectErrorPage,
  canonicalUrl,
  normalizeImages,
  renderGallery,
  renderCaseStudy,
  renderProjectMeta,
  safeJsonLd,
  toRootRelative,
};
