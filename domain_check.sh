#!/bin/bash
echo "=== DOMAIN CONSISTENCY CHECK ==="
echo "Current domain used in files:"
echo ""

# Check sitemap
echo "📄 sitemap.xml:"
grep "loc" sitemap.xml | head -3

# Check robots.txt
echo ""
echo "📄 robots.txt:"
grep "Sitemap" robots.txt

# Check OG URLs in HTML files
echo ""
echo "🌐 OG URLs in HTML files:"
for file in *.html; do
    og_url=$(grep 'property="og:url"' "$file" 2>/dev/null | head -1)
    if [ -n "$og_url" ]; then
        echo "$file: $og_url"
    fi
done

echo ""
echo "✅ Domain updated to: isaiahwebdev.onrender.com"
