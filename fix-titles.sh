#!/bin/bash

# Backup original files first
cp index.html index.html.backup
cp projects.html projects.html.backup
cp certificates.html certificates.html.backup
cp contact.html contact.html.backup

# Fix index.html title - use a more specific pattern
sed -i 's|<title>.*</title>|<title>IsaiahWebDev - Frontend Developer & UI Designer Portfolio</title>|' index.html

# Fix projects.html title
sed -i 's|<title>.*</title>|<title>Projects - IsaiahWebDev | Web Development Portfolio & Case Studies</title>|' projects.html

# Fix certificates.html title  
sed -i 's|<title>.*</title>|<title>Certifications - IsaiahWebDev | Professional Web Development Qualifications</title>|' certificates.html

# Fix contact.html title
sed -i 's|<title>.*</title>|<title>Contact - IsaiahWebDev | Get in Touch for Web Development Projects</title>|' contact.html

echo "Titles fixed successfully!"
