#!/usr/bin/env bash
# =============================================================================
#  HR Manager — Script d'audit de sécurité
#  Usage : chmod +x hr_security_audit.sh && sudo ./hr_security_audit.sh
#  Cible : VM 172.17.5.198, app sur port 3007
# =============================================================================

BASE_URL="http://localhost:3007"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="$APP_DIR/security_report_$(date +%Y%m%d_%H%M%S).txt"
PASS=0; FAIL=0; WARN=0

# ── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; ORANGE='\033[0;33m'; GREEN='\033[0;32m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "$1" | tee -a "$REPORT_FILE"; }
ok()   { log "${GREEN}  [PASS]${NC} $1"; ((PASS++)); }
fail() { log "${RED}  [FAIL]${NC} $1"; ((FAIL++)); }
warn() { log "${ORANGE}  [WARN]${NC} $1"; ((WARN++)); }
info() { log "${CYAN}  [INFO]${NC} $1"; }
section() { log "\n${BOLD}${BLUE}══════════════════════════════════════════════${NC}"; log "${BOLD}${BLUE}  $1${NC}"; log "${BOLD}${BLUE}══════════════════════════════════════════════${NC}"; }

# ── Header ──────────────────────────────────────────────────────────────────
clear
log "${BOLD}${CYAN}"
log "╔══════════════════════════════════════════════╗"
log "║     HR Manager — Audit de sécurité           ║"
log "║     $(date '+%Y-%m-%d %H:%M:%S')                     ║"
log "╚══════════════════════════════════════════════╝${NC}"
log "  Rapport : $REPORT_FILE\n"

# ═══════════════════════════════════════════════════════════════════════════
section "1. CREDENTIALS & SECRETS EN CLAIR"
# ═══════════════════════════════════════════════════════════════════════════

info "Recherche de mots de passe codés en dur dans le code source..."
CRED_PATTERNS=("password" "Password" "PASSWORD" "secret" "SECRET" "passwd" "JWT_SECRET" "DB_PASS" "MSSQL_PASS")
FOUND_CREDS=0
for pattern in "${CRED_PATTERNS[@]}"; do
  hits=$(grep -rn --include="*.js" --include="*.env*" --include="*.yml" --include="*.yaml" \
    "$pattern" "$APP_DIR" 2>/dev/null | grep -v "node_modules" | grep -v ".git" | grep -v "//.*$pattern" | grep -v "req\." | grep -v "body\." | grep -v "user\." | grep -v "hash" | grep -v "bcrypt" | wc -l)
  if [ "$hits" -gt 0 ]; then
    warn "Pattern '$pattern' trouvé $hits fois dans le code"
    grep -rn --include="*.js" --include="*.env*" --include="*.yml" "$pattern" "$APP_DIR" 2>/dev/null \
      | grep -v "node_modules" | grep -v "hash\|bcrypt\|req\.\|body\.\|user\." | head -5 | while read line; do
        log "    ${ORANGE}→ $line${NC}"
      done
    FOUND_CREDS=1
  fi
done
[ "$FOUND_CREDS" -eq 0 ] && ok "Aucun credential en clair détecté dans le code"

info "Vérification du fichier .env..."
if [ -f "$APP_DIR/.env" ]; then
  info "Fichier .env présent"
  if grep -qE "=.{3,}" "$APP_DIR/.env" 2>/dev/null; then
    warn ".env contient des valeurs — vérifier qu'il n'est pas versionné"
  fi
else
  fail "Pas de fichier .env — les secrets sont probablement dans docker-compose.yml ou le code"
fi

info "Vérification .gitignore..."
if [ -f "$APP_DIR/.gitignore" ]; then
  if grep -q ".env" "$APP_DIR/.gitignore" 2>/dev/null; then
    ok ".env est dans .gitignore"
  else
    fail ".env absent du .gitignore — risque d'exposition dans Git"
  fi
else
  warn "Pas de .gitignore trouvé dans $APP_DIR"
fi

info "Recherche de tokens/clés hardcodées..."
JWT_HARDCODED=$(grep -rn --include="*.js" "jwt\.sign\|jwt\.verify" "$APP_DIR/backend" 2>/dev/null | grep -v "node_modules" | grep "process\.env" | wc -l)
JWT_HARDCODED_BAD=$(grep -rn --include="*.js" "jwt\.sign\|jwt\.verify" "$APP_DIR/backend" 2>/dev/null | grep -v "node_modules" | grep -v "process\.env" | wc -l)
if [ "$JWT_HARDCODED_BAD" -gt 0 ]; then
  fail "JWT signé/vérifié SANS process.env ($JWT_HARDCODED_BAD occurrences) → secret probablement codé en dur"
  grep -rn --include="*.js" "jwt\.sign\|jwt\.verify" "$APP_DIR/backend" 2>/dev/null | grep -v "node_modules" | grep -v "process\.env" | head -3 | while read l; do log "    ${RED}→ $l${NC}"; done
