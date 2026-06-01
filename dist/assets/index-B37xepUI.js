(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const r of o)if(r.type==="childList")for(const c of r.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&a(c)}).observe(document,{childList:!0,subtree:!0});function n(o){const r={};return o.integrity&&(r.integrity=o.integrity),o.referrerPolicy&&(r.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?r.credentials="include":o.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(o){if(o.ep)return;o.ep=!0;const r=n(o);fetch(o.href,r)}})();document.addEventListener("DOMContentLoaded",function(){const t=document.querySelector(".profile-wrapper"),e=30;for(let n=0;n<e;n++){const a=document.createElement("div"),o=Math.random()*8+2,r=Math.random()*100,c=Math.random()*100,h=Math.random()*5,g=Math.random()*.5+.1,y=Math.floor(Math.random()*360),v=Math.floor(Math.random()*10)+1;a.className=`particle w-[${o}px] h-[${o}px] left-[${r}%] top-[${c}%] opacity-[${g}] [animation-delay:${h}s] animate-float-${v}`,a.style.setProperty("--neon-hue",y),t.appendChild(a)}});async function b(){try{const e=await(await fetch("data/footer.json")).json(),n=document.getElementById("main-footer");n&&(n.innerHTML=`
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-logo">${e.logo}</div>
                        <p class="footer-text">${e.tagline}</p>
                        <div class="social-links">
                            ${e.socialLinks.map(a=>`
                                <a href="${a.url}" class="social-link" aria-label="${a.ariaLabel}">
                                    <i class="${a.icon}"></i>
                                </a>
                            `).join("")}
                        </div>
                        <p class="copyright">${e.copyright}</p>
                    </div>
                </div>
            `)}catch(t){console.error("Error loading footer:",t)}}document.addEventListener("DOMContentLoaded",b);document.addEventListener("DOMContentLoaded",function(){const t=document.querySelector(".navbar");if(t){const e=t.offsetHeight,n=20;document.documentElement.style.setProperty("--navbar-pt",e+n+"px"),console.log("Applied --navbar-pt:",e+n+"px")}});window.addEventListener("resize",function(){const t=document.querySelector(".navbar");if(t){const e=t.offsetHeight;document.documentElement.style.setProperty("--navbar-pt",e+20+"px")}});const d=document.getElementById("projects-container"),l=document.getElementById("lightbox"),p=document.getElementById("lightbox-img"),L=document.querySelector(".close"),x=document.getElementById("prev-btn"),E=document.getElementById("next-btn");let s=[],i=0;async function $(){try{const e=await(await fetch("data/projects.json")).json();if(e.length===0){d.innerHTML='<p class="no-projects">No projects available at the moment.</p>';return}M(e),w(e)}catch(t){console.error("Error loading projects:",t),d.innerHTML='<p class="error">Failed to load projects. Please try again later.</p>'}}function M(t){d.innerHTML=t.map((e,n)=>`
        <div class="project" data-index="${n}">
            <h3>${e.title}</h3>
            <div class="project-thumb">
                <img src="${e.images[0]}" alt="${e.title} Thumbnail" class="thumb" loading="lazy">
            </div>
            <p>${e.description}</p>
            ${e.technologies?`<p><strong>Technologies:</strong> ${e.technologies.join(", ")}</p>`:""}
            <div class="project-links">
                <a href="${e.site}" target="_blank" class="project-link">
                    <i class="fas fa-external-link-alt"></i> Live Demo
                </a>
                <a href="${e.github}" target="_blank" class="project-link">
                    <i class="fab fa-github"></i> Source Code
                </a>
            </div>
        </div>
    `).join("")}function w(t){document.querySelectorAll(".thumb").forEach((e,n)=>{e.addEventListener("click",()=>{s=t[n].images,i=0,p.src=s[i],l.style.display="flex",document.body.style.overflow="hidden"})})}L.addEventListener("click",f);x.addEventListener("click",u);E.addEventListener("click",m);l.addEventListener("click",t=>{t.target===l&&f()});document.addEventListener("keydown",t=>{l.style.display==="flex"&&(t.key==="Escape"&&f(),t.key==="ArrowLeft"&&u(),t.key==="ArrowRight"&&m())});function f(){l.style.display="none",document.body.style.overflow="auto"}function u(){s.length&&(i=(i-1+s.length)%s.length,p.src=s[i])}function m(){s.length&&(i=(i+1)%s.length,p.src=s[i])}$();
