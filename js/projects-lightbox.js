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
  };

  function $(id) {
    return document.getElementById(id);
  }

  function getImageSrc(image) {
    return image?.src ?? image ?? '';
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

    // If this script is included on pages without the lightbox, do nothing.
    if (!lightbox || !lightboxImg) return null;

    return { lightbox, lightboxImg, closeBtn, prevBtn, nextBtn };
  }

  function initSharedLightbox(projects) {
    const els = ensureRequiredElements();
    if (!els) return;

    const { lightbox, lightboxImg, closeBtn, prevBtn, nextBtn } = els;

    function updateLightboxImage() {
      const image = state.group[state.index] ?? {};
      lightboxImg.src = getImageSrc(image);
      lightboxImg.alt = getImageAlt(image, `Project image ${state.index + 1}`);
    }

    function closeLightbox() {
      lightbox.classList.add("hidden");
      document.body.style.overflow = "auto";
    }

    function showPrevImage() {
      if (!state.group.length) return;
      state.index = (state.index - 1 + state.group.length) % state.group.length;
      updateLightboxImage();
    }

    function showNextImage() {
      if (!state.group.length) return;
      state.index = (state.index + 1) % state.group.length;
      updateLightboxImage();
    }

    // Click thumbnails
    const thumbs = document.querySelectorAll(".thumb");
    if (!thumbs.length) return;

    thumbs.forEach((thumb, index) => {
      thumb.addEventListener("click", () => {
        state.group = projects?.[index]?.images ?? [];
        state.index = 0;
        updateLightboxImage();
        lightbox.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      });
    });

    // Button + overlay controls (safe even if buttons are missing)
    if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
    if (prevBtn) prevBtn.addEventListener("click", showPrevImage);
    if (nextBtn) nextBtn.addEventListener("click", showNextImage);

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (e) => {
      if (lightbox.classList.contains("hidden")) return;

      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") showPrevImage();
      if (e.key === "ArrowRight") showNextImage();
    });
  }

  // Expose a global initializer so each page can load projects then call it.
  window.initProjectsLightbox = initSharedLightbox;
})();