else
  ok "JWT utilise process.env pour le secret ($JWT_HARDCODED occurrences)"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "2. AUTHENTIFICATION & TOKENS JWT"
# ═══════════════════════════════════════════════════════════════════════════

info "Test de login avec credentials valides..."
LOGIN_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@monetiquetunisie.com","password":"REDACTED_PASSWORD"}' 2>/dev/null)
if [ "$LOGIN_RESP" == "200" ]; then
  ok "Endpoint /api/auth/login répond (HTTP 200)"
  TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@monetiquetunisie.com","password":"REDACTED_PASSWORD"}' 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','') or d.get('accessToken',''))" 2>/dev/null)
else
  warn "Login échoué (HTTP $LOGIN_RESP) — tests JWT ignorés"
  TOKEN=""
fi

info "Test brute-force : 10 tentatives rapides sans blocage..."
BF_BLOCKED=0
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@monetiquetunisie.com","password":"wrong_pass_'$i'"}' 2>/dev/null)
  if [ "$CODE" == "429" ] || [ "$CODE" == "423" ]; then
    BF_BLOCKED=1; break
  fi
done
if [ "$BF_BLOCKED" -eq 1 ]; then
  ok "Rate limiting actif : tentatives bloquées (HTTP 429/423)"
else
  fail "Pas de rate limiting sur /api/auth/login — brute-force possible"
fi

if [ -n "$TOKEN" ]; then
  info "Analyse du payload JWT..."
  PAYLOAD=$(echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d,indent=2))" 2>/dev/null)
  if [ -n "$PAYLOAD" ]; then
    info "Payload JWT décodé :\n$(echo "$PAYLOAD" | sed 's/^/    /')"
    EXP=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('exp',0))" 2>/dev/null)
    IAT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('iat',0))" 2>/dev/null)
    if [ -n "$EXP" ] && [ -n "$IAT" ] && [ "$EXP" -gt 0 ] && [ "$IAT" -gt 0 ]; then
      LIFETIME=$(( EXP - IAT ))
      if [ "$LIFETIME" -le 900 ]; then
        ok "Durée de vie JWT courte : ${LIFETIME}s (≤ 15 min)"
      elif [ "$LIFETIME" -le 3600 ]; then
        warn "Durée de vie JWT : ${LIFETIME}s (entre 15 min et 1h — acceptable)"
      elif [ "$LIFETIME" -le 86400 ]; then
        warn "Durée de vie JWT : ${LIFETIME}s ($(( LIFETIME/3600 ))h — long, réduire à 15-30 min)"
      else
        fail "Durée de vie JWT trop longue : ${LIFETIME}s ($(( LIFETIME/86400 )) jours) — risque en cas de vol"
      fi
    fi
    ALG=$(echo "$TOKEN" | cut -d'.' -f1 | base64 -d 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('alg','?'))" 2>/dev/null)
    if [ "$ALG" == "none" ]; then
      fail "CRITIQUE : JWT algorithm = 'none' — vérification de signature désactivée !"
    elif [ "$ALG" == "HS256" ] || [ "$ALG" == "HS384" ] || [ "$ALG" == "HS512" ]; then
      ok "Algorithme JWT : $ALG (HMAC symétrique)"
    elif [ "$ALG" == "RS256" ] || [ "$ALG" == "ES256" ]; then
      ok "Algorithme JWT : $ALG (asymétrique — recommandé)"
    else
      warn "Algorithme JWT : $ALG"
    fi
  fi

  info "Test accès sans token..."
  NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/employees" 2>/dev/null)
  if [ "$NO_AUTH" == "401" ] || [ "$NO_AUTH" == "403" ]; then
    ok "API protégée sans token (HTTP $NO_AUTH)"
  else
    fail "API accessible sans authentification (HTTP $NO_AUTH) sur /api/employees"
  fi

  info "Test escalade de privilèges : accès config en tant que RH..."
  RH_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"rh@monetiquetunisie.com","password":"REDACTED_PASSWORD"}' 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','') or d.get('accessToken',''))" 2>/dev/null)
  if [ -n "$RH_TOKEN" ]; then
    CONFIG_ACCESS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/config/system" \
      -H "Authorization: Bearer $RH_TOKEN" 2>/dev/null)
    if [ "$CONFIG_ACCESS" == "403" ] || [ "$CONFIG_ACCESS" == "401" ]; then
      ok "Isolation des rôles : RH ne peut pas accéder à /api/config/system (HTTP $CONFIG_ACCESS)"
    elif [ "$CONFIG_ACCESS" == "404" ]; then
      info "Route /api/config/system inexistante (HTTP 404)"
    else
      warn "RH peut accéder à /api/config/system (HTTP $CONFIG_ACCESS) — vérifier les permissions"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
