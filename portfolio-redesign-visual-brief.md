# Portfolio Redesign: Visual Direction & Implementation Guardrails

**Project:** Isaiah Yemi Adelowo portfolio  
**Public site:** https://isaiahwebdev.onrender.com  
**Purpose:** Source of truth for the approved visual direction of the public portfolio redesign.

> **Important:** This brief records the approved design direction. It is not, by itself, permission to begin implementation, commit, push, deploy, or change hosting configuration. Follow the user's explicit instructions for each milestone.

---

## 1. The Design North Star

Build a distinctive, premium-feeling software-engineering portfolio that balances personality with professional credibility. It should feel art-directed, warm, modern, and intentional, not like a generic developer template.

The visual concept combines:
- A deep charcoal foundation.
- Amber and gold as the signature accent.
- Hybrid typography: geometric display type, readable sans-serif body text, and selective monospace details.
- Dark pages and surfaces punctuated by selected warm-ivory sections.
- A split-screen hero pairing the introduction with a real featured project and restrained abstract decoration.
- An asymmetric project gallery combining editorial composition with premium product-card presentation.
- Balanced visual drama and purposeful, restrained motion.

The work should help both potential freelance clients and engineering teams understand who the developer is and what they have actually built.

## 2. Approved Design Decisions

### Overall style: Hybrid

Blend refined engineering credibility with editorial personality. Do not drift into purely minimal, purely cinematic, excessively futuristic, or overly experimental styling.

### Color identity: Amber & Gold

Initial palette:

| Role | Color | Hex |
|---|---|---|
| Main dark background | Deep charcoal-brown | `#17140F` |
| Primary accent | Amber gold | `#F5B942` |
| Secondary accent | Soft gold | `#FDE68A` |
| Light section background | Warm ivory | `#FFFBEB` |

These are starting tokens, not a claim that all combinations are accessible. Define suitable foreground, muted text, border, card-surface, and focus colors after contrast checks. Do not use the gold accent indiscriminately for body text. Check text and controls against WCAG contrast requirements, and adjust exact values or use cases when necessary.

### Typography: Hybrid

- Use a strong, geometric sans-serif for display headings.
- Use a highly readable sans-serif for body copy and interface text.
- Reserve monospace for small technical labels, project metadata, code-related details, and selected microcopy.
- Establish a clear type scale with comfortable line heights and responsive sizes.
- Avoid ultra-thin headings and tiny mobile text.
- Candidate font direction: Space Grotesk or a similar geometric display face, paired with Inter or a similar readable sans-serif, with IBM Plex Mono or a similar monospace accent. Check existing font availability and loading before adding anything new; do not add dependencies without approval.

### Backgrounds and surfaces: Editorial hybrid

- Keep the overall experience predominantly dark.
- Use selected, substantial warm-ivory sections where they improve storytelling and visual rhythm.
- Use subtle charcoal and warm near-black surface variations to create depth.
- Make transitions between dark and light sections feel intentional and connected.
- Avoid turning every card into a light panel or creating unrelated-looking sections.

### Hero: Split-screen, featured project + abstract composition

- One side should present the developer's existing name, professional positioning, introduction, and current calls to action.
- The other side should showcase a **real existing project** within a restrained art-directed composition.
- Use CSS-created geometric decoration, fine lines, warm highlights, or subtle depth only where they support the featured project.
- Do not invent project screenshots, metrics, testimonials, clients, credentials, product interfaces, or outcomes.
- Preserve existing content, links, and behavior.
- Achieve the layout with CSS and existing markup wherever possible. If a genuine visual requirement cannot be achieved without HTML changes, explain the exact need and ask the user before changing markup.

### Project gallery: Editorial + premium product hybrid

Create an asymmetric gallery with varied visual weight and a consistent card design system.

