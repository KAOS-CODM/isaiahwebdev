let certificateImages = [];
let certificateCurrentIndex = 0;

function getCertificateElements() {
    return {
        certificatesContainer: document.getElementById('certificates-container'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.getElementById('lightbox-img'),
        closeBtn: document.querySelector('.close'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn')
    };
}

async function loadCertificates() {
    try {
        const response = await fetch('data/certificates.json');
        const certificates = await response.json();
        const { certificatesContainer } = getCertificateElements();
        if (!certificatesContainer) return;

        if (!certificates.length) {
            certificatesContainer.innerHTML = '<p class="no-projects">No certificates available at the moment.</p>';
            return;
        }

        displayCertificates(certificates);
        setupLightbox(certificates);
    } catch (error) {
        console.error('Error loading certificates:', error);
        const { certificatesContainer } = getCertificateElements();
        if (certificatesContainer) {
            certificatesContainer.innerHTML = '<p class="error">Failed to load certificates. Please try again later.</p>';
        }
    }
}

function displayCertificates(certificates) {
    const { certificatesContainer } = getCertificateElements();
    if (!certificatesContainer) return;

    certificatesContainer.innerHTML = certificates.map(cert => `
        <div class="project">
            <h3>${cert.title}</h3>
            <div class="project-thumb">
                <img src="${cert.image}" alt="${cert.title} Certificate" class="thumb" loading="lazy">
            </div>
            <p><strong>Issuer:</strong> ${cert.issuer}</p>
            <p><strong>Date:</strong> ${cert.date}</p>
            <p>${cert.description}</p>
            <div class="project-links">
                <a href="${cert.credentialUrl}" target="_blank" class="project-link">
                    <i class="fas fa-external-link-alt"></i> Verify Certificate
                </a>
            </div>
        </div>
    `).join('');
}

function setupLightbox(certificates) {
    const { lightbox, closeBtn, prevBtn, nextBtn } = getCertificateElements();
    if (!lightbox || !closeBtn || !prevBtn || !nextBtn) return;

    certificateImages = certificates.map(cert => cert.image);

    document.querySelectorAll('.thumb').forEach((thumb, index) => {
        thumb.addEventListener('click', () => {
            certificateCurrentIndex = index;
            const lightboxImg = document.getElementById('lightbox-img');
            if (!lightboxImg) return;
            lightboxImg.src = certificateImages[certificateCurrentIndex];
            lightbox.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    });

    closeBtn.addEventListener('click', () => {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    prevBtn.addEventListener('click', () => {
        if (certificateImages.length) {
            certificateCurrentIndex = (certificateCurrentIndex - 1 + certificateImages.length) % certificateImages.length;
            document.getElementById('lightbox-img').src = certificateImages[certificateCurrentIndex];
        }
    });

    nextBtn.addEventListener('click', () => {
        if (certificateImages.length) {
            certificateCurrentIndex = (certificateCurrentIndex + 1) % certificateImages.length;
            document.getElementById('lightbox-img').src = certificateImages[certificateCurrentIndex];
        }
    });

    lightbox.addEventListener('click', e => {
        if (e.target === lightbox) {
            lightbox.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });

    document.addEventListener('keydown', e => {
        if (lightbox.style.display === 'flex') {
            if (e.key === 'Escape') {
                lightbox.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (e.key === 'ArrowLeft') {
                prevBtn.click();
            }
            if (e.key === 'ArrowRight') {
                nextBtn.click();
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadCertificates();
});