section "3. HEADERS DE SÉCURITÉ HTTP"
# ═══════════════════════════════════════════════════════════════════════════

info "Analyse des headers de réponse HTTP..."
HEADERS=$(curl -sI "$BASE_URL" 2>/dev/null)

check_header() {
  local name="$1"; local pattern="$2"
  if echo "$HEADERS" | grep -qi "$pattern"; then
    ok "Header '$name' présent"
  else
    fail "Header '$name' ABSENT — vulnérabilité $([ "$name" == 'Content-Security-Policy' ] && echo 'XSS' || echo 'misc')"
  fi
}

check_header "X-Content-Type-Options"    "x-content-type-options"
check_header "X-Frame-Options"           "x-frame-options"
check_header "Content-Security-Policy"   "content-security-policy"
check_header "Strict-Transport-Security" "strict-transport-security"
check_header "Referrer-Policy"           "referrer-policy"
check_header "X-XSS-Protection"          "x-xss-protection"

SERVER_HDR=$(echo "$HEADERS" | grep -i "^server:" | head -1)
if [ -n "$SERVER_HDR" ]; then
  warn "Header 'Server' expose la technologie : $SERVER_HDR"
else
  ok "Header 'Server' absent (pas de fingerprinting)"
fi
XPOWERED=$(echo "$HEADERS" | grep -i "x-powered-by" | head -1)
if [ -n "$XPOWERED" ]; then
  fail "Header 'X-Powered-By' expose le framework : $XPOWERED — ajouter app.disable('x-powered-by')"
else
  ok "Header 'X-Powered-By' absent"
fi

info "Vérification CORS..."
CORS=$(curl -sI -H "Origin: http://evil.com" "$BASE_URL/api/auth/login" 2>/dev/null | grep -i "access-control-allow-origin")
if echo "$CORS" | grep -q "\*"; then
  fail "CORS trop permissif : Access-Control-Allow-Origin: * — toutes les origines autorisées"
elif [ -n "$CORS" ]; then
  ok "CORS restreint : $CORS"
else
  info "Pas d'en-tête CORS retourné (normal si frontend même origine)"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "4. INJECTION & VALIDATION DES ENTRÉES"
# ═══════════════════════════════════════════════════════════════════════════

info "Test injection SQL basique sur login..."
SQLI_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@monetiquetunisie.com'\'' OR '\''1'\''='\''1","password":"x"}' 2>/dev/null)
if [ "$SQLI_RESP" == "200" ]; then
  fail "CRITIQUE : Possible injection SQL — login réussi avec payload SQLi !"
elif [ "$SQLI_RESP" == "400" ] || [ "$SQLI_RESP" == "401" ]; then
  ok "Login résiste à l'injection SQL basique (HTTP $SQLI_RESP)"
else
  warn "Réponse inattendue à SQLi (HTTP $SQLI_RESP) — investigation manuelle recommandée"
fi

info "Test injection NoSQL..."
NOSQL_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":{"$gt":""},"password":{"$gt":""}}' 2>/dev/null)
if [ "$NOSQL_RESP" == "200" ]; then
  warn "Possible injection NoSQL — réponse 200 avec payload {\$gt}"
else
  ok "Résiste à l'injection NoSQL basique (HTTP $NOSQL_RESP)"
fi

