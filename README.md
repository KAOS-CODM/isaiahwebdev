# 🌐 Isaiah Adelowo — Portfolio Website

Welcome to my personal portfolio! 🚀  
This site represents my journey as a web developer, showcasing my skills, creativity, and growth in building clean, functional, and user-friendly web interfaces.

🔗 **Live Demo:** [Visit Portfolio](https://isaiahwebdev.onrender.com)

---

## 📌 About This Project

This portfolio is designed as a multi-page showcase of who I am and what I do, featuring a modern dark theme with neon accents.

It includes:
- A professional introduction and hero section
- Detailed about page with skills and background
- Dynamic project showcase (auto-updated from JSON)
- Certificates and achievements section
- Contact information with social links

The portfolio is built to be easily expandable, so new works can be added seamlessly without modifying the core structure.

---

## 🛠️ Built With
- **HTML5** – Semantic structure and accessibility
- **CSS3** – Responsive design, animations, and modern layouts
- **JavaScript (Vanilla)** – Interactivity, dynamic rendering, and DOM manipulation
- **JSON** – Data-driven content for projects, skills, and certificates
- **Render** – Hosting and deployment
- **Font Awesome** – Icons and visual elements

---

## 📂 Project Structure
```
isaiahwebdev-portfolio/
├── README.md              # Documentation
├── index.html             # Home page
├── about.html             # About page
├── projects.html          # Projects page
├── certificates.html      # Certificates page
├── contact.html           # Contact page
├── resume.html            # Resume page
├── css/
│   └── style.css          # Main stylesheet
├── js/
│   ├── script.js          # Main JavaScript
│   ├── project.js         # Project handling
│   ├── footer-loader.js   # Footer loading
│   └── hero-final-fix.js  # Hero animations
├── data/
│   ├── projects.json      # Project data
│   ├── skills.json        # Skills data
│   ├── certificates.json  # Certificates data
│   └── footer.json        # Footer data
├── images/                # Project images and assets
├── logo/                  # Logo files
├── docs/                  # Additional documents
├── firebase.json          # Firebase config
├── robots.txt             # SEO
└── sitemap.xml            # SEO
```

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser
- Basic understanding of HTML/CSS/JS (for customization)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/KAOS-CODM/isaiahwebdev-portfolio.git
   ```
2. Navigate to the project directory:
   ```bash
   cd isaiahwebdev-portfolio
   ```
3. Open `index.html` in your browser or serve locally.

### Customization
- Edit `data/projects.json` to add new projects
- Modify `css/style.css` for styling changes
- Update `data/skills.json` for skills
- Add images to `images/` folder

---

### Admin CMS (local development)

The private admin interface lets the owner create, edit, publish, unpublish and preview projects. It is part of the static frontend and talks to the separate backend API.

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` — your MongoDB connection string.
2. Start the backend with `npm run dev` from `backend/`.
3. Open `http://localhost:8080/admin`. On first run (no administrator exists yet) the page shows a setup form: choose a username and a password of at least 12 characters. The account is created in MongoDB and you are signed in automatically.
4. Afterwards, `/admin` shows the normal sign-in form (username + password). There is no environment variable for the admin password.

Notes:

- The administrator is stored in MongoDB, not in the environment. There is no `ADMIN_PASSWORD_HASH` or `ADMIN_SESSION_SECRET`.
- The first administrator can only be created from the local machine (`127.0.0.1`/`::1`) while `NODE_ENV` is not `production`. Setup is disabled in production and permanently closed once an administrator exists, so production onboarding is performed locally against the same database.
- Sessions use a signed, `HttpOnly` cookie (not `localStorage`/`sessionStorage`). The cookie lives for 8 hours, so refreshing the page and restarting the server keep you signed in until it expires; signing out clears the cookie.
- The signing secret is a random per-administrator value stored in MongoDB, so it survives restarts and is never taken from the environment. Deleting the administrator record invalidates all outstanding sessions immediately.
- In production the backend is API-only; the admin page is served by the static frontend. The cookie uses `SameSite=None; Secure` there (the frontend and API are different sites) and `SameSite=Lax` during local development; override with `ADMIN_COOKIE_SAMESITE` (`Lax`/`Strict`/`None`) if needed.
- State-changing admin calls require a JSON body and pass the API's strict CORS/origin checks, which (together with the cookie's `HttpOnly`/`SameSite` attributes) mitigates CSRF.
- **Image uploads (Cloudinary).** Projects can hold several uploaded images. Uploading requires three server-side variables on the API service — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` — plus the optional `CLOUDINARY_FOLDER` (`MEDIA_MAX_UPLOAD_BYTES` and `MEDIA_MAX_IMAGES_PER_PROJECT` set the per-image and per-project caps). These values are read only by the backend and are never sent to the browser or committed; see `backend/.env.example` for the annotated placeholders. When they are not set, uploads report that the image service is not configured and the editor's manual "Add image URL" fallback keeps working, so nothing else in the CMS is affected. Accepted formats are JPEG, PNG, WebP and GIF.

---

## 👨‍💻 About Me

I'm Isaiah Adelowo, a Computer Science student passionate about web programming and creating digital experiences that matter.

### I focus on:
- Frontend development with modern technologies
- Responsive and accessible web design
- User-centered UI/UX principles
- Clean, maintainable code

### Skills
- **Frontend:** HTML5, CSS3, JavaScript (ES6+), React
- **Tools:** Git, VS Code, Figma, Chrome DevTools
- **Design:** UI/UX principles, wireframing, prototyping

---

## 📞 Contact

- **Email:** kaoskonseptech@gmail.com
- **Fiverr:** https://www.fiverr.com/isaiahwebdev
- **GitHub:** [https://github.com/KAOS-CODM](https://github.com/KAOS-CODM)
- **Portfolio:** [https://isaiahwebdev.onrender.com](https://isaiahwebdev.onrender.com)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

⭐ If you like this project, please give it a star on GitHub!

*Built with ❤️ by Isaiah Adelowo*
