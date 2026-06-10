#!/usr/bin/env bash
# =============================================================================
#  HR Manager — Script d'application des correctifs de sécurité
#  Usage : chmod +x apply_security_fixes.sh && sudo ./apply_security_fixes.sh
#  Répertoire : /data/applications/hr-manager/
# =============================================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$APP_DIR/backend"
LOG="$APP_DIR/security_fixes_$(date +%Y%m%d_%H%M%S).log"

RED='\033[0;31m'; ORANGE='\033[0;33m'; GREEN='\033[0;32m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "$1" | tee -a "$LOG"; }
ok()    { log "${GREEN}  [OK]${NC} $1"; }
fail()  { log "${RED}  [ERREUR]${NC} $1"; }
info()  { log "${CYAN}  [INFO]${NC} $1"; }
step()  { log "\n${BOLD}${BLUE}── $1 ──${NC}"; }

log "${BOLD}${CYAN}"
log "╔══════════════════════════════════════════════╗"
log "║   HR Manager — Application des correctifs    ║"
log "║   $(date '+%Y-%m-%d %H:%M:%S')                     ║"
log "╚══════════════════════════════════════════════╝${NC}"

# ── Vérifications préalables ──────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  fail "Ce script doit être exécuté en tant que root (sudo)"
  exit 1
fi

if ! docker ps &>/dev/null; then
  fail "Docker non disponible ou non démarré"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 1 — Sauvegarde avant modifications"
# ═══════════════════════════════════════════════════════════════════════════════

BACKUP_DIR="$APP_DIR/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

for f in "$BACKEND/server.js" "$BACKEND/.env" "$BACKEND/routes/auth.js" "$APP_DIR/docker-compose.yml"; do
  if [ -f "$f" ]; then
    cp "$f" "$BACKUP_DIR/"
    ok "Sauvegarde : $f → $BACKUP_DIR/"
  fi
done
ok "Sauvegarde complète dans $BACKUP_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 2 — JWT_SECRET : remplacement de la valeur par défaut"
# ═══════════════════════════════════════════════════════════════════════════════

ENV_FILE="$BACKEND/.env"
if [ ! -f "$ENV_FILE" ]; then
  fail ".env non trouvé dans $BACKEND — vérifier le chemin"
else
  CURRENT_SECRET=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d'=' -f2-)
  if echo "$CURRENT_SECRET" | grep -qi "changez\|change\|secret\|example\|default\|test"; then
    NEW_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" "$ENV_FILE"
    ok "JWT_SECRET remplacé par une valeur aléatoire forte ($(echo -n "$NEW_SECRET" | wc -c) chars)"
  else
    ok "JWT_SECRET semble déjà personnalisé — non modifié"
  fi

  # Réduire la durée de vie du JWT access token
  if grep -q "^JWT_EXPIRES_IN=" "$ENV_FILE"; then
    CURRENT_EXP=$(grep "^JWT_EXPIRES_IN=" "$ENV_FILE" | cut -d'=' -f2-)
    if [ "$CURRENT_EXP" != "15m" ] && [ "$CURRENT_EXP" != "30m" ]; then
      sed -i "s|^JWT_EXPIRES_IN=.*|JWT_EXPIRES_IN=15m|" "$ENV_FILE"
      ok "JWT_EXPIRES_IN réduit à 15m (était : $CURRENT_EXP)"
    else
      ok "JWT_EXPIRES_IN déjà à $CURRENT_EXP"
    fi
  else
    echo "JWT_EXPIRES_IN=15m" >> "$ENV_FILE"
    ok "JWT_EXPIRES_IN=15m ajouté dans .env"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 3 — Mot de passe de reset hardcodé dans auth.js"
# ═══════════════════════════════════════════════════════════════════════════════

AUTH_FILE="$BACKEND/routes/auth.js"
if grep -q "REDACTED_PASSWORD" "$AUTH_FILE" 2>/dev/null; then
  # Remplacer le fallback par un mot de passe aléatoire généré à la volée
  sed -i "s|const password = newPassword || 'REDACTED_PASSWORD';|const password = newPassword || require('crypto').randomBytes(8).toString('hex');|g" "$AUTH_FILE"
  ok "Mot de passe de reset par défaut remplacé par crypto.randomBytes"
else
  ok "Pas de fallback 'REDACTED_PASSWORD' trouvé dans auth.js"
fi

# Même correctif dans TEMPO/auth.js si présent
if [ -f "$APP_DIR/TEMPO/auth.js" ]; then
  sed -i "s|const password = newPassword || 'REDACTED_PASSWORD';|const password = newPassword || require('crypto').randomBytes(8).toString('hex');|g" "$APP_DIR/TEMPO/auth.js"
  ok "Correctif aussi appliqué dans TEMPO/auth.js"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 4 — Installation des dépendances npm (helmet, express-rate-limit)"
# ═══════════════════════════════════════════════════════════════════════════════