if [ -n "$TOKEN" ]; then
  info "Test XSS dans les paramètres employé..."
  XSS_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/employees?search=<script>alert(1)</script>" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  XSS_BODY=$(curl -s "$BASE_URL/api/employees?search=<script>alert(1)</script>" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  if echo "$XSS_BODY" | grep -q "<script>"; then
    fail "XSS potentiel : payload <script> non échappé dans la réponse"
  else
    ok "Payload XSS non reflété dans la réponse"
  fi

  info "Test path traversal..."
  PT_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/../etc/passwd" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  if [ "$PT_RESP" == "200" ]; then
    fail "Path traversal possible — HTTP 200 sur /../etc/passwd"
  else
    ok "Path traversal bloqué (HTTP $PT_RESP)"
  fi

  info "Test IDOR : accès à un employé avec ID arbitraire..."
  for test_id in 1 2 999 0 -1; do
    IDOR_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/employees/$test_id" \
      -H "Authorization: Bearer $RH_TOKEN" 2>/dev/null)
    if [ "$IDOR_RESP" == "200" ]; then
      info "  Employee ID $test_id accessible (HTTP 200) — vérifier que c'est autorisé"
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
section "5. CONFIGURATION DOCKER & SYSTÈME"
# ═══════════════════════════════════════════════════════════════════════════

info "Analyse du docker-compose.yml..."
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
if [ -f "$COMPOSE_FILE" ]; then
  if grep -q "privileged: true" "$COMPOSE_FILE" 2>/dev/null; then
    fail "Conteneur en mode PRIVILEGED — risque d'évasion de conteneur"
  else
    ok "Pas de mode privileged dans docker-compose"
  fi
  if grep -q "/var/run/docker.sock" "$COMPOSE_FILE" 2>/dev/null; then
    fail "Docker socket monté dans le conteneur — escalade de privilèges possible"
  else
    ok "Docker socket non monté"
  fi
  if grep -qE "^\s*environment:" "$COMPOSE_FILE" 2>/dev/null; then
    ENV_CREDS=$(grep -A 30 "environment:" "$COMPOSE_FILE" | grep -iE "password|secret|pass|key" | grep -v "#" | wc -l)
    if [ "$ENV_CREDS" -gt 0 ]; then
      warn "$ENV_CREDS variable(s) sensible(s) définies en clair dans docker-compose.yml"
      grep -A 30 "environment:" "$COMPOSE_FILE" | grep -iE "password|secret|pass|key" | grep -v "#" | while read l; do
        log "    ${ORANGE}→ $l${NC}"
      done
    else
      ok "Pas de credentials en clair dans la section environment"
    fi
  fi
  if grep -q "env_file" "$COMPOSE_FILE" 2>/dev/null; then
    ok "docker-compose utilise env_file pour les secrets"
  fi
else
  warn "docker-compose.yml non trouvé à $COMPOSE_FILE"
fi

info "Ports exposés des conteneurs Docker..."
EXPOSED_PORTS=$(docker ps --format "{{.Names}}: {{.Ports}}" 2>/dev/null)
if [ -n "$EXPOSED_PORTS" ]; then
  info "Conteneurs actifs et ports :\n$(echo "$EXPOSED_PORTS" | sed 's/^/    /')"
  if echo "$EXPOSED_PORTS" | grep -q "0.0.0.0:5432\|0.0.0.0:5441"; then
    fail "PostgreSQL exposé sur 0.0.0.0 — accessible depuis le réseau ! Restreindre à 127.0.0.1"
  else
    ok "PostgreSQL non exposé sur l'interface publique"
  fi
fi

info "Vérification des permissions sur les fichiers sensibles..."
for f in "$APP_DIR/.env" "$APP_DIR/docker-compose.yml" "$APP_DIR/backend/db/postgres.js"; do
  if [ -f "$f" ]; then
    PERMS=$(stat -c "%a %U:%G" "$f" 2>/dev/null)
    MODE=$(echo "$PERMS" | cut -d' ' -f1)
    if [ "$MODE" -ge 644 ] && [ "${MODE: -1}" != "0" ]; then
      warn "$f — permissions $PERMS (lisible par others)"
    else
      ok "$f — permissions $PERMS"
    fi
  fi
done

# ═══════════════════════════════════════════════════════════════════════════
section "6. BASE DE DONNÉES POSTGRESQL"
# ═══════════════════════════════════════════════════════════════════════════

