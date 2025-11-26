#!/bin/bash
echo "=== COMPREHENSIVE HEAD SECTION VERIFICATION ==="
echo ""

for file in index.html projects.html certificates.html contact.html about.html; do
    echo "🔍 $file"
    echo "----------------------------------------"
    
    # Get head section
    head_content=$(sed -n '/<head>/,/<\/head>/p' "$file")
    
    # Extract elements
    title=$(echo "$head_content" | grep -o '<title>.*</title>' | head -1)
    desc=$(echo "$head_content" | grep 'meta name="description"' | head -1)
    og_title=$(echo "$head_content" | grep 'property="og:title"' | head -1) 
    og_desc=$(echo "$head_content" | grep 'property="og:description"' | head -1)
    og_type=$(echo "$head_content" | grep 'property="og:type"' | head -1)
    
    # Display with status
    if [ -n "$title" ]; then
        if echo "$title" | grep -q "IsaiahWebDev - Frontend Developer.*UI Designer Portfolio" || \
           echo "$title" | grep -q "Certifications.*Professional" || \
           echo "$title" | grep -q "Projects.*Portfolio.*Case Studies" || \
           echo "$title" | grep -q "Contact.*Get in Touch"; then
            echo "✅ Title: $title"
        else
            echo "⚠️  Title (needs update): $title"
        fi
    else
        echo "❌ Missing title"
    fi
    
    if [ -n "$desc" ]; then
        echo "✅ Description: $(echo "$desc" | cut -d'"' -f4 | cut -c1-50)..."
    else
        echo "❌ Missing description"
    fi
    
    if [ -n "$og_title" ]; then
        echo "✅ OG Title: $(echo "$og_title" | cut -d'"' -f4 | cut -c1-30)..."
    else
        echo "❌ Missing OG Title"
    fi
    
    if [ -n "$og_desc" ]; then
        echo "✅ OG Description: $(echo "$og_desc" | cut -d'"' -f4 | cut -c1-40)..."
    else
        echo "❌ Missing OG Description"
    fi
    
    if [ -n "$og_type" ]; then
        echo "✅ OG Type: $(echo "$og_type" | cut -d'"' -f4)"
    else
        echo "❌ Missing OG Type"
    fi
    
    echo ""
done