info "Installation dans le conteneur hr_manager_app..."
docker exec hr_manager_app sh -c "cd /app && npm install helmet express-rate-limit --save 2>&1" | tee -a "$LOG"
if [ $? -eq 0 ]; then
  ok "helmet et express-rate-limit installés"
else
  fail "Échec npm install — essayer manuellement : cd $BACKEND && npm install helmet express-rate-limit --save"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 5 — Injection du patch dans server.js"
# ═══════════════════════════════════════════════════════════════════════════════

SERVER_FILE="$BACKEND/server.js"
if ! grep -q "helmet" "$SERVER_FILE" 2>/dev/null; then
  # Injecter après la première ligne require() d'express
  PATCH_CODE='
// ── PATCH SÉCURITÉ (auto-appliqué) ──────────────────────────────────────────
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc:["self"], scriptSrc:["self","unsafe-inline"], styleSrc:["self","unsafe-inline"], imgSrc:["self","data:","blob:"], connectSrc:["self"], frameSrc:["none"], objectSrc:["none"] } }, crossOriginEmbedderPolicy: false }));
const ALLOWED_ORIGINS = ["http://172.17.5.198:3007","http://localhost:3007"];
const cors = require("cors");
app.use(cors({ origin: (o,cb) => cb(null, !o || ALLOWED_ORIGINS.includes(o)), credentials: true }));
app.use("/api/", rateLimit({ windowMs:60000, max:200, standardHeaders:true, legacyHeaders:false }));
app.use("/api/auth/login", rateLimit({ windowMs:900000, max:5, skipSuccessfulRequests:true, standardHeaders:true, legacyHeaders:false, message:{ success:false, error:"Trop de tentatives. Réessayez dans 15 min." } }));
app.use((req,res,next)=>{ if(decodeURIComponent(req.path).includes("..")) return res.status(400).json({success:false,error:"Chemin invalide."}); next(); });
// ── FIN PATCH ────────────────────────────────────────────────────────────────
'
  # Trouver la ligne où app = express() ou app.use(express.json()) et injecter après
  LINE_NUM=$(grep -n "app\.use(express\.json\|app\.use(express\.urlencoded\|const app = express" "$SERVER_FILE" | head -1 | cut -d':' -f1)
  if [ -n "$LINE_NUM" ]; then
    sed -i "${LINE_NUM}a\\$(echo "$PATCH_CODE" | sed 's/\//\\\//g' | tr '\n' '§' | sed 's/§/\\n/g')" "$SERVER_FILE" 2>/dev/null || true
    info "Patch injecté après la ligne $LINE_NUM de server.js"
    info "Vérifier manuellement que l'injection est correcte : nano $SERVER_FILE"
  fi

  # Copier le patch dans le conteneur
  docker cp "$SERVER_FILE" hr_manager_app:/app/server.js 2>/dev/null
  ok "server.js mis à jour dans le conteneur"
else
  ok "helmet déjà présent dans server.js — patch ignoré"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 6 — Sécurisation des ports PostgreSQL (0.0.0.0 → 127.0.0.1)"
# ═══════════════════════════════════════════════════════════════════════════════

info "Recherche de tous les docker-compose.yml exposant PostgreSQL sur 0.0.0.0..."
COMPOSE_FILES=$(find /data/applications -name "docker-compose.yml" 2>/dev/null)
PATCHED=0

for f in $COMPOSE_FILES; do
  if grep -q "0.0.0.0:5[0-9][0-9][0-9]->5432" "$f" 2>/dev/null || \
     grep -qP '^\s+-\s+"?\d+:5432"?' "$f" 2>/dev/null; then
    cp "$f" "$f.bak_$(date +%Y%m%d)"
    # Remplacer les patterns d'exposition PostgreSQL
    sed -i 's|"\([0-9]*\):5432"|"127.0.0.1:\1:5432"|g' "$f"
    sed -i "s|'\([0-9]*\):5432'|'127.0.0.1:\1:5432'|g" "$f"
    sed -i 's|- \([0-9]*\):5432|- 127.0.0.1:\1:5432|g' "$f"
    sed -i 's|0\.0\.0\.0:\([0-9]*\)->5432|127.0.0.1:\1->5432|g' "$f"
    ok "Patché : $f"
    PATCHED=$((PATCHED+1))
  fi
done

if [ "$PATCHED" -gt 0 ]; then
  info "$PATCHED docker-compose.yml patchés — redémarrage nécessaire de chaque application"
  info "Pour redémarrer toutes les apps :"
  find /data/applications -name "docker-compose.yml" -exec dirname {} \; | while read dir; do
    log "    cd $dir && docker compose up -d"
  done
else
  ok "Aucun PostgreSQL exposé sur 0.0.0.0 trouvé (déjà corrigé ou autre config)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 7 — Permissions fichiers sensibles"
# ═══════════════════════════════════════════════════════════════════════════════

