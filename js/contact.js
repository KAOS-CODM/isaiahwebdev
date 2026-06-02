document.addEventListener('DOMContentLoaded', () => {
    setupCopyButtons();
    setupForm();
    setupFieldValidation();
    setupBackToTop();
});

function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    const copyFeedback = document.getElementById('copyFeedback');
    if (!copyButtons.length || !copyFeedback) return;

    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const textToCopy = this.getAttribute('data-copy');

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        showCopySuccess(this, copyFeedback);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        fallbackCopy(textToCopy, this, copyFeedback);
                    });
            } else {
                fallbackCopy(textToCopy, this, copyFeedback);
            }
        });
    });
}

function fallbackCopy(text, button, copyFeedback) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(button, copyFeedback);
        } else {
            console.error('Fallback copy failed');
        }
    } catch (err) {
        console.error('Fallback copy failed: ', err);
    }

    document.body.removeChild(textArea);
}

function showCopySuccess(button, copyFeedback) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
    button.classList.add('copied');
    copyFeedback.classList.add('show');

    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('copied');
    }, 2000);

    setTimeout(() => {
        copyFeedback.classList.remove('show');
    }, 3000);
}

function setupForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        resetErrors();

        if (validateForm()) {
            showLoading(true);

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const subject = document.getElementById('subject').value || 'Portfolio Contact';
            const message = document.getElementById('message').value;

            const emailSubject = `New Message: ${subject} - From ${name}`;
            const emailBody = `Hello Isaiah,\n\nYou have received a new message from your portfolio website:\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}\n\n---\nThis message was sent from your portfolio contact form.`;
            const mailtoLink = `mailto:kaoskonseptech@gmail.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

            document.getElementById('formMessage').style.display = 'block';
            document.getElementById('formError').style.display = 'none';

            setTimeout(() => {
                window.location.href = mailtoLink;
                showLoading(false);
            }, 1000);

            setTimeout(() => {
                form.reset();
                document.getElementById('formMessage').style.display = 'none';
            }, 5000);
        } else {
            document.getElementById('formError').style.display = 'block';
        }
    });
}

function validateForm() {
    let isValid = true;
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();

    if (name.length < 2) {
        showError('nameError', 'Please enter your full name');
        isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError('emailError', 'Please enter a valid email address');
        isValid = false;
    }

    if (message.length < 10) {
        showError('messageError', 'Please enter a message with at least 10 characters');
        isValid = false;
    }

    return isValid;
}

function showError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.style.display = 'block';

    const inputField = document.getElementById(fieldId.replace('Error', ''));
    if (inputField) {
        inputField.style.borderColor = 'var(--neon-red)';
        inputField.style.boxShadow = '0 0 5px rgba(255, 0, 60, 0.5)';
    }
}

function resetErrors() {
    document.querySelectorAll('.error-message').forEach(error => {
        error.style.display = 'none';
    });

    document.querySelectorAll('input, textarea').forEach(field => {
        field.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        field.style.boxShadow = 'none';
    });

    const formError = document.getElementById('formError');
    const formMessage = document.getElementById('formMessage');
    if (formError) formError.style.display = 'none';
    if (formMessage) formMessage.style.display = 'none';
}

function showLoading(show) {
    const submitBtn = document.getElementById('submitBtn');
    const loadingSpinner = document.getElementById('formLoading');
    if (!submitBtn || !loadingSpinner) return;

    if (show) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        loadingSpinner.style.display = 'block';
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
        loadingSpinner.style.display = 'none';
    }
}

function setupFieldValidation() {
    document.querySelectorAll('input, textarea').forEach(field => {
        field.addEventListener('input', () => {
            const errorId = `${field.id}Error`;
            const errorElement = document.getElementById(errorId);
            if (errorElement) {
                errorElement.style.display = 'none';
                field.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                field.style.boxShadow = 'none';
            }
        });
    });
}

function setupBackToTop() {
    const backToTop = document.getElementById('backToTop');
    if (!backToTop) return;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.style.display = 'flex';
        } else {
            backToTop.style.display = 'none';
        }
    });

    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
