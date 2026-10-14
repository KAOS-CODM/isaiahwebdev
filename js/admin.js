/**
 * admin.js
 * Admin dashboard UI. Handles sign-in, project CRUD, publish/unpublish and
 * authenticated previews against the private admin API.
 *
 * Authentication is carried by the server's HttpOnly session cookie, so a page
 * refresh keeps you signed in without storing anything in JS or web storage. On
 * load the UI asks the API whether the session cookie is still valid; logging
 * out asks the server to clear the cookie.
 *
 * The editor is organised into the same sections as the project schema: basic
 * information, project details, technical information, links, images and
 * publishing settings. Key features, technologies and images use repeatable
 * controls; image URLs are entered by hand until Cloudinary uploads arrive in a
 * later milestone.
 */

import { createAdminApi } from './admin-api.js';
import { resolveApiBase } from './api-config.js';

const api = createAdminApi();

const el = (id) => document.getElementById(id);

const dom = {
  configError: el('config-error'),
  configMessage: el('config-error-message'),
  setupView: el('setup-view'),
  setupForm: el('setup-form'),
  setupButton: el('setup-button'),
  setupMessage: el('setup-message'),
  loginView: el('login-view'),
  loginForm: el('login-form'),
  loginButton: el('login-button'),
  loginMessage: el('login-message'),
  logoutButton: el('logout-button'),
  dashboardView: el('dashboard-view'),
  newButton: el('new-project-button'),
  refreshButton: el('refresh-button'),
  statusMessage: el('status-message'),
  rows: el('project-rows'),
  emptyMessage: el('empty-message'),
  editorView: el('editor-view'),
  editorTitle: el('editor-title'),
  editorMessage: el('editor-message'),
  form: el('project-form'),
  saveButton: el('save-button'),
  cancelButton: el('cancel-button'),
  featuresEditor: el('key-features-editor'),
  technologiesEditor: el('technologies-editor'),
  imagesEditor: el('images-editor'),
  addFeatureButton: el('add-feature-button'),
  addTechnologyButton: el('add-technology-button'),
  addImageButton: el('add-image-button'),
};

let editingSlug = null;

function value(id) {
  const element = el(id);
  return element ? element.value : '';
}

function checked(id) {
  const element = el(id);
  return Boolean(element && element.checked);
}

function setValue(id, val) {
  const element = el(id);
  if (element) element.value = val == null ? '' : String(val);
}

function setChecked(id, val) {
  const element = el(id);
  if (element) element.checked = Boolean(val);
}

function setMessage(node, text, kind) {
  if (!node) return;
  node.textContent = text || '';
  node.classList.remove('error', 'ok');
  if (kind) node.classList.add(kind);
}

function clearFields(ids) {
  ids.forEach((id) => setValue(id, ''));
}

function clearFieldError(id) {
  const node = el(id);
  if (node) node.classList.remove('field-error');
}

// ---------------------------------------------------------------------------
// Repeatable controls (key features, technologies, images)
// ---------------------------------------------------------------------------

function makeInput(value, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function addListRow(container, value = '') {
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'list-row';
  const input = makeInput(value, '');
  input.setAttribute('aria-label', 'Entry');
  row.append(input, makeButton('Remove', 'secondary', () => row.remove()));
  container.appendChild(row);
}

function renderList(container, values) {
  if (!container) return;
  container.textContent = '';
  const list = Array.isArray(values) ? values.filter((entry) => typeof entry === 'string') : [];
  if (list.length === 0) addListRow(container, '');
  else list.forEach((entry) => addListRow(container, entry));
}

function readList(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function updateImagePreview(preview, url) {
  const src = String(url || '').trim();
  preview.textContent = '';
  if (!src) {
    preview.className = 'image-preview placeholder';
    preview.textContent = 'No preview';
    return;
  }
  const img = document.createElement('img');
  img.alt = 'Image preview';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    preview.textContent = '';
    preview.className = 'image-preview placeholder';
    preview.textContent = 'No preview';
  });
  img.src = src;
  preview.className = 'image-preview';
  preview.appendChild(img);
}

