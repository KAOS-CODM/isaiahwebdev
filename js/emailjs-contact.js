document.addEventListener('DOMContentLoaded', () => {
    const EMAILJS_SERVICE_ID = 'service_1mcrapi';
    const EMAILJS_TEMPLATE_ID = 'template_8zmmn7o';
    const EMAILJS_PUBLIC_KEY = 'BwFdGBA8RmEWbEL1Y';

    const form = document.getElementById('contactForm');
    if (!form) return;

    const loading = document.getElementById('formLoading');
    const btn = document.getElementById('submitBtn');
    const successBox = document.getElementById('formMessage');
    const errorBox = document.getElementById('formError');

    let isSubmitting = false;

    function setLoading(state) {
        if (btn) btn.style.pointerEvents = state ? "none" : "auto";
        if (btn) btn.disabled = state;
        if (loading) loading.classList.toggle('hidden', !state);
    }

    function showSuccess() {
        if (successBox) successBox.classList.remove('hidden');
        if (errorBox) errorBox.classList.add('hidden');
    }

    function showError(msg = "Something went wrong. Please try again.") {
        if (errorBox) {
            const p = errorBox.querySelector("p");
            if (p) p.textContent = msg;
            errorBox.classList.remove('hidden');
        }
    }

    function loadEmailJS() {
        return new Promise((resolve, reject) => {
            if (window.emailjs && typeof window.emailjs.init === "function") {
                return resolve(window.emailjs);
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js';

            script.onload = () => resolve(window.emailjs);
            script.onerror = reject;

            document.head.appendChild(script);
        });
    }

    loadEmailJS()
        .then((emailjs) => {
            emailjs.init(EMAILJS_PUBLIC_KEY);

            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (isSubmitting) return;
                isSubmitting = true;

                window.resetErrors?.();

                if (window.validateForm && !window.validateForm()) {
                    showError("Please fix the form errors before submitting.");
                    isSubmitting = false;
                    return;
                }

                setLoading(true);

                const params = {
                    name: document.getElementById('name').value,
                    email: document.getElementById('email').value,
                    subject: document.getElementById('subject').value || 'Portfolio Contact',
                    message: document.getElementById('message').value
                };

                const timeout = setTimeout(() => {
                    showError("Request timed out. Please try again.");
                    setLoading(false);
                    isSubmitting = false;
                }, 15000);

                try {
                    await emailjs.send(
                        EMAILJS_SERVICE_ID,
                        EMAILJS_TEMPLATE_ID,
                        params
                    );

                    clearTimeout(timeout);
                    showSuccess();

                    setTimeout(() => {
                        form.reset();
                        successBox?.classList.add('hidden');
                    }, 5000);

                } catch (err) {
                    clearTimeout(timeout);
                    console.error('EmailJS Error:', err);
                    showError("Failed to send message. Please try again.");
                } finally {
                    setLoading(false);
                    isSubmitting = false;
                }
            });
        })
        .catch((err) => {
            console.error('EmailJS failed to load:', err);
            showError("Email service unavailable.");
        });
});