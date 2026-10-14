/**
 * admin.js
 * Admin dashboard UI. Handles sign-in, project CRUD, publish/unpublish and
 * authenticated previews against the private admin API.
 *
 * Authentication is carried by the server's HttpOnly session cookie, so a page
 * refresh keeps you signed in without storing anything in JS or web storage. On
 * load the UI asks the API whether the session cookie is still valid; logging
 * out asks the server to clear the cookie.
 */

import { createAdminApi, AdminApiError } from './admin-api.js';
import { resolveApiBase } from './api-config.js';

const api = createAdminApi();

const el = (id) => document.getElementById(id);

const dom = {
  configError: document.getElementById('config-error'),
  configMessage: document.getElementById('config-error-message'),
  setupView: document.getElementById('setup-view'),
  setupForm: document.getElementById('setup-form'),
  setupButton: document.getElementById('setup-button'),
  setupMessage: document.getElementById('setup-message'),
  loginView: document.getElementById('login-view'),
  loginForm: document.getElementById('login-form'),
  loginButton: document.getElementById('login-button'),
  loginMessage: document.getElementById('login-message'),
  logoutButton: document.getElementById('logout-button'),
  dashboardView: document.getElementById('dashboard-view'),
  newButton: document.getElementById('new-project-button'),
  refreshButton: document.getElementById('refresh-button'),
  statusMessage: document.getElementById('status-message'),
  rows: document.getElementById('project-rows'),
  emptyMessage: document.getElementById('empty-message'),
  editorView: document.getElementById('editor-view'),
  editorTitle: document.getElementById('editor-title'),
  form: document.getElementById('project-form'),
  saveButton: document.getElementById('save-button'),
  cancelButton: document.getElementById('cancel-button'),
};

let editingSlug = null;

function value(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function checked(id) {
  const el = document.getElementById(id);
  return Boolean(el && el.checked);
}

function setMessage(el, text, kind) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('error', 'ok');
  if (kind) el.classList.add(kind);
}

function clearFields(ids) {
  for (const id of ids) {
    const field = document.getElementById(id);
    if (field) field.value = '';
  }
}

function showSetup() {
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

  document.getElementById('field-title').value = project ? project.title : '';
  document.getElementById('field-slug').value = project ? project.slug : '';
  document.getElementById('field-status').value = project ? project.status : 'draft';
  document.getElementById('field-featured').checked = project ? project.featured === true : false;
  document.getElementById('field-order').value =
    project && Number.isFinite(project.order) ? String(project.order) : '';
  document.getElementById('field-description').value = project ? project.description || '' : '';
  document.getElementById('field-technologies').value = project
    ? (project.technologies || []).join(', ')
    : '';
  document.getElementById('field-images').value = project
    ? (project.images || [])
        .map((image) => (typeof image === 'string' ? image : `${image.src}${image.alt ? ` | ${image.alt}` : ''}`))
        .join('\n')
    : '';
  document.getElementById('field-site').value = project ? project.site || '' : '';
  document.getElementById('field-github').value = project ? project.github || '' : '';

  setMessage(dom.statusMessage, '');
  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = false;
  dom.editorView.hidden = false;
  document.getElementById('field-title').focus();
}

/** Build the API payload from the editor form. */
function collectPayload() {
  const images = value('field-images')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [src, ...rest] = line.split('|');
      const trimmedSrc = src.trim();
      const alt = rest.join('|').trim();
      return alt ? { src: trimmedSrc, alt } : trimmedSrc;
    });

  const technologies = value('field-technologies')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const payload = {
    title: value('field-title').trim(),
    status: value('field-status'),
    featured: checked('field-featured'),
    description: value('field-description').trim(),
    technologies,
    images,
    site: value('field-site').trim(),
    github: value('field-github').trim(),
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
  const status = error && error.status;
  if (status === 401) {
    showLogin();
    setMessage(dom.loginMessage, 'Your session has ended. Please sign in again.', 'error');
    return;
  }
  const message = error && error.message ? error.message : 'Something went wrong';
  setMessage(dom.statusMessage, message, 'error');
  setMessage(dom.loginMessage, message, 'error');
}

function wireEvents() {
  dom.setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(dom.setupMessage, '');
    const username = value('setup-username').trim();
    const password = value('setup-password');
    if (password !== value('setup-password-confirm')) {
      setMessage(dom.setupMessage, 'The passwords do not match.', 'error');
      return;
    }

    dom.setupButton.disabled = true;
    try {
      await api.setup(username, password);
      clearFields(['setup-username', 'setup-password', 'setup-password-confirm']);
      showDashboard();
      await loadProjects();
    } catch (error) {
      if (error && (error.code === 'SETUP_CLOSED' || error.status === 409)) {
        setMessage(dom.setupMessage, 'Administrator setup is already complete. Please sign in.', 'error');
        showLogin();
        return;
      }
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
      // Best-effort: the cookie is cleared server-side; if the call fails the
      // user still lands on the sign-in view.
    }
    showLogin();
    setMessage(dom.loginMessage, 'Signed out.', 'ok');
  });

  dom.newButton.addEventListener('click', () => showEditor(null));
  dom.refreshButton.addEventListener('click', loadProjects);

  dom.cancelButton.addEventListener('click', () => {
    dom.editorView.hidden = true;
    setMessage(dom.statusMessage, '');
  });

  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectPayload();
    if (!payload.title) {
      setMessage(dom.statusMessage, 'A title is required.', 'error');
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
      handleError(error);
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
      'No API base URL is configured. Set window.PORTFOLIO_API_BASE in admin.html to the deployed API origin.',
      'error'
    );
    return;
  }

  api.setBase(base);
  wireEvents();
  resolveView();
}

init();
