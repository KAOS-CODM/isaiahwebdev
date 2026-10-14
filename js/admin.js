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
 * publishing settings. Key features and technologies use repeatable controls;
 * images are uploaded to Cloudinary (multiple per project, with per-image alt
 * text, reorder, replace and remove) while a hosted URL can still be added by
 * hand. Uploads go through the authenticated admin API, so the session cookie
 * is the only credential and nothing sensitive touches JS.
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
  imagesMessage: el('images-message'),
  imagesEmpty: el('images-empty'),
  imagesHint: el('images-hint'),
  imageCount: el('image-count'),
  uploadImagesButton: el('upload-images-button'),
  addImageUrlButton: el('add-image-url-button'),
  imageUploadInput: el('image-upload-input'),
  addFeatureButton: el('add-feature-button'),
  addTechnologyButton: el('add-technology-button'),
};

/** Upload availability/limits, loaded lazily once the admin is signed in. */
let mediaConfig = null;
/** Number of image uploads currently in flight. */
let activeUploads = 0;

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

// ---------------------------------------------------------------------------
// Image editor (Cloudinary uploads + URL fallback)
// ---------------------------------------------------------------------------

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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function imageRows() {
  return dom.imagesEditor ? Array.from(dom.imagesEditor.querySelectorAll('.image-row')) : [];
}

function updateUploadAvailability(rows = imageRows().length, max = null) {
  const limit =
    max !== null
      ? max
      : mediaConfig && Number.isFinite(mediaConfig.maxImagesPerProject)
        ? mediaConfig.maxImagesPerProject
        : Infinity;
  const atLimit = rows >= limit;
  const configured = !mediaConfig || mediaConfig.configured !== false;
  const busy = activeUploads > 0;
  const disabled = busy || atLimit || !configured;

  if (dom.uploadImagesButton) {
    dom.uploadImagesButton.disabled = disabled;
    dom.uploadImagesButton.textContent = busy ? 'Uploading…' : 'Upload images';
  }
  if (dom.imageUploadInput) dom.imageUploadInput.disabled = disabled;
  if (dom.addImageUrlButton) dom.addImageUrlButton.disabled = atLimit;
}

function updateImageCount() {
  const rows = imageRows().length;
  const max =
    mediaConfig && Number.isFinite(mediaConfig.maxImagesPerProject)
      ? mediaConfig.maxImagesPerProject
      : null;
  if (dom.imageCount) {
    dom.imageCount.textContent = max
      ? `${rows} / ${max} images`
      : `${rows} image${rows === 1 ? '' : 's'}`;
  }
  if (dom.imagesEmpty) dom.imagesEmpty.hidden = rows > 0;
  updateUploadAvailability(rows, max);
}

function setRowStatus(row, text, kind) {
  const status = row.querySelector('.image-status');
  if (!status) return;
  status.textContent = text || '';
  status.classList.remove('uploading', 'error', 'ok');
  if (kind) status.classList.add(kind);
}

function moveRow(row, delta) {
  const parent = row.parentElement;
  if (!parent) return;
  const rows = Array.from(parent.children);
  const index = rows.indexOf(row);
  const target = index + delta;
  if (target < 0 || target >= rows.length) return;
  if (delta < 0) parent.insertBefore(row, rows[target]);
  else parent.insertBefore(rows[target], row);
  updateImageCount();
}

/** Normalize a stored image into the editor's row state. */
function normalizeEditorImage(image) {
  if (typeof image === 'string') {
    return { src: image, alt: '', publicId: '', origin: 'manual' };
  }
  const src = image && typeof image.src === 'string' ? image.src : '';
  const alt = image && typeof image.alt === 'string' ? image.alt : '';
  const publicId = image && typeof image.publicId === 'string' ? image.publicId : '';
  return { src, alt, publicId, origin: publicId ? 'saved' : 'manual' };
}

