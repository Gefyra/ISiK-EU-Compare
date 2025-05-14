#!/bin/bash
INDEX_PATH="Comparison/index.html"
echo "<html><head><title>Overview</title></head><body><h1>Result overview</h1><ul>" > "$INDEX_PATH"
for d in Comparison/*/ ; do
  name=$(basename "$d")
  if [[ -f "$d/index.html" ]]; then
    echo "<li><a href=\"$name/index.html\">$name</a></li>" >> "$INDEX_PATH"
  elif [[ -f "$d/compare.log" ]]; then
    echo "<li><strong>$name</strong>: ❌ Failed – <a href=\"$name/compare.log\">View error log</a></li>" >> "$INDEX_PATH"
  else
    echo "<li><strong>$name</strong>: ⚠️ No result found</li>" >> "$INDEX_PATH"
  fi
done
echo "</ul></body></html>" >> "$INDEX_PATH"