
/**
 * admin.js
 * Admin dashboard UI for projects and certificates.
 *
 * Projects and certificates have separate editors, form submissions and API
 * workflows. The certificate editor markup lives in admin.html and is entirely
 * independent of the project editor.
 *
 * Authentication uses the server's HttpOnly session cookie.
 */

import { createAdminApi } from './admin-api.js';
import { resolveApiBase } from './api-config.js';
import {
  certificatePagePath,
  escapeHtml,
  isValidUrl,
} from './certificates-schema.js';

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
  dashboardCertificateButton: el('new-certificate-button'),
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

  certificatesView: el('certificates-view'),
  certificatesMessage: el('certificates-message'),
  certificatesTable: el('certificates-table'),
  certificatesTbody: el('certificates-tbody'),
  refreshCertificatesButton: el('refresh-certificates-button'),
  newCertificateButton: el('certificate-new-button'),
  certificatesDashboardButton: el('certificate-dashboard-button'),

  certificateEditor: el('certificate-editor'),
  certificateEditorTitle: el('certificate-editor-title'),
  certificateEditorMessage: el('certificate-editor-message'),
  certificateForm: el('certificate-form'),
  certificateSaveButton: el('certificate-save-button'),
  certificateCancelButton: el('certificate-cancel-button'),
  certificatePreviewButton: el('certificate-preview-button'),
  certificateFields: {
    title: el('certificate-field-title'),
    slug: el('certificate-field-slug'),
    issuer: el('certificate-field-issuer'),
    description: el('certificate-field-description'),
    issueDate: el('certificate-field-issueDate'),
    expiryDate: el('certificate-field-expiryDate'),
    credentialId: el('certificate-field-credentialId'),
    category: el('certificate-field-category'),
    skills: el('certificate-field-skills'),
    imageSrc: el('certificate-field-imageSrc'),
    imageAlt: el('certificate-field-imageAlt'),
    imagePublicId: el('certificate-field-imagePublicId'),
    verificationUrl: el('certificate-field-verificationUrl'),
    status: el('certificate-field-status'),
    displayOrder: el('certificate-field-displayOrder'),
  },
};

let mediaConfig = null;
let activeUploads = 0;

let editingSlug = null;
let editingCertificateSlug = null;
let certificateRecords = [];
let certificateSaving = false;

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

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

function setMessage(node, message, kind) {
  if (!node) return;

  node.textContent = message || '';
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

function actionButton(label, handler, extraClass) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;

  if (extraClass) button.classList.add(extraClass);

  button.addEventListener('click', handler);
  return button;
}

function handleError(error, messageTarget = dom.statusMessage) {
  if (error && error.status === 401) {
    showLogin();
    setMessage(
      dom.loginMessage,
      error.message || 'Your session expired. Please sign in again.',
      'error'
    );
    return;
  }

  setMessage(
    messageTarget,
    error && error.message ? error.message : 'Request failed',
    'error'
  );
}

// ---------------------------------------------------------------------------
// Repeatable project controls
// ---------------------------------------------------------------------------