function addImageRow(image = {}) {
  if (!dom.imagesEditor) return null;

  const state = {
    src: image.src || '',
    alt: image.alt || '',
    publicId: image.publicId || '',
    origin: image.origin || (image.publicId ? 'saved' : 'manual'),
  };

  const row = document.createElement('div');
  row.className = 'image-row';
  row.__image = state;

  const preview = document.createElement('div');
  preview.className = 'image-preview placeholder';

  const fields = document.createElement('div');
  fields.className = 'image-fields';

  const urlInput = makeInput(state.src, 'https://res.cloudinary.com/.../image.jpg');
  urlInput.setAttribute('aria-label', 'Image URL');
  urlInput.addEventListener('input', () => {
    state.src = urlInput.value;
    state.publicId = '';
    state.origin = 'manual';
    updateImagePreview(preview, state.src);
  });

  const altInput = makeInput(state.alt, 'Describe the image for screen readers');
  altInput.setAttribute('aria-label', 'Alt text');
  altInput.maxLength = 300;
  altInput.addEventListener('input', () => {
    state.alt = altInput.value;
  });

  const status = document.createElement('span');
  status.className = 'image-status';

  const actions = document.createElement('div');
  actions.className = 'image-actions';

  const up = makeButton('Move up', '', () => moveRow(row, -1));
  up.setAttribute('aria-label', 'Move image up');
  const down = makeButton('Move down', '', () => moveRow(row, 1));
  down.setAttribute('aria-label', 'Move image down');

  const replaceInput = document.createElement('input');
  replaceInput.type = 'file';
  replaceInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
  replaceInput.hidden = true;
  const replace = makeButton('Replace', '', () => replaceInput.click());
  replace.setAttribute('aria-label', 'Replace image');
  replaceInput.addEventListener('change', async () => {
    const file = replaceInput.files && replaceInput.files[0];
    replaceInput.value = '';
    if (file) await uploadIntoRow(row, file, { replace: true });
  });

  const remove = makeButton('Remove', 'danger', () => removeImageRow(row));
  remove.setAttribute('aria-label', 'Remove image');

  actions.append(up, down, replace, remove);

  const urlField = labelledField('Image URL', urlInput);
  const altField = labelledField('Alt text', altInput);
  fields.append(urlField, altField, status, actions);

  row.__apply = () => {
    urlInput.value = state.src;
    urlField.hidden = Boolean(state.publicId) && state.origin !== 'manual';
    updateImagePreview(preview, state.src);
  };

  row.append(preview, fields);
  row.__apply();

  dom.imagesEditor.appendChild(row);
  updateImageCount();
  return row;
}

function renderImages(images) {
  if (!dom.imagesEditor) return;
  dom.imagesEditor.textContent = '';
  const list = Array.isArray(images) ? images : [];
  list.forEach((image) => addImageRow(normalizeEditorImage(image)));
  updateImageCount();
}

function readImages() {
  if (!dom.imagesEditor) return [];
  return imageRows()
    .map((row) => {
      const state = row.__image || {};
      const src = String(state.src || '').trim();
      if (!src) return null;
      const image = { src, alt: String(state.alt || '').trim() };
      if (state.publicId) image.publicId = state.publicId;
      return image;
    })
    .filter(Boolean);
}

function hasUnsavedUploads() {
  return imageRows().some((row) => row.__image && row.__image.origin === 'new');
}

/** Remove a row, releasing an unsaved upload immediately. */
function removeImageRow(row) {
  const state = row.__image;
  row.remove();
  updateImageCount();
  if (state && state.origin === 'new' && state.publicId) {
    api.deleteImage(state.publicId).catch(() => {});
  }
}

/** Reclaim every image uploaded during this session that was never saved. */
function discardNewUploads() {
  imageRows().forEach((row) => {
    const state = row.__image;
    if (state && state.origin === 'new') {
      if (state.publicId) api.deleteImage(state.publicId).catch(() => {});
      row.remove();
    }
  });
  updateImageCount();
}

/** Upload a single file into an existing row. */
async function uploadIntoRow(row, file, { replace = false } = {}) {
  if (!mediaConfig || mediaConfig.configured !== true) {
    setRowStatus(row, 'Image uploads are not configured on the API service.', 'error');
    return false;
  }
  if (activeUploads > 0) {
    setRowStatus(row, 'Please wait for the current upload to finish.', 'error');
    return false;
  }
  const max = mediaConfig.maxUploadBytes;
  if (max && file.size > max) {
    setRowStatus(
      row,
      `File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(max)}.`,
      'error'
    );
    return false;
  }

  activeUploads += 1;
  updateUploadAvailability();
  row.classList.add('pending');
  setRowStatus(row, replace ? 'Replacing…' : 'Uploading…', 'uploading');

  try {
    const data = await api.uploadImage(file, { slug: editingSlug || undefined });
    const image = data && data.image ? data.image : null;
    if (!image || !image.src) throw new Error('Upload did not return an image');

    const state = row.__image;
    state.src = image.src;
    state.publicId = image.publicId || '';
    state.origin = 'new';
    row.__apply();
    setRowStatus(row, 'Uploaded — remember to save.', 'ok');
    return true;
  } catch (error) {
    setRowStatus(row, error && error.message ? error.message : 'Upload failed', 'error');
    return false;
  } finally {
    activeUploads -= 1;
    row.classList.remove('pending');
    updateUploadAvailability();
  }
}

