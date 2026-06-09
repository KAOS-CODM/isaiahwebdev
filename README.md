# 🌐 IsaiahWebDev — Portfolio Website

Welcome to the IsaiahWebDev portfolio! 🚀
This repository contains a responsive, multi-page frontend portfolio built with HTML, CSS, JavaScript, and JSON-driven content.

🔗 **Live Demo:** https://isaiahwebdev.onrender.com/

---

## 📌 About This Project

This portfolio showcases IsaiahWebDev as a frontend developer and UI designer using a modern dark theme, neon accents, and dynamic content loading.

It includes:
- A home page with hero section and featured projects
- An about page with skills, experience, and profile details
- A projects page driven by `data/projects.json`
- A certificates page using `data/certificates.json`
- A resume page with downloadable details
- A contact page with EmailJS contact form integration
- A reusable footer loaded by `js/footer-loader.js`
- A lightbox gallery for project images on the main page

The site is designed to be easy to update by editing JSON content and adding images, without changing the core HTML structure.

---

## 🛠️ Built With
- **HTML5** – Semantic page structure and accessibility support
- **CSS3** – Responsive layout and modern animations
- **Tailwind CSS v4** – Utility-driven styling compiled into `css/styles.css`
- **JavaScript (Vanilla)** – Dynamic rendering, UI interactions, and content loading
- **JSON** – Data-driven project, skills, certificate, and footer content
- **Font Awesome** – Iconography and UI embellishments
- **EmailJS** – Contact form email delivery

---

## 📂 Project Structure
```
isaiahwebdev/
├── README.md
├── LICENSE.md
├── TODO.md
├── index.html
├── about.html
├── projects.html
├── certificates.html
├── resume.html
├── contact.html
├── css/
│   └── styles.css
├── js/
│   ├── about.js
│   ├── certificates.js
│   ├── contact.js
│   ├── emailjs-contact.js
│   ├── footer-loader.js
│   ├── hero-final-fix.js
│   ├── project.js
│   ├── projects-lightbox.js
│   └── projects-page.js
├── data/
│   ├── projects.json
│   ├── skills.json
│   ├── certificates.json
│   └── footer.json
├── images/
├── assets/
│   └── fontawesome-free-5.15.4-web/
├── icon/
│   └── favicon.ico
├── docs/
├── tailwind-workspace/
│   ├── input.css
│   ├── package.json
│   └── tailwind.config.js
├── robots.txt
└── sitemap.xml
```

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser
- Node.js and npm (optional, only required for Tailwind CSS builds)
- Basic HTML/CSS/JavaScript knowledge for customization

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/KAOS-CODM/isaiahwebdev.git
   ```
2. Change into the project directory:
   ```bash
   cd isaiahwebdev
   ```
3. Open `index.html` in your browser, or serve the site with a local web server.

### Optional Tailwind Build
If you want to regenerate `css/styles.css` from the Tailwind source:

1. Install dependencies in `tailwind-workspace`:
   ```bash
   cd tailwind-workspace
   npm install
   ```
2. Build the stylesheet:
   ```bash
   npm run build
   ```

---

## ✨ Customization
- Add new projects in `data/projects.json`
- Update certificates in `data/certificates.json`
- Edit skill categories in `data/skills.json`
- Add or replace images under the `images/` folder
- Customize styling via `tailwind-workspace/input.css` and rebuild to `css/styles.css`
- Update footer content in `data/footer.json`

---

## 👨‍💻 About IsaiahWebDev

IsaiahWebDev is a frontend developer focused on building modern, responsive websites with strong UI/UX design.

### Key focus areas
- Frontend development with HTML, CSS, and JavaScript
- Responsive and accessible web interfaces
- Data-driven content rendering from JSON
- Clean code structure and maintainable design

---

## 📞 Contact

- **Email:** kaoskonseptech@gmail.com
- **GitHub:** https://github.com/KAOS-CODM
- **Portfolio:** https://isaiahwebdev.onrender.com/

---

## 📄 License

This repository is open source under the [MIT License](LICENSE.md).

---

⭐ If you enjoy this project, please give it a star on GitHub!

*Built with ❤️ by IsaiahWebDev*