function makeInput(inputValue, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = inputValue == null ? '' : String(inputValue);

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

function addListRow(container, inputValue = '') {
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'list-row';

  const input = makeInput(inputValue, '');
  input.setAttribute('aria-label', 'Entry');

  row.append(
    input,
    makeButton('Remove', 'secondary', () => row.remove())
  );

  container.appendChild(row);
}

function renderList(container, values) {
  if (!container) return;

  container.textContent = '';

  const list = Array.isArray(values)
    ? values.filter((entry) => typeof entry === 'string')
    : [];

  if (list.length === 0) {
    addListRow(container, '');
  } else {
    list.forEach((entry) => addListRow(container, entry));
  }
}

function readList(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Project image editor
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

  if (mb >= 1) {
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

function imageRows() {
  return dom.imagesEditor
    ? Array.from(dom.imagesEditor.querySelectorAll('.image-row'))
    : [];
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
    dom.uploadImagesButton.textContent = busy
      ? 'Uploading…'
      : 'Upload images';
  }

  if (dom.imageUploadInput) {
    dom.imageUploadInput.disabled = disabled;
  }

  if (dom.addImageUrlButton) {
    dom.addImageUrlButton.disabled = atLimit;
  }
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

  if (dom.imagesEmpty) {
    dom.imagesEmpty.hidden = rows > 0;
  }

  updateUploadAvailability(rows, max);
}

function setRowStatus(row, message, kind) {
  const status = row.querySelector('.image-status');
  if (!status) return;

  status.textContent = message || '';
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

  if (delta < 0) {
    parent.insertBefore(row, rows[target]);
  } else {
    parent.insertBefore(rows[target], row);
  }

  updateImageCount();
}

function normalizeEditorImage(image) {
  if (typeof image === 'string') {
    return {
      src: image,
      alt: '',
      publicId: '',
      origin: 'manual',
    };
  }

  const src = image && typeof image.src === 'string'
    ? image.src
    : '';

  const alt = image && typeof image.alt === 'string'
    ? image.alt
    : '';

  const publicId = image && typeof image.publicId === 'string'
    ? image.publicId
    : '';

  return {
    src,
    alt,
    publicId,
    origin: publicId ? 'saved' : 'manual',
  };
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

  const urlInput = makeInput(
    state.src,
    'https://res.cloudinary.com/.../image.jpg'
  );

  urlInput.setAttribute('aria-label', 'Image URL');

  urlInput.addEventListener('input', () => {
    state.src = urlInput.value;
    state.publicId = '';
    state.origin = 'manual';
    updateImagePreview(preview, state.src);
  });

  const altInput = makeInput(
    state.alt,
    'Describe the image for screen readers'
  );

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

    if (file) {
      await uploadIntoRow(row, file, { replace: true });
    }
  });

  const remove = makeButton(
    'Remove',
    'danger',
    () => removeImageRow(row)
  );

  remove.setAttribute('aria-label', 'Remove image');

  actions.append(up, down, replace, remove);

  fields.append(
    labelledField('Image URL', urlInput),
    labelledField('Alt text', altInput),
    status,
    actions
  );

  row.__apply = () => {
    urlInput.value = state.src;
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

  list.forEach((image) => {
    addImageRow(normalizeEditorImage(image));
  });

  updateImageCount();
}

function readImages() {
  if (!dom.imagesEditor) return [];

  return imageRows()
    .map((row) => {
      const state = row.__image || {};
      const src = String(state.src || '').trim();

      if (!src) return null;

      const image = {
        src,
        alt: String(state.alt || '').trim(),
      };

      if (state.publicId) {
        image.publicId = state.publicId;
      }

      return image;
    })
    .filter(Boolean);
}

function hasUnsavedUploads() {
  return imageRows().some(
    (row) => row.__image && row.__image.origin === 'new'
  );
}

function removeImageRow(row) {
  const state = row.__image;

  row.remove();
  updateImageCount();

  if (state && state.origin === 'new' && state.publicId) {
    api.deleteImage(state.publicId).catch(() => {});
  }
}

function discardNewUploads() {
  imageRows().forEach((row) => {
    const state = row.__image;

    if (state && state.origin === 'new') {
      if (state.publicId) {
        api.deleteImage(state.publicId).catch(() => {});
      }

      row.remove();
    }
  });

  updateImageCount();
}

async function uploadIntoRow(row, file, { replace = false } = {}) {
  if (!mediaConfig || mediaConfig.configured !== true) {
    setRowStatus(
      row,
      'Image uploads are not configured on the API service.',
      'error'
    );
    return false;
  }

  if (activeUploads > 0) {
    setRowStatus(
      row,
      'Please wait for the current upload to finish.',
      'error'
    );
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
    const data = await api.uploadImage(file, {
      slug: editingSlug || undefined,
    });

    const image = data && data.image ? data.image : null;

    if (!image || !image.src) {
      throw new Error('Upload did not return an image');
    }

    const state = row.__image;

    state.src = image.src;
    state.publicId = image.publicId || '';
    state.origin = 'new';

    row.__apply();

    setRowStatus(row, 'Uploaded. Remember to save.', 'ok');

    return true;
  } catch (error) {
    setRowStatus(
      row,
      error && error.message ? error.message : 'Upload failed',
      'error'
    );

    return false;
  } finally {
    activeUploads -= 1;
    row.classList.remove('pending');
    updateUploadAvailability();
  }
}

async function handleUploadSelection(files) {
  const list = Array.from(files || []);

  if (!list.length) return;

  if (!mediaConfig || mediaConfig.configured !== true) {
    setMessage(
      dom.imagesMessage,
      'Image uploads are not configured on the API service.',
      'error'
    );
    return;
  }

  setMessage(dom.imagesMessage, '');

  const max = mediaConfig.maxImagesPerProject;

  for (const file of list) {
    if (
      Number.isFinite(max) &&
      imageRows().length >= max
    ) {
      setMessage(
        dom.imagesMessage,
        `You can add up to ${max} images per project.`,
        'error'
      );
      break;
    }

    const row = addImageRow({ origin: 'new' });

    // Uploads are intentionally sequential.
    await uploadIntoRow(row, file);
  }
}

async function loadMediaConfig() {
  try {
    const data = await api.mediaConfig();

    mediaConfig = data && data.media
      ? data.media
      : {
          configured: false,
          allowedTypes: [],
          maxImagesPerProject: 50,
        };
  } catch {
    mediaConfig = {
      configured: false,
      allowedTypes: [],
      maxImagesPerProject: 50,
    };
  }

  if (mediaConfig.configured !== true) {
    if (dom.imagesHint) {
      dom.imagesHint.textContent =
        'Image uploads are not configured on the API service. You can still add hosted image URLs below.';
    }

    if (dom.uploadImagesButton) {
      dom.uploadImagesButton.disabled = true;
    }

    if (dom.imageUploadInput) {
      dom.imageUploadInput.disabled = true;
    }
  } else if (
    dom.imagesHint &&
    Number.isFinite(mediaConfig.maxUploadBytes)
  ) {
    dom.imagesHint.textContent =
      `Upload images up to ${formatBytes(mediaConfig.maxUploadBytes)} each ` +
      '(JPEG, PNG, WebP or GIF). Give each image descriptive alt text and use the move buttons to reorder.';
  }

  updateImageCount();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function hideCertificateViews() {
  if (dom.certificatesView) dom.certificatesView.hidden = true;
  if (dom.certificateEditor) dom.certificateEditor.hidden = true;
}

function showSetup() {
  dom.configError.hidden = true;
  dom.setupView.hidden = false;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = true;
  dom.editorView.hidden = true;
  hideCertificateViews();
  dom.logoutButton.hidden = true;
}

function showLogin() {
  dom.setupView.hidden = true;
  dom.loginView.hidden = false;
  dom.dashboardView.hidden = true;
  dom.editorView.hidden = true;
  hideCertificateViews();
  dom.logoutButton.hidden = true;
}

function showDashboard() {
  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = false;
  dom.editorView.hidden = true;
  hideCertificateViews();
  dom.logoutButton.hidden = false;
}

function showEditor(project) {
  editingSlug = project ? project.slug : null;

  dom.editorTitle.textContent = project
    ? `Edit “${project.title}”`
    : 'New project';

  setMessage(dom.editorMessage, '');
  clearFieldError('field-title');

  setValue('field-title', project ? project.title : '');
  setValue('field-slug', project ? project.slug : '');
  setValue('field-category', project ? project.category : '');

  setValue(
    'field-shortDescription',
    project ? project.shortDescription || project.description : ''
  );

  setValue(
    'field-problemStatement',
    project ? project.problemStatement || project.problem : ''
  );

  setValue('field-solution', project ? project.solution : '');
  setValue('field-role', project ? project.role : '');

  setValue(
    'field-developmentStatus',
    project ? project.developmentStatus : ''
  );

  setValue(
    'field-liveUrl',
    project ? project.liveUrl || project.site : ''
  );

  setValue(
    'field-githubUrl',
    project ? project.githubUrl || project.github : ''
  );

  setValue('field-status', project ? project.status : 'draft');

  setValue(
    'field-order',
    project && Number.isFinite(Number(project.order))
      ? String(project.order)
      : ''
  );

  setChecked(
    'field-featured',
    Boolean(project && project.featured === true)
  );

  renderList(dom.featuresEditor, project ? project.keyFeatures : []);
  renderList(dom.technologiesEditor, project ? project.technologies : []);
  renderImages(project ? project.images : []);

  setMessage(dom.imagesMessage, '');

  if (!mediaConfig) {
    loadMediaConfig();
  }

  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = true;
  hideCertificateViews();
  dom.editorView.hidden = false;
  dom.logoutButton.hidden = false;

  const titleField = el('field-title');

  if (titleField) titleField.focus();
}

function showCertificatesView() {
  dom.setupView.hidden = true;
  dom.loginView.hidden = true;
  dom.dashboardView.hidden = true;
  dom.editorView.hidden = true;
  dom.certificatesView.hidden = false;
  dom.logoutButton.hidden = false;

  showCertificateList();
  showCertificatesLoading();
  loadCertificates();
}

// ---------------------------------------------------------------------------
// Project editor and CRUD
// ---------------------------------------------------------------------------

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

  if (order !== '') {
    payload.order = Number(order);
  }

  return payload;
}

function renderProjects(projects) {
  dom.rows.textContent = '';
  dom.emptyMessage.hidden = projects.length > 0;

  for (const project of projects) {
    const row = document.createElement('tr');

    const title = document.createElement('td');
    title.textContent = project.title || '';

    const slug = document.createElement('td');
    slug.textContent = project.slug || '';

    const statusCell = document.createElement('td');
    const pill = document.createElement('span');

    pill.className =
      `pill ${project.status === 'published' ? 'published' : 'draft'}`;

    pill.textContent = project.status || 'draft';
    statusCell.appendChild(pill);

    const orderCell = document.createElement('td');

    orderCell.textContent = Number.isFinite(project.order)
      ? String(project.order)
      : '';

    const actions = document.createElement('td');
    actions.className = 'actions';

    actions.appendChild(
      actionButton('Edit', () => editProject(project.slug))
    );

    actions.appendChild(
      actionButton(
        project.status === 'published' ? 'Unpublish' : 'Publish',
        () => (
          project.status === 'published'
            ? run(
                () => api.unpublishProject(project.slug),
                'Project unpublished'
              )
            : run(
                () => api.publishProject(project.slug),
                'Project published'
              )
        )
      )
    );

    actions.appendChild(
      actionButton('Preview', () => previewProject(project.slug))
    );

    actions.appendChild(
      actionButton(
        'Delete',
        () => deleteProject(project),
        'danger'
      )
    );

    row.append(title, slug, statusCell, orderCell, actions);
    dom.rows.appendChild(row);
  }
}

async function loadProjects() {
  try {
    const data = await api.listProjects();

    renderProjects(
      Array.isArray(data && data.projects)
        ? data.projects
        : []
    );

    setMessage(dom.statusMessage, '');
  } catch (error) {
    handleError(error);
  }
}

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

    if (data && data.project) {
      showEditor(data.project);
    }
  } catch (error) {
    handleError(error);
  }
}

