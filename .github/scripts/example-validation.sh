#!/bin/bash
CONFIG_PATH=.github/config/InstanceValidationConfig.yml
count=$(yq '.instances | length' "$CONFIG_PATH")
echo "Validating $count example instances..."
mkdir -p ValidationResults
for i in $(seq 0 $((count - 1))); do
  name=$(yq ".instances[$i].name" "$CONFIG_PATH" | tr -d '"')
  file=$(yq ".instances[$i].file" "$CONFIG_PATH" | tr -d '"')
  ig=$(yq ".instances[$i].ig" "$CONFIG_PATH" | tr -d '"' | sed 's/@/#/g')
  profile=$(yq ".instances[$i].profile" "$CONFIG_PATH" | tr -d '"')
  echo "🧪 Validating $name using profile $profile from $ig..."
  if [[ "$file" == *.json ]]; then
    jq --arg p "$profile" '.meta.profile = [$p]' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    echo "🔧 meta.profile in $file updated"
  fi
  if java -jar tmp/validator_cli.jar $file -version 4.0 -ig $ig -profile $profile > "ValidationResults/$name.log" 2>&1; then
    echo "✅ $name valid" >> "ValidationResults/$name.log"
  else
    echo "❌ $name failed validation" >> "ValidationResults/$name.log"
  fi
done