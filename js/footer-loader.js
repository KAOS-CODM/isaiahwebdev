// Footer loader for all pages
async function loadFooter() {
    try {
        const response = await fetch("data/footer.json");
        const footerData = await response.json();
        
        const footer = document.getElementById('main-footer');
        if (footer) {
            footer.innerHTML = `
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-logo">${footerData.logo}</div>
                        <p class="footer-text">${footerData.tagline}</p>
                        <div class="social-links">
                            ${footerData.socialLinks.map(link => `
                                <a href="${link.url}" class="social-link" aria-label="${link.ariaLabel}">
                                    <i class="${link.icon}"></i>
                                </a>
                            `).join('')}
                        </div>
                        <p class="copyright">${footerData.copyright}</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading footer:', error);
    }
}

// Load footer when DOM is ready
document.addEventListener('DOMContentLoaded', loadFooter);