/** Upload every file chosen in one multi-select, one at a time. */
async function handleUploadSelection(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  if (!mediaConfig || mediaConfig.configured !== true) {
    setMessage(dom.imagesMessage, 'Image uploads are not configured on the API service.', 'error');
    return;
  }
  setMessage(dom.imagesMessage, '');

  const max = mediaConfig.maxImagesPerProject;
  for (const file of list) {
    if (Number.isFinite(max) && imageRows().length >= max) {
      setMessage(dom.imagesMessage, `You can add up to ${max} images per project.`, 'error');
      break;
    }
    const row = addImageRow({ origin: 'new' });
    // Sequential so the single-upload guard and progress state stay coherent.
    // eslint-disable-next-line no-await-in-loop
    await uploadIntoRow(row, file);
  }
}

/** Lazily load upload availability/limits once the admin is signed in. */
async function loadMediaConfig() {
  try {
    const data = await api.mediaConfig();
    mediaConfig =
      data && data.media
        ? data.media
        : { configured: false, allowedTypes: [], maxImagesPerProject: 50 };
  } catch {
    mediaConfig = { configured: false, allowedTypes: [], maxImagesPerProject: 50 };
  }

  if (mediaConfig.configured !== true) {
    if (dom.imagesHint) {
      dom.imagesHint.textContent =
        'Image uploads are not configured on the API service. You can still add hosted image URLs below.';
    }
    if (dom.uploadImagesButton) dom.uploadImagesButton.disabled = true;
    if (dom.imageUploadInput) dom.imageUploadInput.disabled = true;
  } else if (dom.imagesHint && Number.isFinite(mediaConfig.maxUploadBytes)) {
    dom.imagesHint.textContent =
      `Upload images up to ${formatBytes(mediaConfig.maxUploadBytes)} each ` +
      '(JPEG, PNG, WebP or GIF). Give each image descriptive alt text and use the move buttons to reorder.';
  }
  updateImageCount();
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
  setMessage(dom.imagesMessage, '');
  if (!mediaConfig) loadMediaConfig();

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

  dom.uploadImagesButton.addEventListener('click', () => dom.imageUploadInput.click());
  dom.imageUploadInput.addEventListener('change', async () => {
    // Snapshot the selection before resetting: `input.value = ''` empties the
    // input's live FileList, so reading `files` afterwards would yield nothing
    // and the upload would be skipped without any feedback.
    const files = Array.from(dom.imageUploadInput.files || []);
    dom.imageUploadInput.value = '';
    await handleUploadSelection(files);
  });
  dom.addImageUrlButton.addEventListener('click', () => {
    addImageRow({ origin: 'manual' });
    updateImageCount();
  });

  dom.cancelButton.addEventListener('click', () => {
    if (activeUploads > 0) {
      setMessage(dom.editorMessage, 'Please wait for image uploads to finish before cancelling.', 'error');
      return;
    }
    if (
      hasUnsavedUploads() &&
      !window.confirm(
        'Discard the newly uploaded images? They have not been saved to the project yet.'
      )
    ) {
      return;
    }
    discardNewUploads();
    editingSlug = null;
    dom.editorView.hidden = true;
    setMessage(dom.statusMessage, '');
  });

  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(dom.editorMessage, '');
    clearFieldError('field-title');

    if (activeUploads > 0) {
      setMessage(dom.editorMessage, 'Please wait for image uploads to finish before saving.', 'error');
      return;
    }

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
      const result = editingSlug
        ? await api.updateProject(editingSlug, payload)
        : await api.createProject(payload);

      const failed = result && result.media && Array.isArray(result.media.failed) ? result.media.failed : [];
      if (failed.length) {
        setMessage(
          dom.statusMessage,
          `Project saved, but ${failed.length} image${failed.length === 1 ? '' : 's'} could not be ` +
            'removed from storage. They will be retried the next time the project is saved.',
          'error'
        );
      } else {
        setMessage(dom.statusMessage, editingSlug ? 'Project updated' : 'Project created', 'ok');
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