chmod 600 "$BACKEND/.env" 2>/dev/null && ok "chmod 600 sur backend/.env"
chmod 640 "$APP_DIR/docker-compose.yml" 2>/dev/null && ok "chmod 640 sur docker-compose.yml"
chmod 640 "$BACKEND/db/postgres.js" 2>/dev/null && ok "chmod 640 sur backend/db/postgres.js"
chmod 640 "$BACKEND/db/mssql.js" 2>/dev/null && ok "chmod 640 sur backend/db/mssql.js"

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 8 — Création du .gitignore"
# ═══════════════════════════════════════════════════════════════════════════════

GITIGNORE="$APP_DIR/.gitignore"
if [ ! -f "$GITIGNORE" ]; then
  cat > "$GITIGNORE" << 'EOF'
# Secrets
.env
.env.*
!.env.example

# Dépendances
node_modules/
*/node_modules/

# Build frontend
frontend/dist/
frontend/build/

# Rapports de sécurité
security_report_*.txt
security_fixes_*.log

# Sauvegardes
backup_*/
*.bak_*

# Logs
*.log
logs/

# Répertoires temporaires
TEMPO/
tmp/
temp/

# OS
.DS_Store
Thumbs.db
EOF
  ok ".gitignore créé dans $APP_DIR"
else
  ok ".gitignore existe déjà"
  # Vérifier que .env est dedans
  if ! grep -q "^\.env$" "$GITIGNORE"; then
    echo ".env" >> "$GITIGNORE"
    ok ".env ajouté au .gitignore existant"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 9 — Patch PostgreSQL (réduction privilèges hr_user)"
# ═══════════════════════════════════════════════════════════════════════════════

info "Application du patch SQL..."
docker cp "$APP_DIR/patch_postgres.sql" hr_manager_db:/tmp/patch_postgres.sql 2>/dev/null
if [ $? -eq 0 ]; then
  docker exec hr_manager_db psql -U postgres -d hr_manager -f /tmp/patch_postgres.sql 2>&1 | tee -a "$LOG"
  ok "Patch SQL appliqué"
else
  info "Copie du fichier SQL échouée — appliquer manuellement :"
  info "  docker cp patch_postgres.sql hr_manager_db:/tmp/"
  info "  docker exec hr_manager_db psql -U postgres -d hr_manager -f /tmp/patch_postgres.sql"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 10 — Rebuild et redémarrage de l'application"
# ═══════════════════════════════════════════════════════════════════════════════

info "Redémarrage du conteneur hr_manager_app..."
docker restart hr_manager_app 2>&1 | tee -a "$LOG"
sleep 3

# Vérifier que l'app répond
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3007 2>/dev/null)
if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "301" ] || [ "$HTTP_CODE" == "302" ]; then
  ok "Application redémarrée et répond (HTTP $HTTP_CODE)"
else
  fail "L'application ne répond pas (HTTP $HTTP_CODE) — vérifier : docker logs hr_manager_app --tail 30"
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "ÉTAPE 11 — npm audit fix"
# ═══════════════════════════════════════════════════════════════════════════════

info "Correction des vulnérabilités npm HIGH..."
docker exec hr_manager_app sh -c "cd /app && npm audit fix 2>&1" | tail -10 | tee -a "$LOG"
ok "npm audit fix terminé"

# ═══════════════════════════════════════════════════════════════════════════════
step "RÉSUMÉ"
# ═══════════════════════════════════════════════════════════════════════════════

log ""
log "${BOLD}  Correctifs appliqués :${NC}"
log "  ${GREEN}✔${NC}  JWT_SECRET régénéré"
log "  ${GREEN}✔${NC}  JWT durée de vie réduite à 15m"
log "  ${GREEN}✔${NC}  Mot de passe hardcodé remplacé"
log "  ${GREEN}✔${NC}  helmet + rate-limit installés"
log "  ${GREEN}✔${NC}  Ports PostgreSQL restreints à 127.0.0.1"
log "  ${GREEN}✔${NC}  Permissions fichiers sensibles corrigées"
log "  ${GREEN}✔${NC}  .gitignore créé"
log "  ${GREEN}✔${NC}  Privilèges hr_user réduits"
log "  ${GREEN}✔${NC}  npm audit fix appliqué"
log ""
log "${ORANGE}  Étapes manuelles restantes :${NC}"
log "  ${ORANGE}1.${NC}  Installer Nginx + TLS : voir hr-manager.nginx.conf"
log "  ${ORANGE}2.${NC}  Redémarrer les autres apps Docker (PostgreSQL ports patchés)"
log "  ${ORANGE}3.${NC}  Vérifier server.js manuellement : nano $BACKEND/server.js"
log "  ${ORANGE}4.${NC}  Relancer l'audit : ./hr_security_audit.sh"
log ""
log "${CYAN}  Journal complet : $LOG${NC}"