function labelledField(labelText, input) {
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = labelText;
  label.appendChild(input);
  wrap.appendChild(label);
  return wrap;
}

function addImageRow(image = {}) {
  if (!dom.imagesEditor) return;
  const source = typeof image === 'string' ? { src: image, alt: '' } : image;

  const row = document.createElement('div');
  row.className = 'image-row';

  const preview = document.createElement('div');
  preview.className = 'image-preview placeholder';
  preview.textContent = 'No preview';

  const srcInput = makeInput(source.src || '', 'https://res.cloudinary.com/.../image.jpg');
  const altInput = makeInput(source.alt || '', 'Describe the image for screen readers');

  srcInput.addEventListener('input', () => updateImagePreview(preview, srcInput.value));
  updateImagePreview(preview, srcInput.value);

  const actions = document.createElement('div');
  actions.className = 'row-actions inline';
  actions.appendChild(makeButton('Remove image', 'secondary', () => row.remove()));

  const fields = document.createElement('div');
  fields.className = 'image-fields';
  fields.append(
    labelledField('Image URL', srcInput),
    labelledField('Alt text', altInput),
    actions
  );

  row.append(preview, fields);
  dom.imagesEditor.appendChild(row);
}

function renderImages(images) {
  if (!dom.imagesEditor) return;
  dom.imagesEditor.textContent = '';
  if (Array.isArray(images)) images.forEach((image) => addImageRow(image));
}