- Feature selected projects with more space or prominence when supported by existing content and assets.
- Combine large editorial-style features with smaller polished product cards.
- Keep project titles, descriptions, technology details, and existing links legible and easy to scan.
- Use real project images/assets where available. Do not fabricate screenshots or project content.
- Keep card surfaces, borders, radii, shadows, and hover states consistent even when card dimensions vary.
- Preserve existing data loading, project order/content unless the current behavior already determines it, project slugs, and click destinations.
- Make the asymmetric layout collapse gracefully at narrower widths. Do not preserve desktop asymmetry at the expense of mobile readability.

### Gold treatment: Functional + editorial

Gold should serve both usability and visual identity.

Use it for:
- Primary calls to action and selected interactive states.
- A limited number of heading highlights or section markers.
- Fine lines, restrained graphic details, and selected hover treatments.
- Carefully chosen project-card highlights.

Keep most body text, backgrounds, and card surfaces neutral. Avoid gold everywhere, large uncontrolled glow effects, and low-contrast gold text on light ivory.

### Motion and interaction: Refined hybrid

- Keep the page calm by default.
- Use smooth transitions, subtle card and button feedback, and limited scroll reveals only if they can be achieved within the approved scope.
- Motion must not obstruct reading, delay interaction, or become a constant background distraction.
- Respect `prefers-reduced-motion`.
- Do not add JavaScript-driven motion or new interaction behavior under this CSS-first brief. If a desired effect requires JavaScript or markup changes, ask before expanding scope.

### Visual drama: Balanced

The design should be memorable, but not noisy. Prefer composition, typography, spacing, and purposeful contrast over constant glow, animation, or decoration.

---

## 3. Scope Boundaries: Appearance Only

This is a **CSS-first public-site redesign**. The guiding rule is:

**Change how the website looks, not what it does.**

### Allowed within the approved scope

- Colors, typography, type scale, spacing, alignment, layout, grid/flex presentation, and responsive behavior.
- Backgrounds, surfaces, borders, radii, shadows, decorative effects, and CSS transitions.
- Hover, focus, active, disabled, error, and success visual states.
- CSS-only responsive adaptations, including a stacked mobile navigation if necessary.
- CSS fixes that improve presentation, readability, usability, or accessibility.
- Running the existing CSS build process to regenerate the compiled stylesheet.

### Locked unless the user explicitly approves an exception

- JavaScript behavior or application logic.
- Backend, API, authentication, CMS, database, Cloudinary, media upload, or content-management behavior.
- SEO metadata, canonical URLs, structured data, page content, routes, project slugs, and existing link destinations.
- HTML structure and markup. If a minimal markup change is genuinely necessary, explain why and wait for explicit approval first.
- Admin page layout and styling. The admin interface is excluded from this public-site redesign.
- Framework migration, new dependencies, build/deployment architecture, or hosting configuration.
- Git commits, pushes, deployments, or Render setting changes.

A CSS-only redesign cannot create new interactive behavior. Do not add a hamburger-menu interaction, theme toggle, modal, or other JavaScript-dependent behavior without explicit approval.

## 4. Repository and Technical Constraints

- The public site uses vanilla HTML, CSS, and JavaScript.
- Public pages load the generated stylesheet at `css/styles.css`.
- The Tailwind source stylesheet is `tailwind-workspace/input.css`.
- The existing build command is `npm run build` from `tailwind-workspace`, which generates `../css/styles.css`.
- Preserve the existing framework-free architecture and deployment approach.
- Some styles originate from Tailwind utility classes in HTML and JavaScript-generated markup. Check cascade layers and specificity before adding overrides; test the result in a browser rather than assuming a source-level rule wins.
- `js/hero-final-fix.js` applies inline hero padding. Do not modify this script under the current scope; test CSS changes alongside it.
- Backend-generated project-detail pages contain inline styles. Backend changes are out of scope. Do not casually add broad `!important` overrides. If an essential requirement cannot be achieved safely with the approved CSS scope, explain the limitation and ask the user.
- `admin.html` has its own inline styles and is excluded.
- Do not edit unrelated, unlinked, or ignored CSS files instead of the actual source stylesheet.
- Preserve existing SEO, canonical metadata, structured data, page routes, and deployment compatibility.

