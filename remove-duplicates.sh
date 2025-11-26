#!/bin/bash

# For projects.html - remove duplicates after the first occurrence
awk '
/meta name="keywords"/ { 
    if (!keywords_seen) { 
        keywords_seen = 1; 
        print; 
    } 
    next 
}
/meta name="author"/ { 
    if (!author_seen) { 
        author_seen = 1; 
        print; 
    } 
    next 
}
/meta property="og:/ {
    if (!og_seen) {
        og_seen = 1;
        print;
    }
    next
}
{ print }
' projects.html > projects_temp.html && mv projects_temp.html projects.html

# For certificates.html
awk '
/meta name="keywords"/ { 
    if (!keywords_seen) { 
        keywords_seen = 1; 
        print; 
    } 
    next 
}
/meta name="author"/ { 
    if (!author_seen) { 
        author_seen = 1; 
        print; 
    } 
    next 
}
/meta property="og:/ {
    if (!og_seen) {
        og_seen = 1;
        print;
    }
    next
}
{ print }
' certificates.html > certificates_temp.html && mv certificates_temp.html certificates.html

# For index.html  
awk '
/meta name="keywords"/ { 
    if (!keywords_seen) { 
        keywords_seen = 1; 
        print; 
    } 
    next 
}
/meta name="author"/ { 
    if (!author_seen) { 
        author_seen = 1; 
        print; 
    } 
    next 
}
/meta property="og:/ {
    if (!og_seen) {
        og_seen = 1;
        print;
    }
    next
}
{ print }
' index.html > index_temp.html && mv index_temp.html index.html

# For contact.html
awk '
/meta name="keywords"/ { 
    if (!keywords_seen) { 
        keywords_seen = 1; 
        print; 
    } 
    next 
}
/meta name="author"/ { 
    if (!author_seen) { 
        author_seen = 1; 
        print; 
    } 
    next 
}
/meta property="og:/ {
    if (!og_seen) {
        og_seen = 1;
        print;
    }
    next
}
{ print }
' contact.html > contact_temp.html && mv contact_temp.html contact.html

echo "Duplicate meta tags removed!"
