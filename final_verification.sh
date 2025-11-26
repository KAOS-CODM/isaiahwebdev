#!/bin/bash
echo "=== FINAL VERIFICATION - ALL HEAD SECTIONS ==="
echo ""

for file in *.html; do
    echo "🎯 $file"
    echo "----------------------------------------"
    
    # Show the complete head section meta tags
    sed -n '/<head>/,/<\/head>/p' "$file" | grep -E "(title>|meta name=\"description\"|meta property=\"og:\")" | while read -r line; do
        if [[ "$line" == *"<title>"* ]]; then
            echo "📝 TITLE: $line"
        elif [[ "$line" == *'meta name="description"'* ]]; then
            echo "📋 DESC: $(echo "$line" | sed 's/.*content="\([^"]*\).*/\1/' | cut -c1-60)..."
        elif [[ "$line" == *'property="og:title"'* ]]; then
            echo "🔗 OG TITLE: $(echo "$line" | sed 's/.*content="\([^"]*\).*/\1/' | cut -c1-40)..."
        elif [[ "$line" == *'property="og:description"'* ]]; then
            echo "🔗 OG DESC: $(echo "$line" | sed 's/.*content="\([^"]*\).*/\1/' | cut -c1-50)..."
        elif [[ "$line" == *'property="og:type"'* ]]; then
            echo "🔗 OG TYPE: $(echo "$line" | sed 's/.*content="\([^"]*\).*/\1/')"
        fi
    done
    
    echo ""
done

echo "=== QUICK STATUS CHECK ==="
for file in index.html projects.html certificates.html contact.html about.html; do
    title_clean=$(grep "<title>" "$file" | head -1 | sed 's/<[^>]*>//g' | xargs)
    desc_count=$(grep -c 'meta name="description"' "$file")
    og_desc_count=$(grep -c 'property="og:description"' "$file")
    og_type_count=$(grep -c 'property="og:type"' "$file")
    
    echo "📄 $file:"
    echo "   Title: '$title_clean'"
    echo "   Status: $(if [ "$desc_count" -eq 1 ] && [ "$og_desc_count" -eq 1 ] && [ "$og_type_count" -eq 1 ]; then echo "✅ PERFECT"; else echo "⚠️  NEEDS FIX"; fi)"
    echo ""
done
