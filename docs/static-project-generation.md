# Static project generation

The project listing and homepage "Selected Work" section ship real project
markup in their initial HTML. JavaScript still hydrates both sections from the
shared loader, but crawlers, social previews and non-JS clients no longer see an
empty container or the old PRAROZ placeholder.

## What is generated

| File | Region markers | Content |
| --- | --- | --- |
| `projects.html` | `<!-- static-projects:start/end -->` | One card per **published** project, in shared order |
| `projects.html` | `<!-- static-projects-schema:start/end -->` | One `ItemList` describing exactly those published projects |
| `index.html` | `<!-- static-featured:start/end -->` | Featured project plus up to three supporting projects, all `featured === true` and published |

Do not edit inside these regions by hand. Edit the CMS/API records instead and
regenerate.

## Source of truth

The generator reads the **production projects API**:

`https://isaiahwebdev-api.onrender.com/api/content/projects`

The committed `/data/projects.json` fallback is deliberately **not** a
generation source. It currently contains more records than the production API
publishes, so using it would publish stale or contradictory projects. If the API
is unreachable, returns an invalid shape, or yields zero usable projects, the
generator exits non-zero and leaves every file untouched (fail closed).

Normalization, ordering, published/featured selection and detail URLs come from
`js/projects-schema.js`. Card markup comes from `js/project-card.js`; homepage
markup comes from `js/project.js`. Those are the same functions the browser uses
to hydrate, so the generated markup and the hydrated markup agree when they load
the same dataset.

## Commands

```bash
# Regenerate both files from the production API
node scripts/generate-static-projects.mjs

# Verify committed markup matches the production API without writing
node scripts/generate-static-projects.mjs --check

# Reproduce the committed output from a recorded API response
node scripts/generate-static-projects.mjs --input tests/fixtures/production-projects-api.json --check
```

`tests/fixtures/production-projects-api.json` is a recorded response from the
production API. Refresh it together with the generated HTML when the CMS
dataset changes.

## Operating procedure

1. Run the generator (or `--check`) before committing project content or
   deploying the static frontend.
2. Run the focused tests:

   ```bash
   node --test tests/static-projects.test.mjs tests/homepage-work.test.mjs tests/projects-schema.test.mjs
   ```

3. Review the card order, the homepage selection, and the `ItemList` diff.

## Guarantees

- Only projects whose normalized `status` is `published` appear.
- The homepage includes only projects with an explicit boolean
  `featured === true`; strings, numbers and missing values do not qualify.
- Every generated detail link uses `/project?slug=<slug>`.
- The listing `ItemList` uses the on-site detail URL and CMS image only. It does
  not republish CMS live/repository URLs, several of which are currently dead.
- Non-featured projects never fill homepage slots.
- Empty published/featured sets render the existing safe empty state; an empty
  or unusable API response aborts generation.
- If the API is unavailable at runtime, the generated pages keep their snapshot
  instead of replacing it with the local JSON fallback. The fallback currently
  contains projects the API does not publish, so hydrating it over the snapshot
  would contradict the initial HTML. The fallback still serves pages without
  generated markup and the detail loader.
- The existing browser hydration, loading/error states, styles and lightbox are
  otherwise unchanged.

## Freshness dependency (not solved in the repository)

The frontend is a static Render site built from committed files. There is no
build command or publish webhook in this repository that regenerates the HTML.
The committed markup is therefore a snapshot of the production API at generation
time.

Consequences:

- A CMS change is visible immediately to JavaScript clients (hydration replaces
  the static markup) but not to non-JS crawlers until the generator is run and
  the updated files are deployed.
- Keeping the snapshot continuously in sync would require one of:
  - a Render build command that runs the generator before publishing, or
  - a CMS publish hook/backend job that regenerates and commits the HTML.

Both are hosting/backend configuration changes and are outside the approved
implementation scope. Until one is added, run the generator manually as part of
the content deployment process.

This work does **not** make individual `/project?slug=<slug>` pages indexable.
`project.html` keeps its `noindex, follow` directive; consistent detail-page
indexability still requires prerendering/SSR or a hosting change.
