#!/bin/bash

# ==============================================================================
# QUATRIX - UNIFIED LINUX INSTALLATION SCRIPT
# ==============================================================================
# This script automates the entire Quatrix setup process:
# 1. System Dependencies (Node.js 20, 32-bit libs, .NET 8, MariaDB)
# 2. Service User Creation (quatrix)
# 3. Environment Configuration (.env & JWT generation)
# 4. Node.js Dependency Installation & Production Build
# 5. Systemd Service Deployment (KillMode=process)
# 6. Firewall Configuration (UFW)
# ==============================================================================

set -e

# ANSI Colors for beautiful output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
BRIGHT='\033[1m'
NC='\033[0m'

# Logger functions
log() { echo -e "${BLUE}${BRIGHT}[QUATRIX]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}${BRIGHT}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

clear
echo -e "${CYAN}${BRIGHT}============================================================${NC}"
echo -e "${BLUE}${BRIGHT}          QUATRIX - ZERO-TOUCH INSTALLATION WIZARD${NC}"
echo -e "${CYAN}${BRIGHT}============================================================${NC}\n"

# 1. Root Check
if [ "$EUID" -ne 0 ]; then
  error "Please run as root (use sudo bash install.sh)"
  exit 1
fi

REPO_URL="https://github.com/cspamsky/quatrix.git"
INSTALL_DIR="/home/quatrix/quatrix"

# 2. Git & Basic Tool Installation
info "Updating system packages and checking for Git..."
apt-get update
apt-get install -y curl git build-essential ufw sudo mariadb-server mariadb-client

# 3. Dedicated User Setup
if id "quatrix" &>/dev/null; then
    info "User 'quatrix' already exists."
else
    info "Creating dedicated 'quatrix' service user..."
    useradd -m -s /bin/bash quatrix
    usermod -aG sudo quatrix
    success "User 'quatrix' created."
fi

# 4. Project Retrieval / Update
mkdir -p "$INSTALL_DIR"
chown -R quatrix:quatrix /home/quatrix

if [ -d "$INSTALL_DIR/.git" ]; then
    info "Existing Quatrix repository detected in $INSTALL_DIR. Updating..."
    cd "$INSTALL_DIR"
    sudo -u quatrix git pull origin main || warn "Could not pull latest changes. Continuing with local files."
else
    info "Cloning Quatrix from GitHub into $INSTALL_DIR..."
    # Clone as root into the directory, then fix perms
    git clone $REPO_URL "$INSTALL_DIR"
    chown -R quatrix:quatrix "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    success "Project cloned successfully."
fi

info "Current Working Directory: ${BRIGHT}$(pwd)${NC}"

# Install Node.js 20.x
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    info "Installing Node.js 20.x (LTS)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install SteamCMD & CounterStrikeSharp Requirements
info "Installing 32-bit libraries and .NET 8 Runtime..."
dpkg --add-architecture i386 || true
apt-get update

# Add Microsoft repository if dotnet-runtime-8.0 is not in the current sources
if ! apt-cache show dotnet-runtime-8.0 > /dev/null 2>&1; then
    info "dotnet-runtime-8.0 not found in default repos. Adding Microsoft package repository..."
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" == "ubuntu" || "$ID" == "debian" ]]; then
            curl -sSL "https://packages.microsoft.com/config/$ID/$VERSION_ID/packages-microsoft-prod.deb" -o packages-microsoft-prod.deb
            dpkg -i packages-microsoft-prod.deb
            rm packages-microsoft-prod.deb
            apt-get update
        fi
    fi
fi

apt-get install -y lib32gcc-s1 lib32stdc++6 libc6-i386 lib32z1 libicu-dev libkrb5-3 zlib1g libssl-dev dotnet-runtime-8.0

# MariaDB Service & Security
info "Enabling and configuring MariaDB..."
systemctl enable mariadb
systemctl start mariadb

# Ensure root can connect for management
mysql -u root -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;"
mysql -u root -e "FLUSH PRIVILEGES;"
success "MariaDB configured for local management."

# phpMyAdmin Installation
info "Installing phpMyAdmin, Nginx, and PHP-FPM..."
export DEBIAN_FRONTEND=noninteractive
apt-get install -y php-fpm php-mysql nginx phpmyadmin

# Configure Nginx for phpMyAdmin on port 8080
info "Configuring Nginx virtual host for phpMyAdmin (port 8080)..."
PHP_VER=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")

cat <<'NGINX_EOF' > /etc/nginx/sites-available/phpmyadmin
server {
    listen 8080;
    root /usr/share/phpmyadmin;
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/phpPHP_VER-fpm.sock;
    }
}
NGINX_EOF

