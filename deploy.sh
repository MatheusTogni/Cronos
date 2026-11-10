#!/bin/bash

set -euo pipefail

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

BACKUP_DIR="$HOME/backups/deploy/Cronos"
REPO_DIR="$HOME/Cronos"
FRONT_WWW="/var/www/cronos"
PM2_APP="cronos-api"
PREV_COMMIT=""

rollback() {
  echo "❌ ERRO DETECTADO — iniciando rollback..."

  if [ -d "$BACKUP_DIR/front" ]; then
    echo "↩️  Restaurando frontend..."
    rm -rf "$FRONT_WWW"/*
    cp -a "$BACKUP_DIR/front/." "$FRONT_WWW/"
  fi

  if [ -d "$BACKUP_DIR/back" ]; then
    echo "↩️  Restaurando backend..."
    rm -rf "$REPO_DIR/back/dist"
    cp -a "$BACKUP_DIR/back/." "$REPO_DIR/back/dist/"
    pm2 reload "$PM2_APP" --update-env || true
  fi

  if [ -n "$PREV_COMMIT" ]; then
    echo "↩️  Revertendo código para $PREV_COMMIT..."
    cd "$REPO_DIR"
    git reset --hard "$PREV_COMMIT"
  fi

  sudo systemctl reload nginx || true

  echo "⚠️  Rollback concluído. Verifique os logs: pm2 logs $PM2_APP"
  exit 1
}

trap rollback ERR

echo "🚀 INICIANDO DEPLOY..."

cd "$REPO_DIR"

echo "💾 Fazendo backup..."
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/front" "$BACKUP_DIR/back"
[ -d "$FRONT_WWW" ] && cp -a "$FRONT_WWW/." "$BACKUP_DIR/front/"
[ -d "$REPO_DIR/back/dist" ] && cp -a "$REPO_DIR/back/dist/." "$BACKUP_DIR/back/"
PREV_COMMIT=$(git rev-parse HEAD)

echo "📥 Atualizando repositório..."
git reset --hard HEAD
git clean -fd
git pull origin main

# FRONTEND
echo "📦 Buildando frontend..."
cd front
npm ci
npm run build

echo "📁 Publicando frontend..."
rm -rf "$FRONT_WWW"/*
cp -a dist/. "$FRONT_WWW/"

# BACKEND
echo "🔧 Buildando backend..."
cd ../back
npm ci
npm run build

echo "♻️ Atualizando backend..."
pm2 reload "$PM2_APP" --update-env || pm2 start ecosystem.config.cjs

echo "💾 Salvando PM2..."
pm2 save

echo "🔄 Recarregando Nginx..."
sudo systemctl reload nginx

echo "✅ DEPLOY FINALIZADO!"