## 5. Known CSS and UX Issues from the Read-Only Audit

Verify these against the current source before changing them. Address only within the appearance/accessibility scope.

- Hero heading and paragraph become far too small on mobile.
- Display headings use an excessively thin weight and need clearer hierarchy.
- `--neon-red` appears to be referenced where the defined token is `--color-neon-red`, causing invalid declarations.
- `.skip-link { display: hidden }` is invalid; the skip link should be visually hidden off-screen until focused, while remaining accessible.
- A hero `clamp()` gap appears to have a minimum larger than its maximum.
- The existing red accent fails WCAG AA for normal text on some dark surfaces. The new amber/gold palette also requires contrast testing.
- Some focus utility classes appear malformed.
- There is no `prefers-reduced-motion` accommodation despite multiple animations and effects.
- Contact form fields may be oversized; review them against a coherent type scale.
- Focus styles and form status colors should be coherent, visible, and accessible.
- Mobile navigation occupies substantial vertical space; improve its visual treatment within CSS-only constraints.
- Card, button, radius, and elevation styles are inconsistent and should be consolidated into a coherent system.
- Global word-breaking/overflow rules may cause awkward wrapping; review carefully rather than introducing clipping.

Do not use this redesign as a reason to fix unrelated application functionality.

## 6. Responsive Review Requirements

Manually inspect at these viewport widths:

`320`, `360`, `390`, `414`, `768`, `1024`, and `1440` pixels.

At minimum, review:
- Home page and split-screen hero.
- About.
- Projects gallery and cards.
- Project detail page.
- Certificates.
- Resume.
- Contact page, form states, and validation presentation.
- Navigation and footer.

Check for horizontal overflow, clipped content, awkward wrapping, unreadable text, inconsistent spacing, weak contrast, missing focus indication, overly tall navigation, and excessive motion. Preserve existing links and interactions.

## 7. Required Workflow for OpenCode

1. Read `WORKFLOW_BRAIN.md` and `ROADMAP.md` before starting any milestone, if present.
2. Read this design brief in full.
3. Inspect the current source and report how the approved visual direction maps to existing markup and styles.
4. Before implementation, provide a staged CSS-first plan. Identify any ambiguity or requirement that would need HTML, JavaScript, backend, content, or configuration changes.
5. Do not start editing files until the user approves the proposed first milestone.
6. Work from the actual CSS source, then rebuild `css/styles.css` using the existing build command.
7. Keep changes narrowly scoped. Do not alter locked areas without explicit approval.
8. Run relevant existing automated checks.
9. Perform manual browser checks at all listed viewport widths and report what was actually tested.
10. Report files changed, commands/checks run, outcomes, visual issues remaining, and any requirement that cannot be met within scope.
11. Do not commit, push, deploy, or change Render settings unless the user explicitly approves that specific action.

## 8. Definition of Done

The redesign is ready for user review when:

- The result feels like one coherent hybrid identity, not unrelated styles assembled together.
- Amber/gold is recognizable but restrained, and color contrast is accessible.
- Typography is readable, well weighted, and responsive.
- The split-screen hero pairs the existing introduction with a genuine featured project and restrained abstract details.
- The asymmetric gallery combines editorial variety with consistent premium product-card styling.
- Dark and selected ivory sections feel integrated.
- Motion is restrained and reduced-motion preferences are respected.
- Navigation, cards, forms, focus states, and footer remain usable across all target sizes.
- Existing content, routes, SEO, JavaScript behavior, backend behavior, CMS features, media uploads, and project destinations remain intact.
- Relevant automated checks pass and manual responsive checks are reported accurately.
- No commit, push, deployment, or hosting configuration change occurs without explicit approval.

---

## Instruction to OpenCode

Treat this file as the authoritative visual direction and scope guardrail. Do not reinterpret the choices or silently expand the scope. First read this file plus `WORKFLOW_BRAIN.md` and `ROADMAP.md`, inspect the current source, and propose a staged implementation plan for user approval. Do not begin implementation until the user approves the first milestone.
