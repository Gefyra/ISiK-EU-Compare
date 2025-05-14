#!/bin/bash
if command -v sudo >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y jq curl
else
  apt-get update
  apt-get install -y jq curl
fi
mkdir -p "$HOME/.local/bin"
YQ_VERSION=v4.40.5
curl -L "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o "$HOME/.local/bin/yq"
chmod +x "$HOME/.local/bin/yq"
echo "$HOME/.local/bin" >> $GITHUB_PATH