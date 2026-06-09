const certificatesContainer = document.getElementById('certificates-container');
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const closeBtn = document.getElementById("close-lightbox");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

let certificateImages = [];
let certificateCurrentIndex = 0;

async function loadCertificates() {
    try {
        const response = await fetch('data/certificates.json');
        const certificates = await response.json();
        if (!certificatesContainer) return;

        if (!certificates.length) {
            certificatesContainer.innerHTML = '<p class="no-projects">No certificates available at the moment.</p>';
            return;
        }

        displayCertificates(certificates);
        setupLightbox(certificates);
    } catch (error) {
        console.error('Error loading certificates:', error);
        if (certificatesContainer) {
            certificatesContainer.innerHTML = '<p class="error">Failed to load certificates. Please try again later.</p>';
        }
    }
}

function getImageSrc(image) {
    return image?.src ?? image ?? "";
}

function getImageAlt(image, fallback) {
    return image?.alt ?? fallback;
}

function displayCertificates(certificates) {
    if (!certificatesContainer) return;

    certificatesContainer.innerHTML = certificates.map((cert, index)=> {
        const firstImage = cert.images?.[0] ?? {};
        return`
            <div class="bg-card-bg border border-[rgba(255,0,60,0.15)] rounded-2xl p-[clamp(20px,4vw,30px)] transition-all duration-300 backdrop-blur-[10px] text-center hover:-translate-y-1 hover:border-neon-red hover:shadow-[0_15px_30px_rgba(255,0,60,0.2)] hover:bg-white/10">
                <h3>${cert.title}</h3>
                <div class="mb-[clamp(10px,2vw,15px)] overflow-hidden rounded-[10px] max-h-62.5">
                    <img src="${getImageSrc(firstImage)}" alt="${getImageAlt(firstImage, cert.title + 'Thumbnail')} Certificate" class="thumb w-full h-auto cursor-pointer shadow-[0_5px_15px_rgba(0,0,0,0.1)] transition-smooth duration-300 hover:scale-105 hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)]" loading="lazy">
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
        `;
    }).join('');
}

// Setup lightbox events
function setupLightbox(projects) {
    document.querySelectorAll(".thumb").forEach((thumb, index) => {
        thumb.addEventListener("click", () => {
            currentGroup = projects[index].images ?? [];
            currentIndex = 0;

            updateLightboxImage();

            lightbox.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        });
    });
}

// Close lightbox
function closeLightbox() {
    lightbox.classList.add("hidden");
    document.body.style.overflow = "auto";
}

// Navigation
function showPrevImage() {
    if (!currentGroup.length) return;
    currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
    updateLightboxImage();
}

function showNextImage() {
    if (!currentGroup.length) return;
    currentIndex = (currentIndex + 1) % currentGroup.length;
    updateLightboxImage();
}

// Click outside
lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
});

// Keyboard support
document.addEventListener("keydown", (e) => {
    if (lightbox.classList.contains("hidden")) return;

    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showPrevImage();
    if (e.key === "ArrowRight") showNextImage();
});

//Init
loadCertificates();
