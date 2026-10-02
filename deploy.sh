#!/usr/bin/env bash
# deploy.sh — sürüm damgası basar, GitHub'a gönderir, GitHub Pages'i açar.
# Gereksinim: gh auth login (bir kez). Kullanım: ./deploy.sh [repo-adı]
set -euo pipefail
cd "$(dirname "$0")"
REPO="${1:-king-skor}"

if ! gh auth status >/dev/null 2>&1; then
  echo "Önce GitHub'a giriş yapın: gh auth login" >&2
  exit 1
fi
OWNER="$(gh api user --jq .login)"

VERSION="$(date +%Y.%m.%d-%H%M)"
sed -i '' "s/^const VERSION = .*/const VERSION = '${VERSION}';/" sw.js
sed -i '' "s/^export const APP_VERSION = .*/export const APP_VERSION = '${VERSION}';/" version.js
node --test >/dev/null
git add -A
git commit -q -m "release: ${VERSION}" || true

if gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${OWNER}/${REPO}.git"
  git push -u origin main
else
  gh repo create "${REPO}" --public --source=. --remote=origin --push --description "Reklamsız King skor tablosu (PWA)"
fi

# Pages: main dalı, kök dizin. Varsa dokunma, yoksa oluştur.
if ! gh api "repos/${OWNER}/${REPO}/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/${OWNER}/${REPO}/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
fi
echo
echo "Yayın adresi: https://${OWNER}.github.io/${REPO}/"
echo "İlk yayın 1-2 dakika sürebilir. iPhone'da Safari ile açıp Paylaş → Ana Ekrana Ekle."
