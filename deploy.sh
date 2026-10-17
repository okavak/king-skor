#!/usr/bin/env bash
# deploy.sh — sürüm damgası basar ve GitHub'a gönderir; GitHub Pages yeni sürümü yayınlar.
# Depo zaten bağlıysa (origin var) yalnızca git push yapılır. Kimlik bilgisi git'in kendi
# kimlik deposundan (macOS anahtar zinciri) gelir; gh girişi gerekmez.
# İlk kurulumda (origin yok) depo ve Pages açmak için bir kez gh auth login gerekir.
# Kullanım: ./deploy.sh [repo-adı]
set -euo pipefail
cd "$(dirname "$0")"
REPO="${1:-king-skor}"

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Yayın main dalından yapılır. Önce: git checkout main" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Çalışma ağacında commit edilmemiş değişiklik var; önce commit edin." >&2
  exit 1
fi

FIRST=0
if ! git remote get-url origin >/dev/null 2>&1; then
  FIRST=1
  if ! gh auth status >/dev/null 2>&1; then
    echo "İlk yayında depo ve Pages açmak için GitHub'a giriş gerekir: gh auth login" >&2
    exit 1
  fi
fi

node --test >/dev/null
VERSION="$(date +%Y.%m.%d-%H%M)"
sed -i '' "s/^const VERSION = .*/const VERSION = '${VERSION}';/" sw.js
sed -i '' "s/^export const APP_VERSION = .*/export const APP_VERSION = '${VERSION}';/" version.js
git add -A
git commit -q -m "release: ${VERSION}" || true

if [ "$FIRST" = 1 ]; then
  OWNER="$(gh api user --jq .login)"
  if gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    git remote add origin "https://github.com/${OWNER}/${REPO}.git"
    git push -u origin main
  else
    gh repo create "${REPO}" --public --source=. --remote=origin --push --description "Reklamsız King skor tablosu (PWA)"
  fi
  # Pages: main dalı, kök dizin. Varsa dokunma, yoksa oluştur.
  if ! gh api "repos/${OWNER}/${REPO}/pages" >/dev/null 2>&1; then
    gh api -X POST "repos/${OWNER}/${REPO}/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
  fi
else
  git push origin main
fi

# Yayın adresi origin'den: github.com/<sahip>/<depo> → https://<sahip>.github.io/<depo>/
SLUG="$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
echo
echo "Sürüm ${VERSION} gönderildi. Yayın adresi: https://${SLUG%%/*}.github.io/${SLUG#*/}/"
echo "GitHub Pages 1-2 dakikada günceller. Kurulu uygulama açılınca \"Yeni sürüm hazır\" bildirimi gösterir."
