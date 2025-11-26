#!/bin/bash
echo "=== Final Verification ==="
echo ""

for page in index.html projects.html certificates.html contact.html; do
    echo "Checking $page:"
    
    # Check description count
    desc_count=$(grep -c 'meta name="description"' "$page")
    echo "  Description tags: $desc_count"
    
    # Check keywords count  
    keywords_count=$(grep -c 'meta name="keywords"' "$page")
    echo "  Keywords tags: $keywords_count"
    
    # Check author count
    author_count=$(grep -c 'meta name="author"' "$page")
    echo "  Author tags: $author_count"
    
    # Check title
    title=$(grep "<title>" "$page")
    echo "  Title: $title"
    
    # Check skip links
    skip_count=$(grep -c "skip-link" "$page")
    echo "  Skip links: $skip_count"
    
    echo ""
done

echo "=== Head Sections ==="
for page in index.html projects.html certificates.html contact.html; do
    echo "$page head section:"
    head -15 "$page" | grep -E "(meta|title)" | head -8
    echo "---"
done