function readImages() {
  if (!dom.imagesEditor) return [];
  return Array.from(dom.imagesEditor.querySelectorAll('.image-row'))
    .map((row) => {
      const inputs = row.querySelectorAll('input');
      const src = inputs[0] ? inputs[0].value.trim() : '';
      const alt = inputs[1] ? inputs[1].value.trim() : '';
      return src ? { src, alt } : null;
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showSetup() {
  dom.configError.hidden = true;
  dom.setupView.hidden = false;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = true;
  dom.editorView.hidden = true;
  dom.logoutButton.hidden = true;
}

function showLogin() {
  dom.setupView.hidden = true;
  dom.loginView.hidden = false;
  dom.dashboardView.hidden = true;
  dom.editorView.hidden = true;
  dom.logoutButton.hidden = true;
}

function showDashboard() {
  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = false;
  dom.editorView.hidden = true;
  dom.logoutButton.hidden = false;
}

function showEditor(project) {
  editingSlug = project ? project.slug : null;
  dom.editorTitle.textContent = project ? `Edit “${project.title}”` : 'New project';
  setMessage(dom.editorMessage, '');
  clearFieldError('field-title');

  setValue('field-title', project ? project.title : '');
  setValue('field-slug', project ? project.slug : '');
  setValue('field-category', project ? project.category : '');
  setValue('field-shortDescription', project ? project.shortDescription || project.description : '');
  setValue('field-problemStatement', project ? project.problemStatement || project.problem : '');
  setValue('field-solution', project ? project.solution : '');
  setValue('field-role', project ? project.role : '');
  setValue('field-developmentStatus', project ? project.developmentStatus : '');
  setValue('field-liveUrl', project ? project.liveUrl || project.site : '');
  setValue('field-githubUrl', project ? project.githubUrl || project.github : '');
  setValue('field-status', project ? project.status : 'draft');
  setValue('field-order', project && Number.isFinite(Number(project.order)) ? String(project.order) : '');
  setChecked('field-featured', Boolean(project && project.featured === true));

  renderList(dom.featuresEditor, project ? project.keyFeatures : []);
  renderList(dom.technologiesEditor, project ? project.technologies : []);
  renderImages(project ? project.images : []);

  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = false;
  dom.editorView.hidden = false;

  const titleField = el('field-title');
  if (titleField) titleField.focus();
}

/** Build the API payload from the editor form. */
function collectPayload() {
  const payload = {
    title: value('field-title').trim(),
    shortDescription: value('field-shortDescription').trim(),
    category: value('field-category').trim(),
    problemStatement: value('field-problemStatement').trim(),
    solution: value('field-solution').trim(),
    keyFeatures: readList(dom.featuresEditor),
    technologies: readList(dom.technologiesEditor),
    role: value('field-role').trim(),
    developmentStatus: value('field-developmentStatus'),
    liveUrl: value('field-liveUrl').trim(),
    githubUrl: value('field-githubUrl').trim(),
    images: readImages(),
    status: value('field-status'),
    featured: checked('field-featured'),
  };

  const slug = value('field-slug').trim();
  if (slug) payload.slug = slug;

  const order = value('field-order').trim();
  if (order !== '') payload.order = Number(order);

  return payload;
}

function renderProjects(projects) {
  dom.rows.textContent = '';
  dom.emptyMessage.hidden = projects.length > 0;

  for (const project of projects) {
    const row = document.createElement('tr');

    const title = document.createElement('td');
    title.textContent = project.title;

    const slug = document.createElement('td');
    slug.textContent = project.slug;

    const statusCell = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${project.status === 'published' ? 'published' : 'draft'}`;
    pill.textContent = project.status;
    statusCell.appendChild(pill);

    const orderCell = document.createElement('td');
    orderCell.textContent = Number.isFinite(project.order) ? String(project.order) : '';

    const actions = document.createElement('td');
    actions.className = 'actions';

    actions.appendChild(actionButton('Edit', () => editProject(project.slug)));
    actions.appendChild(
      actionButton(
        project.status === 'published' ? 'Unpublish' : 'Publish',
        () =>
          project.status === 'published'
            ? run(() => api.unpublishProject(project.slug), 'Project unpublished')
            : run(() => api.publishProject(project.slug), 'Project published')
      )
    );
    actions.appendChild(actionButton('Preview', () => previewProject(project.slug)));
    actions.appendChild(actionButton('Delete', () => deleteProject(project), 'danger'));

    row.append(title, slug, statusCell, orderCell, actions);
    dom.rows.appendChild(row);
  }
}

function actionButton(label, handler, extraClass) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (extraClass) button.classList.add(extraClass);
  button.addEventListener('click', handler);
  return button;
}

async function loadProjects() {
  try {
    const data = await api.listProjects();
    renderProjects(Array.isArray(data && data.projects) ? data.projects : []);
    setMessage(dom.statusMessage, '');
  } catch (error) {
    handleError(error);
  }
}

/** Run an action, surface the result, then refresh. */
async function run(action, successMessage) {
  try {
    await action();
    setMessage(dom.statusMessage, successMessage, 'ok');
    await loadProjects();
  } catch (error) {
    handleError(error);
  }
}

async function editProject(slug) {
  try {
    const data = await api.getProject(slug);
    if (data && data.project) showEditor(data.project);
  } catch (error) {
    handleError(error);
  }
}

async function deleteProject(project) {
  if (!window.confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
  try {
    await api.deleteProject(project.slug);
    setMessage(dom.statusMessage, 'Project deleted', 'ok');
    await loadProjects();
    dom.editorView.hidden = true;
  } catch (error) {
    handleError(error);
  }
}

async function previewProject(slug) {
  try {
    const html = await api.previewHtml(slug);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    handleError(error);
  }
}

/** Map an error to a message, dropping the session on authentication failures. */
function handleError(error) {
  if (error && error.status === 401) {
    showLogin();
    setMessage(dom.loginMessage, error.message || 'Your session expired. Please sign in again.', 'error');
    return;
  }
  setMessage(dom.statusMessage, error && error.message ? error.message : 'Request failed', 'error');
}

function wireEvents() {
  dom.setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(dom.setupMessage, '');
    dom.setupButton.disabled = true;
    try {
      await api.setup(value('setup-username').trim(), value('setup-password'));
      clearFields(['setup-username', 'setup-password', 'setup-password-confirm']);
      showDashboard();
      await loadProjects();
    } catch (error) {
      setMessage(dom.setupMessage, error && error.message ? error.message : 'Setup failed', 'error');
    } finally {
      dom.setupButton.disabled = false;
    }
  });

  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(dom.loginMessage, '');
    dom.loginButton.disabled = true;
    try {
      await api.login(value('login-username').trim(), value('login-password'));
      clearFields(['login-username', 'login-password']);
      showDashboard();
      await loadProjects();
    } catch (error) {
      setMessage(dom.loginMessage, error && error.message ? error.message : 'Login failed', 'error');
    } finally {
      dom.loginButton.disabled = false;
    }
  });

  dom.logoutButton.addEventListener('click', async () => {
    try {
      await api.logout();
    } catch {
      // Best-effort: the cookie is cleared server-side; the user still sees the
      // signed-out view even if the request fails.
    }
    showLogin();
    setMessage(dom.loginMessage, 'Signed out.', 'ok');
  });

  dom.newButton.addEventListener('click', () => showEditor(null));
  dom.refreshButton.addEventListener('click', loadProjects);

  dom.addFeatureButton.addEventListener('click', () => addListRow(dom.featuresEditor, ''));
  dom.addTechnologyButton.addEventListener('click', () => addListRow(dom.technologiesEditor, ''));
  dom.addImageButton.addEventListener('click', () => addImageRow({}));

  dom.cancelButton.addEventListener('click', () => {
    editingSlug = null;
    dom.editorView.hidden = true;
    setMessage(dom.statusMessage, '');
  });

  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(dom.editorMessage, '');
    clearFieldError('field-title');

    const payload = collectPayload();
    if (!payload.title) {
      const titleField = el('field-title');
      if (titleField) {
        titleField.classList.add('field-error');
        titleField.focus();
      }
      setMessage(dom.editorMessage, 'A title is required.', 'error');
      return;
    }

    dom.saveButton.disabled = true;
    try {
      if (editingSlug) {
        await api.updateProject(editingSlug, payload);
        setMessage(dom.statusMessage, 'Project updated', 'ok');
      } else {
        await api.createProject(payload);
        setMessage(dom.statusMessage, 'Project created', 'ok');
      }
      editingSlug = null;
      dom.editorView.hidden = true;
      await loadProjects();
    } catch (error) {
      if (error && error.status === 401) {
        handleError(error);
      } else {
        setMessage(dom.editorMessage, error && error.message ? error.message : 'Save failed', 'error');
      }
    } finally {
      dom.saveButton.disabled = false;
    }
  });
}

/**
 * Decide the initial view: setup when no administrator exists yet, the
 * dashboard when the session cookie is still valid, otherwise the login form.
 */
async function resolveView() {
  try {
    const status = await api.bootstrapStatus();
    if (status && status.setupRequired) {
      showSetup();
      return;
    }
    try {
      await api.session();
      showDashboard();
      await loadProjects();
      return;
    } catch {
      // No valid session cookie; fall through to the sign-in form.
    }
    showLogin();
  } catch (error) {
    showLogin();
    setMessage(
      dom.loginMessage,
      error && error.message ? error.message : 'Unable to reach the API.',
      'error'
    );
  }
}

function init() {
  const base = resolveApiBase(window);
  if (!base) {
    dom.configError.hidden = false;
    setMessage(
      dom.configMessage,
      'No API base could be resolved. Set window.PORTFOLIO_API_BASE to the deployed API origin.',
      'error'
    );
    return;
  }
  api.setBase(base);
  wireEvents();
  resolveView();
}

init();
