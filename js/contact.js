document.addEventListener('DOMContentLoaded', () => {
    setupCopyButtons();
    setupFieldValidation();
    setupBackToTop();
});

/* =========================
COPY BUTTONS
========================= */
function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    const copyFeedback = document.getElementById('copyFeedback');
    if (!copyButtons.length || !copyFeedback) return;

    copyButtons.forEach(button => {
        button.addEventListener('click', async function () {
            const textToCopy = this.getAttribute('data-copy');

            try {
                await navigator.clipboard.writeText(textToCopy);
                showCopySuccess(this, copyFeedback);
            } catch (err) {
                fallbackCopy(textToCopy, this, copyFeedback);
            }
        });
    });
}

function fallbackCopy(text, button, copyFeedback) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        showCopySuccess(button, copyFeedback);
    } catch (err) {
        console.error('Copy failed:', err);
    }

    document.body.removeChild(textArea);
}

function showCopySuccess(button, copyFeedback) {
    const original = button.innerHTML;

    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
    button.classList.add('copied');
    copyFeedback.classList.add('show');

    setTimeout(() => {
        button.innerHTML = original;
        button.classList.remove('copied');
    }, 2000);

    setTimeout(() => {
        copyFeedback.classList.remove('show');
    }, 3000);
}

/* =========================
VALIDATION (UI ONLY)
========================= */
function setupFieldValidation() {
    document.querySelectorAll('input, textarea').forEach(field => {
        field.addEventListener('input', () => {
            const errorId = field.id + 'Error';
            const errorElement = document.getElementById(errorId);

            if (errorElement) {
                errorElement.classList.add('hidden');
            }

            field.style.borderColor = 'rgba(255,255,255,0.2)';
            field.style.boxShadow = 'none';
        });
    });
}

function showSuccess() {
    console.log("SUCCESS TRIGGERED");

    if (successBox) {
        successBox.classList.remove('hidden');
        successBox.style.display = 'block';
        successBox.style.opacity = '1';
        successBox.style.visibility = 'visible';
    }

    if (errorBox) {
        errorBox.classList.add('hidden');
    }

    setTimeout(() => {
        form.reset();
        successBox.classList.add('hidden');
    }, 8000);
}

function showError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    const inputField = document.getElementById(fieldId.replace('Error', ''));

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }

    if (inputField) {
        inputField.style.borderColor = 'var(--color-neon-red)';
        inputField.style.boxShadow = '0 0 5px rgba(255, 0, 60, 0.5)';
    }
}

function resetErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.add('hidden');
    });

    document.querySelectorAll('input, textarea').forEach(field => {
        field.style.borderColor = 'rgba(255,255,255,0.2)';
        field.style.boxShadow = 'none';
    });

    const formError = document.getElementById('formError');
    const formMessage = document.getElementById('formMessage');

    if (formError) formError.classList.add('hidden');
    if (formMessage) formMessage.classList.add('hidden');
}

/* Expose for EmailJS script */
window.showError = showError;
window.resetErrors = resetErrors;

/* =========================
VALIDATION FUNCTION (USED BY EMAILJS)
========================= */
window.validateForm = function () {
    const name = document.getElementById('name')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';
    const message = document.getElementById('message')?.value.trim() || '';

    if (name.length < 2) {
        showError('nameError', 'Please enter your full name');
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError('emailError', 'Please enter a valid email');
        return false;
    }

    if (message.length < 10) {
        showError('messageError', 'Message must be at least 10 characters');
        return false;
    }

    return true;
};

/* =========================
BACK TO TOP
========================= */
function setupBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
    });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}