async function deleteProject(project) {
  if (
    !window.confirm(
      `Delete “${project.title}”? This cannot be undone.`
    )
  ) {
    return;
  }

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

    const blob = new Blob([html], {
      type: 'text/html',
    });

    const url = URL.createObjectURL(blob);

    window.open(url, '_blank', 'noopener');

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    handleError(error);
  }
}

// ---------------------------------------------------------------------------
// Certificate editor helpers
// ---------------------------------------------------------------------------

/** Read the certificate `image` object from either the canonical or legacy shape. */
function certificateImage(cert) {
  if (!cert) return null;
  if (typeof cert.image === 'string') {
    return isValidUrl(cert.image) ? { src: cert.image, alt: '' } : null;
  }
  if (cert.image && typeof cert.image === 'object' && cert.image.src) {
    return cert.image;
  }
  const legacy = Array.isArray(cert.images) ? cert.images[0] : null;
  return legacy && typeof legacy === 'object' && legacy.src ? legacy : null;
}

function setCertificateField(name, fieldValue) {
  const field = dom.certificateFields[name];

  if (!field) return;

  field.value = fieldValue == null ? '' : String(fieldValue);

  if (name === 'imageSrc') {
    field.dataset.original = field.value;
  }
}

function getCertificateField(name) {
  const field = dom.certificateFields[name];

  return field ? String(field.value).trim() : '';
}

