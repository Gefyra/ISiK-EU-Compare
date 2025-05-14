#!/bin/bash
CACHE_DIR="$HOME/.fhir/packages"
if [ -d "PackagesForCache" ]; then
  for pkgdir in PackagesForCache/*; do
    if [ -d "$pkgdir/package" ]; then
      pkg_id=$(basename "$pkgdir")
      target_dir="$CACHE_DIR/$pkg_id"
      echo "📂 Copying $pkgdir → $target_dir"
      mkdir -p "$target_dir"
      cp -r "$pkgdir/package" "$target_dir/"
    else
      echo "⚠️ Skipping $pkgdir – no 'package/' subfolder found"
    fi
  done
else
  echo "ℹ️ No PackagesForCache directory found – skipping"
fi