// Shared lightbox logic for pages that render project thumbnails with class="thumb"
// Requirements:
// - Lightbox container exists: #lightbox
// - Image element exists: #lightbox-img
// - Close button exists: #close-lightbox
// - Prev/Next buttons exist: #prev-btn / #next-btn
// - Thumbnails exist after projects are rendered: .thumb

(function () {
    const state = {
        group: [],
        index: 0,
        initialized: false
    };

    function $(id) {
        return document.getElementById(id);
    }

    function getImageSrc(image) {
        return image?.src ?? image ?? "";
    }

    function getImageAlt(image, fallback) {
        return image?.alt ?? fallback;
    }

    function ensureRequiredElements() {
        const lightbox = $("lightbox");
        const lightboxImg = $("lightbox-img");
        const closeBtn = $("close-lightbox");
        const prevBtn = $("prev-btn");
        const nextBtn = $("next-btn");

        if (!lightbox || !lightboxImg) return null;

        return {
            lightbox,
            lightboxImg,
            closeBtn,
            prevBtn,
            nextBtn
        };
    }

    function initSharedLightbox(projects) {
        const els = ensureRequiredElements();
        if (!els) return;

        const {
            lightbox,
            lightboxImg,
            closeBtn,
            prevBtn,
            nextBtn
        } = els;

        const originalOverflow = document.body.style.overflow;

        function updateNavigation() {
            const multipleImages = state.group.length > 1;

            prevBtn?.classList.toggle("hidden", !multipleImages);
            nextBtn?.classList.toggle("hidden", !multipleImages);
        }

        function updateLightboxImage() {
            const image = state.group[state.index] ?? {};

            lightboxImg.src = getImageSrc(image);
            lightboxImg.alt = getImageAlt(
                image,
                `Project image ${state.index + 1}`
            );

            updateNavigation();
        }

        function openLightbox() {
            lightbox.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }

        function closeLightbox() {
            lightbox.classList.add("hidden");
            document.body.style.overflow = originalOverflow;
        }

        function showPrevImage() {
            if (!state.group.length) return;

            state.index =
                (state.index - 1 + state.group.length) %
                state.group.length;

            updateLightboxImage();
        }

        function showNextImage() {
            if (!state.group.length) return;

            state.index =
                (state.index + 1) %
                state.group.length;

            updateLightboxImage();
        }

        // Attach thumbnail listeners
        document.querySelectorAll(".thumb").forEach((thumb, index) => {
            thumb.onclick = () => {
                state.group = projects?.[index]?.images ?? [];

                if (!state.group.length) return;

                state.index = 0;

                updateLightboxImage();
                openLightbox();
            };
        });

        // Prevent duplicate listeners
        if (!state.initialized) {

            closeBtn?.addEventListener("click", closeLightbox);

            prevBtn?.addEventListener("click", showPrevImage);

            nextBtn?.addEventListener("click", showNextImage);

            lightbox.addEventListener("click", (e) => {
                if (e.target === lightbox) {
                    closeLightbox();
                }
            });

            window.addEventListener("keydown", (e) => {

                if (lightbox.classList.contains("hidden")) return;

                switch (e.key) {

                    case "Escape":
                        closeLightbox();
                        break;

                    case "ArrowLeft":
                        showPrevImage();
                        break;

                    case "ArrowRight":
                        showNextImage();
                        break;
                }

            });

            state.initialized = true;
        }
    }

    // Global initializer
    window.initProjectsLightbox = initSharedLightbox;

})();