function clearCertificateFieldErrors() {
  Object.values(dom.certificateFields).forEach((field) => {
    if (field && typeof field.classList !== 'undefined') {
      field.classList.remove('field-error');
    }
  });
}

function markCertificateFieldError(name) {
  const field = dom.certificateFields[name];

  if (field) {
    field.classList.add('field-error');
    field.focus();
  }
}

function parseSkills(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isValidDateValue(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function buildCertificateImagePayload() {
  const src = getCertificateField('imageSrc');

  if (!src) return null;

  const image = {
    src,
    alt: getCertificateField('imageAlt'),
  };

  const srcField = dom.certificateFields.imageSrc;
  const srcChanged = !srcField || src !== (srcField.dataset.original || '');
  const publicId = srcChanged ? '' : getCertificateField('imagePublicId');

  if (publicId) image.publicId = publicId;

  return image;
}

function showCertificateList() {
  if (dom.certificateEditor) dom.certificateEditor.hidden = true;
  if (dom.certificatesTable) dom.certificatesTable.hidden = false;
  if (dom.certificatesView) dom.certificatesView.hidden = false;
}

function showCertificateEditor(cert = null) {
  editingCertificateSlug = cert ? cert.slug : null;

  if (dom.certificateEditorTitle) {
    dom.certificateEditorTitle.textContent = cert
      ? `Edit “${cert.title || 'certificate'}”`
      : 'New certificate';
  }

  setMessage(dom.certificateEditorMessage, '');
  clearCertificateFieldErrors();

  const image = certificateImage(cert);

  setCertificateField('title', cert ? cert.title : '');
  setCertificateField('slug', cert ? cert.slug : '');
  setCertificateField('issuer', cert ? cert.issuer : '');
  setCertificateField('description', cert ? cert.description : '');
  setCertificateField('issueDate', cert ? cert.issueDate : '');
  setCertificateField('expiryDate', cert ? cert.expiryDate : '');
  setCertificateField('credentialId', cert ? cert.credentialId : '');
  setCertificateField('category', cert ? cert.category : '');
  setCertificateField(
    'skills',
    cert && Array.isArray(cert.skills) ? cert.skills.join(', ') : ''
  );
  setCertificateField('imageSrc', image ? image.src : '');
  setCertificateField('imageAlt', image ? image.alt : '');
  setCertificateField('imagePublicId', image ? image.publicId : '');
  setCertificateField('verificationUrl', cert ? cert.verificationUrl : '');
  setCertificateField(
    'status',
    cert && cert.status === 'published' ? 'published' : 'draft'
  );
  setCertificateField(
    'displayOrder',
    cert && cert.displayOrder != null ? cert.displayOrder : ''
  );

  if (dom.certificatesTable) dom.certificatesTable.hidden = true;
  if (dom.certificatesView) dom.certificatesView.hidden = false;
  if (dom.certificateEditor) dom.certificateEditor.hidden = false;

  const titleField = dom.certificateFields.title;

  if (titleField) titleField.focus();
}

function collectCertificatePayload() {
  return {
    title: getCertificateField('title'),
    issuer: getCertificateField('issuer'),
    description: getCertificateField('description'),
    issueDate: getCertificateField('issueDate'),
    expiryDate: getCertificateField('expiryDate'),
    credentialId: getCertificateField('credentialId'),
    category: getCertificateField('category'),
    skills: parseSkills(getCertificateField('skills')),
    image: buildCertificateImagePayload(),
    verificationUrl: getCertificateField('verificationUrl'),
    status: getCertificateField('status') || 'draft',
    displayOrder: Number(getCertificateField('displayOrder')),
    ...(getCertificateField('slug') ? { slug: getCertificateField('slug') } : {}),
  };
}

/** Validate the dedicated certificate form. Returns an error message or null. */
function validateCertificatePayload(payload) {
  if (!payload.title) {
    markCertificateFieldError('title');
    return 'A certificate title is required.';
  }
  if (!payload.issuer) {
    markCertificateFieldError('issuer');
    return 'An issuer is required.';
  }
  if (!payload.image && !payload.verificationUrl) {
    markCertificateFieldError('imageSrc');
    return 'Provide an image URL or a verification URL.';
  }
  if (payload.image && !isValidUrl(payload.image.src)) {
    markCertificateFieldError('imageSrc');
    return 'The image URL must be a valid http(s) URL.';
  }
  if (payload.verificationUrl && !isValidUrl(payload.verificationUrl)) {
    markCertificateFieldError('verificationUrl');
    return 'The verification URL must be a valid http(s) URL.';
  }
  if (!isValidDateValue(payload.issueDate)) {
    markCertificateFieldError('issueDate');
    return 'The issue date must be a valid date.';
  }
  if (!isValidDateValue(payload.expiryDate)) {
    markCertificateFieldError('expiryDate');
    return 'The expiry date must be a valid date.';
  }
  if (!Number.isFinite(payload.displayOrder)) {
    markCertificateFieldError('displayOrder');
    return 'Display order must be a number.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Certificate CRUD and display
// ---------------------------------------------------------------------------

function certificateOrder(cert) {
  const order = Number(cert && cert.displayOrder);

  return Number.isFinite(order) ? order : 0;
}

function sortCertificateRecords(list) {
  return list.slice().sort((a, b) => {
    const aPublished = a.status === 'published' ? 0 : 1;
    const bPublished = b.status === 'published' ? 0 : 1;

    if (aPublished !== bPublished) return aPublished - bPublished;

    const orderDiff = certificateOrder(a) - certificateOrder(b);

    if (orderDiff !== 0) return orderDiff;

    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function renderCertificateRow(cert, index, total) {
  const row = document.createElement('tr');

  const titleCell = document.createElement('td');
  titleCell.textContent = cert.title || '';

  const issuerCell = document.createElement('td');
  issuerCell.textContent = cert.issuer || '';

  const statusCell = document.createElement('td');
  const pill = document.createElement('span');

  pill.className = `pill ${cert.status === 'published' ? 'published' : 'draft'}`;
  pill.textContent = cert.status || 'draft';
  statusCell.appendChild(pill);

  const orderCell = document.createElement('td');
  orderCell.textContent = Number.isFinite(Number(cert.displayOrder))
    ? String(cert.displayOrder)
    : '';

  const actionsCell = document.createElement('td');
  actionsCell.className = 'actions';

  actionsCell.appendChild(
    actionButton('Edit', () => editCertificate(cert.slug))
  );

  actionsCell.appendChild(
    actionButton(
      cert.status === 'published' ? 'Unpublish' : 'Publish',
      () => toggleCertificateStatus(cert.slug, cert.status)
    )
  );

  actionsCell.appendChild(
    actionButton('Preview', () => previewCertificate(cert.slug))
  );

  const upButton = actionButton('Up', () => moveCertificateOrder(index, -1));
  upButton.disabled = index === 0;
  actionsCell.appendChild(upButton);

  const downButton = actionButton('Down', () => moveCertificateOrder(index, 1));
  downButton.disabled = index === total - 1;
  actionsCell.appendChild(downButton);

  actionsCell.appendChild(
    actionButton('Delete', () => deleteCertificate(cert), 'danger')
  );

  row.append(titleCell, issuerCell, statusCell, orderCell, actionsCell);
  return row;
}

function renderCertificatesTable(certificates) {
  if (!dom.certificatesTbody) return;

  dom.certificatesTbody.textContent = '';

  const list = Array.isArray(certificates) ? certificates.slice() : [];

  certificateRecords = sortCertificateRecords(list);

  if (certificateRecords.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.colSpan = 5;
    cell.className = 'muted';
    cell.textContent = 'No certificates yet. Create your first certificate.';

    row.appendChild(cell);
    dom.certificatesTbody.appendChild(row);
    return;
  }

  certificateRecords.forEach((cert, index) => {
    dom.certificatesTbody.appendChild(
      renderCertificateRow(cert, index, certificateRecords.length)
    );
  });
}

function showCertificatesLoading() {
  if (!dom.certificatesTbody) return;

  dom.certificatesTbody.textContent = '';

  const row = document.createElement('tr');
  const cell = document.createElement('td');

  cell.colSpan = 5;
  cell.className = 'muted';
  cell.textContent = 'Loading certificates…';

  row.appendChild(cell);
  dom.certificatesTbody.appendChild(row);
}

async function loadCertificates({ successMessage = '' } = {}) {
  try {
    if (!successMessage) {
      setMessage(dom.certificatesMessage, 'Loading certificates…');
    }

    const data = await api.listCertificates();

    renderCertificatesTable(
      data && Array.isArray(data.certificates) ? data.certificates : []
    );

    setMessage(dom.certificatesMessage, successMessage, successMessage ? 'ok' : '');
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

async function editCertificate(slug) {
  try {
    const data = await api.getCertificate(slug);

    if (!data || !data.certificate) {
      throw new Error('The certificate was not returned by the API.');
    }

    showCertificateEditor(data.certificate);
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

function cancelCertificateEdit() {
  editingCertificateSlug = null;
  setMessage(dom.certificateEditorMessage, '');
  clearCertificateFieldErrors();
  showCertificateList();
}

async function saveCertificate(event) {
  event.preventDefault();

  if (certificateSaving) return;

  clearCertificateFieldErrors();
  setMessage(dom.certificateEditorMessage, '');

  const payload = collectCertificatePayload();
  const validationError = validateCertificatePayload(payload);

  if (validationError) {
    setMessage(dom.certificateEditorMessage, validationError, 'error');
    return;
  }

  const wasEditing = Boolean(editingCertificateSlug);
  const saveButton = dom.certificateSaveButton;

  certificateSaving = true;
  if (saveButton) saveButton.disabled = true;

  try {
    const result = wasEditing
      ? await api.updateCertificate(editingCertificateSlug, payload)
      : await api.createCertificate(payload);

    const saved = result && result.certificate;

    if (saved && saved.slug) editingCertificateSlug = saved.slug;
    editingCertificateSlug = null;

    showCertificateList();
    await loadCertificates({
      successMessage: wasEditing
        ? 'Certificate updated.'
        : 'Certificate created.',
    });
  } catch (error) {
    if (error && error.status === 401) {
      handleError(error, dom.certificateEditorMessage);
    } else {
      setMessage(
        dom.certificateEditorMessage,
        error && error.message
          ? error.message
          : 'Certificate could not be saved.',
        'error'
      );
    }
  } finally {
    certificateSaving = false;
    if (saveButton) saveButton.disabled = false;
  }
}

async function setCertificateStatus(slug, status) {
  try {
    if (status === 'published') {
      await api.publishCertificate(slug);
    } else {
      await api.unpublishCertificate(slug);
    }

    await loadCertificates({
      successMessage:
        status === 'published'
          ? 'Certificate published.'
          : 'Certificate unpublished.',
    });
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

function publishCertificate(slug) {
  return setCertificateStatus(slug, 'published');
}

function unpublishCertificate(slug) {
  return setCertificateStatus(slug, 'draft');
}

function toggleCertificateStatus(slug, currentStatus) {
  return currentStatus === 'published'
    ? unpublishCertificate(slug)
    : publishCertificate(slug);
}

async function moveCertificateOrder(index, delta) {
  const list = sortCertificateRecords(certificateRecords);
  const target = index + delta;

  if (target < 0 || target >= list.length) return;

  const current = list[index];
  const other = list[target];
  const currentOrder = certificateOrder(current);
  const otherOrder = certificateOrder(other);

  const items =
    currentOrder === otherOrder
      ? [
          { slug: current.slug, displayOrder: index },
          { slug: other.slug, displayOrder: target },
        ]
      : [
          { slug: current.slug, displayOrder: otherOrder },
          { slug: other.slug, displayOrder: currentOrder },
        ];

  try {
    await api.reorderCertificates(items);
    await loadCertificates({ successMessage: 'Certificate order updated.' });
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

async function deleteCertificate(cert) {
  const title = cert.title || cert.slug;

  if (
    !window.confirm(`Delete “${title}”? This cannot be undone.`)
  ) {
    return;
  }

  try {
    await api.deleteCertificate(cert.slug);

    await loadCertificates({ successMessage: 'Certificate deleted.' });
    showCertificateList();
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

function openRenderedPreview(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Certificate preview is generated from the certificate record or the editor
 * form. It never uses the project-only previewHtml endpoint.
 */
function renderCertificatePreview(cert, { saved = true } = {}) {
  const image = certificateImage(cert);
  const imageMarkup = image && image.src
    ? `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || cert.title || 'Certificate')}" />`
    : '';

  const verificationMarkup = cert.verificationUrl
    ? `<p><a href="${escapeHtml(cert.verificationUrl)}" target="_blank" rel="noopener noreferrer">Verify certificate</a></p>`
    : '';

  const skillsMarkup = Array.isArray(cert.skills) && cert.skills.length
    ? `<p>${escapeHtml(cert.skills.join(', '))}</p>`
    : '';

  const publicLinkMarkup =
    saved && cert.slug && cert.status === 'published'
      ? `<p><a href="${escapeHtml(certificatePagePath(cert.slug))}" target="_blank" rel="noopener noreferrer">Open public certificate page</a></p>`
      : saved
        ? '<p class="muted">Draft preview only: the public page is unavailable until this certificate is published.</p>'
        : '<p class="muted">Unsaved preview: save the certificate before publishing it.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(cert.title || 'Certificate preview')}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem;
      background: #0f1115;
      color: #e6e8ec;
      font-family: system-ui, sans-serif;
      line-height: 1.6;
    }
    main {
      max-width: 760px;
      margin: 2rem auto;
      padding: 2rem;
      background: #171a21;
      border: 1px solid #2b303b;
      border-radius: 12px;
    }
    h1 { margin-top: 0; }
    .muted { color: #9aa0ab; }
    img {
      display: block;
      max-width: 100%;
      max-height: 520px;
      object-fit: contain;
      margin: 1.5rem auto;
      border-radius: 8px;
    }
    a { color: #4f8cff; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(cert.title || '')}</h1>
    <p class="muted">${escapeHtml(cert.issuer || '')}</p>
    ${imageMarkup}
    <p>${escapeHtml(cert.description || '')}</p>
    <p class="muted">Issued: ${escapeHtml(cert.issueDate || 'Not specified')}</p>
    <p class="muted">Expires: ${escapeHtml(cert.expiryDate || 'Not specified')}</p>
    <p class="muted">Credential ID: ${escapeHtml(cert.credentialId || 'Not specified')}</p>
    <p class="muted">Category: ${escapeHtml(cert.category || 'Not specified')}</p>
    ${skillsMarkup}
    ${verificationMarkup}
    ${publicLinkMarkup}
  </main>
</body>
</html>`;

  openRenderedPreview(html);
}

async function previewCertificate(slug) {
  try {
    const data = await api.getCertificate(slug);

    if (!data || !data.certificate) {
      throw new Error('Certificate details were not returned by the API.');
    }

    renderCertificatePreview(data.certificate, { saved: true });
  } catch (error) {
    handleError(error, dom.certificatesMessage);
  }
}

function previewCertificateFromForm() {
  clearCertificateFieldErrors();
  setMessage(dom.certificateEditorMessage, '');

  const payload = collectCertificatePayload();
  const validationError = validateCertificatePayload(payload);

  if (validationError) {
    setMessage(dom.certificateEditorMessage, validationError, 'error');
    return;
  }

  renderCertificatePreview(
    { ...payload, slug: editingCertificateSlug || '' },
    { saved: Boolean(editingCertificateSlug) }
  );
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wireEvents() {
  dom.setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    setMessage(dom.setupMessage, '');

    const password = value('setup-password');
    const confirmation = value('setup-password-confirm');

    if (password !== confirmation) {
      setMessage(
        dom.setupMessage,
        'The passwords do not match.',
        'error'
      );
      return;
    }

    dom.setupButton.disabled = true;

    try {
      await api.setup(
        value('setup-username').trim(),
        password
      );

      clearFields([
        'setup-username',
        'setup-password',
        'setup-password-confirm',
      ]);

      showDashboard();
      await loadProjects();
    } catch (error) {
      setMessage(
        dom.setupMessage,
        error && error.message
          ? error.message
          : 'Setup failed',
        'error'
      );
    } finally {
      dom.setupButton.disabled = false;
    }
  });

  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    setMessage(dom.loginMessage, '');
    dom.loginButton.disabled = true;

    try {
      await api.login(
        value('login-username').trim(),
        value('login-password')
      );

      clearFields([
        'login-username',
        'login-password',
      ]);

      showDashboard();
      await loadProjects();
    } catch (error) {
      setMessage(
        dom.loginMessage,
        error && error.message
          ? error.message
          : 'Login failed',
        'error'
      );
    } finally {
      dom.loginButton.disabled = false;
    }
  });

  dom.logoutButton.addEventListener('click', async () => {
    try {
      await api.logout();
    } catch {
      // Best-effort logout. The signed-out view is still displayed.
    }

    showLogin();
    setMessage(dom.loginMessage, 'Signed out.', 'ok');
  });

  dom.newButton.addEventListener('click', () => {
    showEditor(null);
  });

  dom.dashboardCertificateButton.addEventListener('click', () => {
    showCertificatesView();
  });

  dom.newCertificateButton.addEventListener('click', () => {
    showCertificateEditor(null);
  });

  dom.certificatesDashboardButton.addEventListener('click', () => {
    showDashboard();
  });

  dom.refreshButton.addEventListener('click', loadProjects);

  dom.refreshCertificatesButton.addEventListener('click', () => {
    showCertificatesLoading();
    loadCertificates();
  });

  dom.addFeatureButton.addEventListener('click', () => {
    addListRow(dom.featuresEditor, '');
  });

  dom.addTechnologyButton.addEventListener('click', () => {
    addListRow(dom.technologiesEditor, '');
  });

  dom.uploadImagesButton.addEventListener('click', () => {
    dom.imageUploadInput.click();
  });

  dom.imageUploadInput.addEventListener('change', async () => {
    const files = Array.from(
      dom.imageUploadInput.files || []
    );

    dom.imageUploadInput.value = '';

    await handleUploadSelection(files);
  });

  dom.addImageUrlButton.addEventListener('click', () => {
    addImageRow({ origin: 'manual' });
    updateImageCount();
  });

  dom.cancelButton.addEventListener('click', () => {
    if (activeUploads > 0) {
      setMessage(
        dom.editorMessage,
        'Please wait for image uploads to finish before cancelling.',
        'error'
      );
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

  // Project form submission only handles projects.
  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    setMessage(dom.editorMessage, '');
    clearFieldError('field-title');

    if (activeUploads > 0) {
      setMessage(
        dom.editorMessage,
        'Please wait for image uploads to finish before saving.',
        'error'
      );
      return;
    }

    const payload = collectPayload();

    if (!payload.title) {
      const titleField = el('field-title');

      if (titleField) {
        titleField.classList.add('field-error');
        titleField.focus();
      }

      setMessage(
        dom.editorMessage,
        'A title is required.',
        'error'
      );

      return;
    }

    dom.saveButton.disabled = true;

    try {
      const result = editingSlug
        ? await api.updateProject(editingSlug, payload)
        : await api.createProject(payload);

      const failed =
        result &&
        result.media &&
        Array.isArray(result.media.failed)
          ? result.media.failed
          : [];

      if (failed.length) {
        setMessage(
          dom.statusMessage,
          `Project saved, but ${failed.length} image${failed.length === 1 ? '' : 's'} could not be removed from storage. They will be retried the next time the project is saved.`,
          'error'
        );
      } else {
        setMessage(
          dom.statusMessage,
          editingSlug ? 'Project updated' : 'Project created',
          'ok'
        );
      }

      editingSlug = null;
      dom.editorView.hidden = true;

      await loadProjects();
    } catch (error) {
      if (error && error.status === 401) {
        handleError(error, dom.editorMessage);
      } else {
        setMessage(
          dom.editorMessage,
          error && error.message
            ? error.message
            : 'Save failed',
          'error'
        );
      }
    } finally {
      dom.saveButton.disabled = false;
    }
  });

  // Certificate form handling is completely separate from project saving.
  if (dom.certificateForm) {
    dom.certificateForm.addEventListener('submit', saveCertificate);
  }

  if (dom.certificateCancelButton) {
    dom.certificateCancelButton.addEventListener('click', cancelCertificateEdit);
  }

  if (dom.certificatePreviewButton) {
    dom.certificatePreviewButton.addEventListener('click', previewCertificateFromForm);
  }

  Object.entries(dom.certificateFields).forEach(([name, field]) => {
    if (!field) return;

    const clearError = () => {
      field.classList.remove('field-error');
    };

    field.addEventListener('input', clearError);
    field.addEventListener('change', clearError);

    if (name === 'imageSrc') {
      field.addEventListener('input', () => {
        // Prevent a previously uploaded asset from being reused for a new URL.
        const publicIdField = dom.certificateFields.imagePublicId;

        if (publicIdField) publicIdField.value = '';
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Initial view
// ---------------------------------------------------------------------------

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
      // No valid session cookie. Continue to login.
    }

    showLogin();
  } catch (error) {
    showLogin();

    setMessage(
      dom.loginMessage,
      error && error.message
        ? error.message
        : 'Unable to reach the API.',
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