info "Test de connexion PostgreSQL..."
PG_CONN=$(docker exec hr_manager_db psql -U hr_user -d hr_manager -c "SELECT version();" 2>/dev/null | head -3)
if [ -n "$PG_CONN" ]; then
  ok "Connexion PostgreSQL OK"
  
  info "Vérification du mot de passe par défaut PostgreSQL..."
  PG_DEFAULT=$(docker exec hr_manager_db psql -U postgres -c "\l" 2>/dev/null)
  if [ -n "$PG_DEFAULT" ]; then
    warn "Compte 'postgres' superadmin accessible sans mot de passe depuis le conteneur"
  fi

  info "Vérification des rôles et privilèges..."
  ROLES=$(docker exec hr_manager_db psql -U hr_user -d hr_manager -c "\du" 2>/dev/null)
  info "Rôles PostgreSQL :\n$(echo "$ROLES" | sed 's/^/    /')"

  info "Vérification des connexions actives..."
  CONNS=$(docker exec hr_manager_db psql -U hr_user -d hr_manager \
    -c "SELECT count(*) as nb, usename FROM pg_stat_activity GROUP BY usename;" 2>/dev/null)
  info "Connexions actives :\n$(echo "$CONNS" | sed 's/^/    /')"

  info "Recherche de données sensibles non chiffrées..."
  PASS_COL=$(docker exec hr_manager_db psql -U hr_user -d hr_manager \
    -c "SELECT column_name,table_name FROM information_schema.columns WHERE column_name ILIKE '%password%' OR column_name ILIKE '%passwd%';" 2>/dev/null)
  if echo "$PASS_COL" | grep -q "password"; then
    info "Colonnes 'password' trouvées :\n$(echo "$PASS_COL" | sed 's/^/    /')"
    # Vérifier si les mots de passe sont hashés
    PLAIN_PASS=$(docker exec hr_manager_db psql -U hr_user -d hr_manager \
      -c "SELECT password FROM users LIMIT 3;" 2>/dev/null | grep -v "^\-\|^$\|password\|rows" | head -3)
    if echo "$PLAIN_PASS" | grep -qE "^\$2b\$|\$2a\$|^\$argon"; then
      ok "Mots de passe stockés hashés (bcrypt/argon détecté)"
    elif [ -n "$PLAIN_PASS" ]; then
      warn "Vérifier manuellement le hachage des mots de passe en DB"
    fi
  fi
else
  warn "Connexion PostgreSQL échouée — vérifier que le conteneur hr_manager_db tourne"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "7. DÉPENDANCES NPM VULNÉRABLES"
# ═══════════════════════════════════════════════════════════════════════════

info "Audit des dépendances npm (backend)..."
if [ -f "$APP_DIR/backend/package.json" ]; then
  cd "$APP_DIR/backend" || exit
  NPM_AUDIT=$(npm audit --json 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  v=d.get('metadata',{}).get('vulnerabilities',{})
  print(f\"Critical: {v.get('critical',0)}, High: {v.get('high',0)}, Moderate: {v.get('moderate',0)}, Low: {v.get('low',0)}\")
  print(f\"Total packages: {d.get('metadata',{}).get('totalDependencies',0)}\")
except: print('parse_error')
" 2>/dev/null)
  if echo "$NPM_AUDIT" | grep -q "parse_error"; then
    warn "Impossible de parser le résultat npm audit"
  else
    CRIT_NPM=$(echo "$NPM_AUDIT" | grep -oP 'Critical: \K\d+')
    HIGH_NPM=$(echo "$NPM_AUDIT" | grep -oP 'High: \K\d+')
    info "npm audit résultat : $NPM_AUDIT"
    if [ "$CRIT_NPM" -gt 0 ] 2>/dev/null; then
      fail "$CRIT_NPM vulnérabilité(s) CRITIQUE(S) dans les dépendances npm"
    elif [ "$HIGH_NPM" -gt 0 ] 2>/dev/null; then
      warn "$HIGH_NPM vulnérabilité(s) HIGH dans les dépendances npm — exécuter : npm audit fix"
    else
      ok "Pas de vulnérabilités critiques/high dans les dépendances"
    fi
  fi
else
  warn "package.json backend non trouvé"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "8. CONTRÔLE D'ACCÈS (RBAC)"
# ═══════════════════════════════════════════════════════════════════════════

if [ -n "$TOKEN" ] && [ -n "$RH_TOKEN" ]; then
  info "Test accès croisé entre rôles..."
  SENSITIVE_ROUTES=(
    "/api/employees"
    "/api/attendance/sync"
    "/api/leaves"
    "/api/config"
    "/api/dashboard"
  )
  for route in "${SENSITIVE_ROUTES[@]}"; do
    CODE_ADMIN=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$route" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    CODE_RH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$route" \
      -H "Authorization: Bearer $RH_TOKEN" 2>/dev/null)
    info "  $route → admin: $CODE_ADMIN | rh: $CODE_RH"
  done

  info "Test méthodes HTTP non autorisées..."
  for method in DELETE PUT PATCH; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL/api/employees/999" \
      -H "Authorization: Bearer $RH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}' 2>/dev/null)
    if [ "$CODE" == "404" ] || [ "$CODE" == "403" ] || [ "$CODE" == "405" ]; then
      ok "Méthode $METHOD sur /api/employees/999 : HTTP $CODE"
    else
      info "Méthode $method sur /api/employees/999 : HTTP $CODE"
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
section "9. TLS & CHIFFREMENT EN TRANSIT"
# ═══════════════════════════════════════════════════════════════════════════

info "Vérification HTTPS..."
HTTPS_RESP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "https://localhost:3007" 2>/dev/null)
if [ "$HTTPS_RESP" == "200" ] || [ "$HTTPS_RESP" == "301" ] || [ "$HTTPS_RESP" == "302" ]; then
  ok "HTTPS disponible sur port 3007"
