#!/bin/bash

echo "=== APPLYING NUCLEAR FIX FOR BROKEN TITLES ==="

# Function to fix a single file
fix_file_title() {
    local file="$1"
    local correct_title="$2"
    
    echo "Fixing $file..."
    
    # Create a temporary file
    temp_file="${file}.temp"
    
    # Process the file line by line
    while IFS= read -r line; do
        if [[ "$line" == *"<title>"* ]]; then
            # Replace the entire line with the correct title
            echo "    $correct_title"
        else
            echo "$line"
        fi
    done < "$file" > "$temp_file"
    
    # Replace the original file
    mv "$temp_file" "$file"
    echo "✅ Fixed $file"
}

# Fix each file with the correct titles
fix_file_title "index.html" '<title>IsaiahWebDev - Frontend Developer & UI Designer Portfolio</title>'
fix_file_title "projects.html" '<title>Projects - IsaiahWebDev | Web Development Portfolio & Case Studies</title>'
fix_file_title "certificates.html" '<title>Certifications - IsaiahWebDev | Professional Web Development Qualifications</title>'
fix_file_title "contact.html" '<title>Contact - IsaiahWebDev | Get in Touch for Web Development Projects</title>'
fix_file_title "about.html" '<title>About - IsaiahWebDev | Frontend Developer & UI Designer</title>'

echo ""
echo "=== ALL TITLES FIXED ==="
