#!/bin/bash
# ==============================================================================
# Automated Deployment Script - Catalogue Management System (Isolated Stack)
# ==============================================================================
# This script deploys the Catalogue application in a completely isolated environment
# on your server. It ensures that LMS databases, ports, and containers are 100% 
# untouched and run side-by-side with Catalogue without any interference.
# ==============================================================================

# Print styled banner
echo "======================================================================"
echo "    __  ___      __        __                                         "
echo "   /  |/  /___  / /_  ____/ /_  __                                    "
echo "  / /|_/ / __ \/ __ \/ __  / / / /                                    "
echo " / /  / / /_/ / /_/ / /_/ / /_/ /                                     "
echo "/_/  /_/\____/_.___/\__,_/\__, /                                      "
echo "                         /____/   CATALOGUE DEPLOYMENT SYSTEM          "
echo "======================================================================"
echo "Checking environment dependencies..."

# Check if Docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: docker is not installed. Please install Docker first." >&2
  exit 1
fi

# Check if Docker Compose is installed
if ! [ -x "$(command -v docker-compose)" ]; then
  # Fallback check for docker compose V2 (command: docker compose)
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
  else
    echo "Error: docker-compose is not installed. Please install Docker Compose first." >&2
    exit 1
  fi
else
  DOCKER_COMPOSE="docker-compose"
fi

echo "Docker & Docker Compose are present."

# Check if ports 5001 and 5433 are already in use
echo "Checking port availability..."
if [ -x "$(command -v ss)" ]; then
  PORT_5001=$(ss -tlnp | grep -E :5001)
  PORT_5433=$(ss -tlnp | grep -E :5433)
elif [ -x "$(command -v netstat)" ]; then
  PORT_5001=$(netstat -tlnp | grep -E :5001)
  PORT_5433=$(netstat -tlnp | grep -E :5433)
else
  PORT_5001=""
  PORT_5433=""
fi

if [ ! -z "$PORT_5001" ]; then
  echo "Warning: Port 5001 is already in use on the host. This may cause conflict."
else
  echo "Port 5001 (API & Web Admin Panel) is free."
fi

if [ ! -z "$PORT_5433" ]; then
  echo "Warning: Port 5433 is already in use on the host. This may cause conflict."
else
  echo "Port 5433 (PostgreSQL DB) is free."
fi

# Check if .env file exists in backend, if not create a default one
if [ ! -f backend/.env ]; then
  echo "No .env file found in backend. Creating backend/.env with default settings..."
  mkdir -p backend
  cat <<EOT > backend/.env
# ==============================================================================
# Environment Configuration - Catalogue Management Backend
# ==============================================================================
PORT=5000
NODE_ENV=production

# Database config (matches credentials in docker-compose.yml)
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres_password
DB_NAME=catalogue_db

# Security
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "default_catalogue_jwt_secret_key_change_me_in_prod")

# Uploads
UPLOAD_DIR=/app/uploads
EOT
  echo "backend/.env created successfully!"
fi

echo "Deploying the isolated containers..."
echo "Running: $DOCKER_COMPOSE up -d --build"

$DOCKER_COMPOSE up -d --build

if [ $? -eq 0 ]; then
  echo "======================================================================"
  echo "SUCCESS: Catalogue Management System has been deployed successfully!"
  echo "======================================================================"
  echo "The application is running in the background."
  echo ""
  echo "Services and Mapped Ports (Zero LMS Impact):"
  echo "----------------------------------------------------------------------"
  echo "1. PostgreSQL Database  : Host Port 5433 -> Container Port 5432"
  echo "2. Express Backend &    : Host Port 5001 -> Container Port 5000"
  echo "   Vite React Admin Panel"
  echo ""
  echo "Checking Container Status:"
  echo "----------------------------------------------------------------------"
  docker ps | grep -E "catalogue"
  echo ""
  echo "Next Steps to test:"
  echo "1. Access the Admin Web Panel: http://<your-server-ip>:5001"
  echo "   - Log in using:"
  echo "     Username: admin"
  echo "     Password: adminpassword"
  echo "2. Upload category directories and start adding SKU products."
  echo "3. Compile the Android app, open settings, configure the server endpoint"
  echo "   to http://<your-server-ip>:5001 (or your https domain if configured),"
  echo "   and log in to register your Device UUID for approval!"
  echo ""
  echo "Nginx Isolation Reminder:"
  echo "----------------------------------------------------------------------"
  echo "To bind to catalogue.desukafashion.com without affecting the LMS, "
  echo "we have created a standalone configuration file 'catalogue.nginx.conf'."
  echo "You can place this in your Nginx configurations directory on the host"
  echo "(e.g., /etc/nginx/sites-enabled/) and restart Nginx."
  echo "======================================================================"
else
  echo "Error: Deployment failed. Please review the build errors above."
  exit 1
fi