# Replace PHP_VER placeholder with actual version
sed -i "s/phpPHP_VER/php${PHP_VER}/g" /etc/nginx/sites-available/phpmyadmin

# Enable the site
ln -sf /etc/nginx/sites-available/phpmyadmin /etc/nginx/sites-enabled/

# Test and restart services
nginx -t && systemctl restart nginx "php${PHP_VER}-fpm"
success "phpMyAdmin configured and accessible on port 8080."

# 5. Environment Automation
if [ ! -f .env ]; then
    info "Generating .env from template..."
    cp .env.example .env
    
    # Generate a unique 64-character hex secret for JWT
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i "s/your_super_secret_jwt_key_here_change_this_in_production/$JWT_SECRET/" .env
    
    # --- MariaDB Automation ---
    info "Setting up MariaDB admin user..."
    DB_ADMIN_USER="quatrix_admin"
    # Generate a secure random password without problematic shell characters
    DB_ADMIN_PASS=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64').replace(/[/+=]/g, ''))")
    
    # Create the user in MariaDB and grant privileges
    # Note: Using root via unix_socket (sudo) to create the manage user
    mysql -u root -e "CREATE USER IF NOT EXISTS '$DB_ADMIN_USER'@'localhost' IDENTIFIED BY '$DB_ADMIN_PASS';"
    mysql -u root -e "GRANT ALL PRIVILEGES ON *.* TO '$DB_ADMIN_USER'@'localhost' WITH GRANT OPTION;"
    mysql -u root -e "FLUSH PRIVILEGES;"
    
    # Append DB credentials to .env
    {
        echo ""
        echo "# MariaDB Configuration"
        echo "MYSQL_ROOT_USER=$DB_ADMIN_USER"
        echo "MYSQL_ROOT_PASSWORD=$DB_ADMIN_PASS"
        echo "MYSQL_HOST=localhost"
        echo "MYSQL_PORT=3306"
    } >> .env
    
    chown quatrix:quatrix .env
    success "Secure .env and MariaDB user generated."
else
    warn ".env already exists. Keeping current configuration."
fi

# 6. Dependency Installation (Running as quatrix)
info "Installing Node.js modules for all components..."
sudo -u quatrix npm install
sudo -u quatrix npm install --prefix server
sudo -u quatrix npm install --prefix client

# 7. Production Build (Frontend & Backend)
info "Compiling project for production..."
sudo -u quatrix npm run build

# 8. Systemd Service Deployment
info "Installing systemd service unit..."
cat <<EOF > /etc/systemd/system/quatrix.service
[Unit]
Description=Quatrix Game Server Manager
After=network.target

[Service]
Type=simple
User=quatrix
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node --env-file=$INSTALL_DIR/.env $INSTALL_DIR/server/dist/index.js
Restart=always
KillMode=process
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable quatrix
success "Quatrix service installed and enabled (KillMode=process)."

# 9. Firewall Configuration
info "Configuring UFW firewall rules..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # Web (mapped)
ufw allow 3001/tcp # API/WS
ufw allow 8080/tcp # phpMyAdmin (internal proxy)
ufw allow 27015:27050/udp # CS2 Game Traffic
ufw allow 27015:27050/tcp # CS2 RCON/TV
ufw --force enable
success "Firewall optimized for CS2 and phpMyAdmin."

# 10. Sudoers Permissions for Panel Commands
info "Configuring sudoers permissions for system commands..."
echo "quatrix ALL=(ALL) NOPASSWD: /usr/bin/timedatectl" > /etc/sudoers.d/quatrix-panel
chmod 440 /etc/sudoers.d/quatrix-panel
success "Sudoers permissions configured for 'quatrix' user."

# Final Output
echo -e "\n${GREEN}${BRIGHT}============================================================${NC}"
success "INSTALLATION COMPLETE!"
info "Start Panel:   ${YELLOW}sudo systemctl start quatrix${NC}"
info "Check Status:  ${YELLOW}sudo systemctl status quatrix${NC}"
info "View Logs:     ${YELLOW}sudo journalctl -u quatrix -f${NC}"
info "Dashboard:     ${BRIGHT}${MAGENTA}http://$(curl -s https://api.ipify.org):3001${NC}"
echo -e "${GREEN}${BRIGHT}============================================================${NC}\n"