else
  fail "HTTPS non disponible — données transitent en clair (HTTP seulement)"
fi

info "Vérification Nginx (reverse proxy TLS)..."
if systemctl is-active --quiet nginx 2>/dev/null; then
  ok "Nginx actif — reverse proxy probablement configuré"
  NGINX_SSL=$(grep -r "ssl_certificate" /etc/nginx/ 2>/dev/null | head -1)
  if [ -n "$NGINX_SSL" ]; then
    ok "Certificat SSL configuré dans Nginx"
  else
    warn "Nginx actif mais pas de ssl_certificate trouvé dans la config"
  fi
else
  warn "Nginx non actif — pas de reverse proxy TLS détecté"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "10. LOGS & MONITORING"
# ═══════════════════════════════════════════════════════════════════════════

info "Vérification des logs applicatifs..."
LOG_SIZE=$(docker logs hr_manager_app 2>&1 | wc -l)
info "Lignes de logs disponibles : $LOG_SIZE"

info "Recherche d'erreurs 500 récentes dans les logs..."
ERR500=$(docker logs hr_manager_app 2>&1 | grep -i "error\|500\|unhandled\|exception" | tail -5)
if [ -n "$ERR500" ]; then
  warn "Erreurs récentes dans les logs :"
  echo "$ERR500" | sed 's/^/    /' | tee -a "$REPORT_FILE"
else
  ok "Pas d'erreurs 500 visibles dans les logs récents"
fi

info "Vérification de l'exposition d'informations dans les erreurs..."
ERR_RESP=$(curl -s "$BASE_URL/api/employees/INVALID_ID_TEST_9999" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
if echo "$ERR_RESP" | grep -qiE "stack|at Object|node_modules|syntax error"; then
  fail "Stack trace exposée dans les réponses d'erreur — risque d'information disclosure"
  echo "$ERR_RESP" | head -3 | sed 's/^/    /' | tee -a "$REPORT_FILE"
else
  ok "Pas de stack trace exposée dans les erreurs API"
fi

# ═══════════════════════════════════════════════════════════════════════════
section "RÉSUMÉ FINAL"
# ═══════════════════════════════════════════════════════════════════════════

TOTAL=$(( PASS + FAIL + WARN ))
log ""
log "${BOLD}  Résultats :${NC}"
log "  ${GREEN}✔ PASS${NC} : $PASS / $TOTAL"
log "  ${RED}✘ FAIL${NC} : $FAIL / $TOTAL"
log "  ${ORANGE}⚠ WARN${NC} : $WARN / $TOTAL"
log ""

if [ "$FAIL" -ge 5 ]; then
  log "${RED}${BOLD}  ⚠  NIVEAU DE RISQUE : ÉLEVÉ — Actions immédiates requises${NC}"
elif [ "$FAIL" -ge 2 ]; then
  log "${ORANGE}${BOLD}  ⚠  NIVEAU DE RISQUE : MOYEN — Corrections à planifier${NC}"
else
  log "${GREEN}${BOLD}  ✔  NIVEAU DE RISQUE : FAIBLE — Bonne posture de sécurité${NC}"
fi

log ""
log "${CYAN}  Rapport complet sauvegardé dans : $REPORT_FILE${NC}"
log "${CYAN}  Répertoire application : $APP_DIR${NC}"
log ""
log "  Prochaines étapes recommandées :"
log "  1. Changer tous les mots de passe exposés"
log "  2. Ajouter helmet + express-rate-limit dans server.js"
log "  3. Configurer HTTPS via Nginx"
log "  4. Exécuter : npm audit fix dans le répertoire backend"
log "  5. Mettre en place un fichier .env non versionné"
log ""
