# Render.com Deployment Guide

## Deployment Steps:
1. **Push to GitHub** (if using GitHub integration)
2. **Connect Render** to your repository
3. **Build Command**: (usually auto-detected for static sites)
4. **Publish Directory**: ./ (root directory)

## Render-Specific Settings:
- **Site Type**: Static Site
- **Build Command**: (leave empty for static HTML)
- **Publish Directory**: ./
- **Environment**: Production

## Important Notes for Render:
✅ Your sitemap.xml and robots.txt are now correctly configured
✅ All internal links should work with relative paths (/about, /projects, etc.)
✅ No server configuration needed for static sites

## Post-Deployment Checks:
- [ ] Visit https://isaiahwebdev.onrender.com
- [ ] Test all navigation links
- [ ] Verify sitemap: https://isaiahwebdev.onrender.com/sitemap.xml
- [ ] Verify robots.txt: https://isaiahwebdev.onrender.com/robots.txt
- [ ] Test contact form functionality
- [ ] Check mobile responsiveness

## Custom Domain (Optional):
If you want to use a custom domain later:
1. Buy domain from registrar
2. Add custom domain in Render dashboard
3. Configure DNS records as instructed by Render

🎯 Your portfolio is ready for Render deployment!
