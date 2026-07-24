/**
 * projects-modal.js
 * Modern project details modal.
 * Drop-in replacement.
 */

(function () {
    "use strict";

    const state = {
        projects: [],
        projectIndex: 0,
        imageIndex: 0,
        isOpen: false,
        previousFocus: null,
        initialized: false,
        closing: false
    };

    let els = {};

    function cacheElements() {
        els = {
            modal: document.getElementById("project-modal"),
            backdrop: document.getElementById("modal-backdrop"),
            content: document.getElementById("modal-content"),
            closeBtn: document.getElementById("modal-close"),
            image: document.getElementById("modal-image"),
            prevBtn: document.getElementById("modal-prev"),
            nextBtn: document.getElementById("modal-next"),
            controls: document.getElementById("modal-controls"),
            title: document.getElementById("modal-title"),
            description: document.getElementById("modal-description"),
            technologies: document.getElementById("modal-technologies"),
            liveBtn: document.getElementById("modal-live"),
            githubBtn: document.getElementById("modal-github"),
            imageCount: document.getElementById("modal-image-count")
        };

        return !!els.modal;
    }

    const FOCUSABLE =
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function getImageSrc(image) {
        return image?.src ?? image ?? "";
    }

    function getImageAlt(image, fallback) {
        return image?.alt ?? fallback;
    }

    function updateModalContent() {

        const project = state.projects[state.projectIndex];
        if (!project) return;

        const images = Array.isArray(project.images)
            ? project.images
            : [];

        const image = images[state.imageIndex] || {};

        els.image.src = getImageSrc(image);
        els.image.alt = getImageAlt(
            image,
            `${project.title} screenshot ${state.imageIndex + 1}`
        );

        els.title.textContent = project.title;
        els.description.textContent = project.description;

        if (project.technologies?.length) {

            els.technologies.innerHTML =
                `<strong class="text-neon-red">Technologies:</strong> ${project.technologies.join(", ")}`;

            els.technologies.classList.remove("hidden");

        } else {

            els.technologies.classList.add("hidden");

        }

        if (project.site) {
            els.liveBtn.href = project.site;
            els.liveBtn.classList.remove("hidden");
        } else {
            els.liveBtn.classList.add("hidden");
        }
        
        if (project.github) {
            els.githubBtn.href = project.github;
            els.githubBtn.classList.remove("hidden");
        } else {
            els.githubBtn.classList.add("hidden");
        }

        if (images.length > 1) {

            els.controls.classList.remove("hidden");

            els.imageCount.classList.remove("hidden");
            els.imageCount.textContent =
                `${state.imageIndex + 1} / ${images.length}`;

        } else {

            els.controls.classList.add("hidden");
            els.imageCount.classList.add("hidden");

        }

    }

    function showPrevImage() {

        const images =
            state.projects[state.projectIndex]?.images || [];

        if (images.length < 2) return;

        state.imageIndex =
            (state.imageIndex - 1 + images.length) %
            images.length;

        updateModalContent();

    }

    function showNextImage() {

        const images =
            state.projects[state.projectIndex]?.images || [];

        if (images.length < 2) return;

        state.imageIndex =
            (state.imageIndex + 1) %
            images.length;

        updateModalContent();

    }

    function trapFocus(e) {

        if (!state.isOpen) return;

        const focusable =
            els.modal.querySelectorAll(FOCUSABLE);

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {

            if (document.activeElement === first) {

                e.preventDefault();
                last.focus();

            }

        } else {

            if (document.activeElement === last) {

                e.preventDefault();
                first.focus();

            }

        }

    }

    function openModal(projects, index) {

        if (state.closing) return;

        state.projects = projects;
        state.projectIndex = index;
        state.imageIndex = 0;
        state.previousFocus = document.activeElement;

        updateModalContent();

        els.modal.classList.remove("hidden");
        els.modal.classList.add("flex");

        // restart animation
        els.content.classList.remove("modal-open");

        void els.content.offsetWidth;

        requestAnimationFrame(() => {
            els.content.classList.add("modal-open");
        });

        document.body.style.overflow = "hidden";

        els.modal.setAttribute("aria-hidden", "false");

        state.isOpen = true;

        requestAnimationFrame(() => {

            const focusable =
                els.modal.querySelectorAll(FOCUSABLE);

            focusable[0]?.focus();

        });

    }

    function closeModal() {

        if (!state.isOpen || state.closing) return;

        state.closing = true;

        els.content.classList.remove("modal-open");

        function finishClose() {

            els.modal.classList.add("hidden");
            els.modal.classList.remove("flex");

            document.body.style.overflow = "";

            els.modal.setAttribute(
                "aria-hidden",
                "true"
            );

            state.isOpen = false;
            state.closing = false;

            if (
                state.previousFocus &&
                typeof state.previousFocus.focus === "function"
            ) {
                state.previousFocus.focus();
            }

        }

        els.content.addEventListener(
            "transitionend",
            finishClose,
            { once: true }
        );

    }

    function handleKeydown(e) {

        if (!state.isOpen) return;

        switch (e.key) {

            case "Escape":
                e.preventDefault();
                closeModal();
                break;

            case "ArrowLeft":
                e.preventDefault();
                showPrevImage();
                break;

            case "ArrowRight":
                e.preventDefault();
                showNextImage();
                break;

            case "Tab":
                trapFocus(e);
                break;

        }

    }

    function initEventListeners() {

        if (state.initialized) return;

        els.closeBtn.addEventListener(
            "click",
            closeModal
        );

        els.backdrop.addEventListener(
            "click",
            closeModal
        );

        els.content.addEventListener(
            "click",
            e => e.stopPropagation()
        );

        els.prevBtn.addEventListener("click", e => {

            e.stopPropagation();
            showPrevImage();

        });

        els.nextBtn.addEventListener("click", e => {

            e.stopPropagation();
            showNextImage();

        });

        document.addEventListener(
            "keydown",
            handleKeydown
        );

        state.initialized = true;

    }

    window.openProjectModal = function (
        projects,
        index
    ) {

        if (!cacheElements()) {

            console.error(
                "[projects-modal] Modal elements not found."
            );

            return;

        }

        initEventListeners();

        openModal(projects, index);

    };

})();