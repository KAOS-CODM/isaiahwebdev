#!/bin/bash

# Fix certificates title
awk '{gsub(/<title>Certificates - IsaiahWebDev<\/title>/,"<title>Certifications - IsaiahWebDev | Professional Web Development Qualifications</title>")}1' certificates.html > cert_temp && mv cert_temp certificates.html

# Fix projects title  
awk '{gsub(/<title>Projects - IsaiahWebDev<\/title>/,"<title>Projects - IsaiahWebDev | Web Development Portfolio & Case Studies</title>")}1' projects.html > proj_temp && mv proj_temp projects.html

# Fix contact title
awk '{gsub(/<title>Contact - IsaiahWebDev<\/title>/,"<title>Contact - IsaiahWebDev | Get in Touch for Web Development Projects</title>")}1' contact.html > cont_temp && mv cont_temp contact.html

echo "Titles updated successfully"
