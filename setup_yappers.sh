#!/bin/bash

# Verificar que se ejecuta con bash y no con sh
if [ -z "$BASH_VERSION" ]; then
    printf "Este script requiere bash para funcionar correctamente.\n"
    printf "Por favor, ejecuta el script con: bash setup_yappers.sh\n"
    exit 1
fi

# Detectar si la terminal soporta colores
SOPORTE_COLORES=0
if [ -t 1 ]; then
    # Terminal interactiva, verificar si soporta colores
    ncolores=$(tput colors 2>/dev/null || echo 0)
    if [ -n "$ncolores" ] && [ $ncolores -ge 8 ]; then
        SOPORTE_COLORES=1
    fi
fi

# Inicializar colores
if [ $SOPORTE_COLORES -eq 1 ]; then
    VERDE=$(tput setaf 2)
    AZUL=$(tput setaf 4)
    AMARILLO=$(tput setaf 3)
    ROJO=$(tput setaf 1)
    NC=$(tput sgr0) # Sin Color
else
    # Sin soporte de colores, usar cadenas vacías
    VERDE=""
    AZUL=""
    AMARILLO=""
    ROJO=""
    NC=""
fi

# Función segura para imprimir con colores
imprimir() {
    printf "%s\n" "$1"
}

imprimir "${VERDE}==================================================${NC}"
imprimir "${VERDE}     CONFIGURACIÓN DE YAPPERS CHAT${NC}"
imprimir "${VERDE}==================================================${NC}"
imprimir "${AZUL}Este script te ayudará a configurar todos los archivos necesarios para Yappers Chat.${NC}"
imprimir "${AZUL}Te pedirá información sobre la base de datos, Google OAuth, correo electrónico, etc.${NC}"
imprimir "${AZUL}Pulsa [ENTER] para usar el valor por defecto que aparece entre paréntesis.${NC}"
imprimir "${VERDE}==================================================${NC}"
printf "\n"

# Variables para almacenar los datos
APP_PORT=""
DOMAIN_NAME=""
USE_HTTPS=""
MONGO_USER=""
MONGO_PASSWORD=""
MONGO_DB=""
JWT_SECRET=""
SESSION_SECRET=""
ADMIN_PASS=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL=""
EMAIL_HOST=""
EMAIL_PORT=""
EMAIL_SECURE=""
EMAIL_USER=""
EMAIL_PASS=""
EMAIL_FROM=""
EMAIL_TLS_REJECT=""

# Función para generar claves seguras aleatorias
generar_clave_segura() {
    openssl rand -base64 32
}

# Función para solicitar valores con valor por defecto
pedir_valor() {
    local prompt=$1
    local default=$2
    local var_name=$3
    local is_password=$4  # Este parámetro ya no se usa para ocultar, solo para identificar

    printf "%s [%s]: " "$prompt" "$default"
    read temp_var

    # Asignar el valor ingresado o el valor por defecto
    if [ -z "$temp_var" ]; then
        eval $var_name="'$default'"
        printf "%sUsando valor por defecto: %s%s%s\n" "${AZUL}" "${VERDE}" "$default" "${NC}"
    else
        eval $var_name="'$temp_var'"
    fi
}

# Función para solicitar valores booleanos (sí/no)
pedir_boolean() {
    local prompt=$1
    local default=$2
    local var_name=$3
    
    local default_display
    if [ "$default" = "si" ] || [ "$default" = "true" ] || [ "$default" = "s" ] || [ "$default" = "yes" ] || [ "$default" = "y" ]; then
        default_display="${VERDE}si${NC}/no"
        default="true"
    else
        default_display="si/${VERDE}no${NC}"
        default="false"
    fi
    
    while true; do
        printf "%s [%s]: " "$prompt" "$default_display"
        read temp_var
        
        if [ -z "$temp_var" ]; then
            eval $var_name="'$default'"
            if [ "$default" = "true" ]; then
                printf "${AZUL}Usando valor por defecto: ${VERDE}si${NC}\n"
            else
                printf "${AZUL}Usando valor por defecto: ${VERDE}no${NC}\n"
            fi
            break
        fi
        
        case "$temp_var" in
            [Ss]|[Ss][Ii]|[Yy]|[Yy][Ee][Ss]|true|TRUE|True)
                eval $var_name="'true'"
                break
                ;;
            [Nn]|[Nn][Oo]|false|FALSE|False)
                eval $var_name="'false'"
                break
                ;;
            *)
                printf "${ROJO}Por favor, responde 'si' o 'no'.${NC}\n"
                ;;
        esac
    done
}

# Configuración General
printf "\n${AMARILLO}--- Configuración General ---${NC}\n"
pedir_valor "Puerto de la aplicación" "3000" APP_PORT
pedir_valor "Nombre de dominio principal (dejar vacío para usar IP local)" "yappers.es" DOMAIN_NAME
pedir_boolean "¿Usar HTTPS con Let's Encrypt?" "si" USE_HTTPS

# Verificar si no hay dominio, usar IP local
if [ "$DOMAIN_NAME" = "" ] || [ "$DOMAIN_NAME" = "localhost" ]; then
    printf "${AZUL}No se ha especificado un dominio válido. Se usará la IP local para acceder.${NC}\n"
    
    # Intentar obtener la IP local
    IP_LOCAL=$(hostname -I | awk '{print $1}')
    if [ -n "$IP_LOCAL" ]; then
        printf "${VERDE}IP local detectada: ${IP_LOCAL}${NC}\n"
        DOMAIN_NAME=$IP_LOCAL
    else
        printf "${AMARILLO}No se pudo detectar la IP local. Se usará 'localhost'.${NC}\n"
        DOMAIN_NAME="localhost"
    fi
    
    # Forzar USE_HTTPS a false si estamos usando IP o localhost
    if [ "$USE_HTTPS" = "true" ]; then
        printf "${AMARILLO}HTTPS con Let's Encrypt requiere un dominio válido. Se usará un certificado autofirmado.${NC}\n"
    fi
fi

# Configuración de MongoDB
printf "\n${AMARILLO}--- Configuración de MongoDB ---${NC}\n"
pedir_valor "Usuario de MongoDB" "admin" MONGO_USER
pedir_valor "Contraseña de MongoDB" "mongopass123" MONGO_PASSWORD false
pedir_valor "Nombre de la base de datos" "chatapp" MONGO_DB

# Asegurar que la contraseña no tenga caracteres problemáticos
MONGO_PASSWORD=$(echo "$MONGO_PASSWORD" | sed 's/[^a-zA-Z0-9]//g')
printf "${AZUL}Nota: Se han eliminado caracteres especiales de la contraseña de MongoDB para evitar problemas de autenticación.${NC}\n"
printf "${AZUL}La contraseña final es: ${VERDE}${MONGO_PASSWORD}${NC}\n"

# Configuración de Seguridad
printf "\n${AMARILLO}--- Configuración de Seguridad ---${NC}\n"
JWT_DEFAULT=$(generar_clave_segura)
SESSION_DEFAULT=$(generar_clave_segura)
pedir_valor "JWT Secret (se generará automáticamente una clave segura)" "$JWT_DEFAULT" JWT_SECRET
pedir_valor "Session Secret (se generará automáticamente una clave segura)" "$SESSION_DEFAULT" SESSION_SECRET

# Solicitar contraseña de administrador
printf "\n${AMARILLO}--- Configuración del Panel de Administración ---${NC}\n"
printf "${AZUL}Esta contraseña se usará para acceder al panel de administración en /admin${NC}\n"
ADMIN_PASS_DEFAULT="patatata123"
pedir_valor "Contraseña de administrador" "$ADMIN_PASS_DEFAULT" ADMIN_PASS false

# Google OAuth
printf "\n${AMARILLO}--- Configuración de Google OAuth ---${NC}\n"
printf "${AZUL}(Opcional) Puedes obtener las credenciales en: ${VERDE}https://console.cloud.google.com/${NC}\n"
printf "${AMARILLO}Necesitarás configurar ambos valores: Client ID y Client Secret para la autenticación con Google${NC}\n"
pedir_valor "Google Client ID" "tu-client-id" GOOGLE_CLIENT_ID
pedir_valor "Google Client Secret" "tu-client-secret" GOOGLE_CLIENT_SECRET false

# Ajustar la URL de callback según el protocolo y dominio
if [ "$USE_HTTPS" = "true" ]; then
    CALLBACK_DEFAULT="https://${DOMAIN_NAME}/api/auth/google/callback"
else
    CALLBACK_DEFAULT="http://${DOMAIN_NAME}/api/auth/google/callback"
fi
pedir_valor "Google Callback URL" "$CALLBACK_DEFAULT" GOOGLE_CALLBACK_URL

# Configuración de Correo Electrónico
printf "\n${AMARILLO}--- Configuración de Correo Electrónico ---${NC}\n"
EMAIL_HOST_DEFAULT="mail.${DOMAIN_NAME}"
pedir_valor "Host de correo" "$EMAIL_HOST_DEFAULT" EMAIL_HOST
pedir_valor "Puerto SMTP" "587" EMAIL_PORT
pedir_boolean "¿Usar conexión segura para correo?" "no" EMAIL_SECURE
EMAIL_USER_DEFAULT="admin@${DOMAIN_NAME}"
pedir_valor "Usuario de correo" "$EMAIL_USER_DEFAULT" EMAIL_USER
pedir_valor "Contraseña de correo" "tu-contraseña" EMAIL_PASS false
pedir_valor "Dirección de origen de correos" "$EMAIL_USER" EMAIL_FROM
pedir_boolean "¿Rechazar certificados no válidos para correo?" "no" EMAIL_TLS_REJECT

printf "\n${VERDE}Creando archivos de configuración...${NC}\n"

# Crear archivo .env que será copiado por Dockerfile.app
cat > .env << EOF
PORT=${APP_PORT}
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017/${MONGO_DB}?authSource=admin
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}
EMAIL_HOST=${EMAIL_HOST}
EMAIL_PORT=${EMAIL_PORT}
EMAIL_SECURE=${EMAIL_SECURE}
EMAIL_USER=${EMAIL_USER}
EMAIL_PASS='${EMAIL_PASS}'
EMAIL_FROM=${EMAIL_FROM}
EMAIL_TLS_REJECT_UNAUTHORIZED=${EMAIL_TLS_REJECT}
EOF

# Crear nginx.conf con la configuración adecuada para el dominio
cat > nginx.conf << EOF
# Configuración para HTTP
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    # Para validación de Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirigir HTTP a HTTPS si USE_HTTPS es true
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Configuración para acceso por IP cuando no hay dominio
server {
    listen 80 default_server;
    server_name _;
    
    # Configuración de resolución de DNS para servicios Docker
    resolver 127.0.0.11 valid=30s;
    set \$upstream app:${APP_PORT};
    
    location / {
        proxy_pass http://\$upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Configuración para reintentos
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
    }
}

# Configuración para HTTPS
server {
    listen 443 ssl http2;
    server_name ${DOMAIN_NAME};
    
    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    
    # Configuración SSL optimizada
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    
    # HSTS (15768000 segundos = 6 meses)
    add_header Strict-Transport-Security "max-age=15768000; includeSubDomains; preload" always;
    
    # Configuración de resolución de DNS para servicios Docker
    resolver 127.0.0.11 valid=30s;
    set \$upstream app:${APP_PORT};
    
    location / {
        proxy_pass http://\$upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Configuración para reintentos
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
    }
}

# Configuración para HTTPS con IP
server {
    listen 443 ssl http2 default_server;
    server_name _;
    
    # Certificados SSL autofirmados
    ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;
    
    # Configuración SSL básica
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Configuración de resolución de DNS para servicios Docker
    resolver 127.0.0.11 valid=30s;
    set \$upstream app:${APP_PORT};
    
    location / {
        proxy_pass http://\$upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Configuración para reintentos
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
    }
}
EOF

# Crear Dockerfile para Nginx
cat > Dockerfile << EOF
FROM nginx:alpine

# Instalar herramientas necesarias
RUN apk add --no-cache curl certbot certbot-nginx openssl

# Crear directorio para certificados SSL
RUN mkdir -p /etc/letsencrypt /var/www/certbot

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar script de inicialización
COPY init-letsencrypt.sh /init-letsencrypt.sh
RUN chmod +x /init-letsencrypt.sh

# Exponer puertos HTTP y HTTPS
EXPOSE 80
EXPOSE 443

# Iniciar Nginx y configurar renovación de certificados
CMD ["/bin/sh", "-c", "/init-letsencrypt.sh && nginx -g 'daemon off;'"]
EOF

# Crear Dockerfile.app simplificado
cat > Dockerfile.app << EOF
FROM node:18-slim

# Crear directorio de la aplicación
WORKDIR /app

# Instalar herramientas necesarias
RUN apt-get update && apt-get install -y git netcat-traditional curl wget python3 make g++ build-essential && \\
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Clonar el repositorio
RUN git clone https://github.com/pingigangster/yappers.git . && \\
    rm -rf .git

# Solucionar el problema de bcrypt
RUN npm uninstall bcrypt --save || true
RUN npm install bcryptjs --save
RUN find . -type f -name "*.js" -exec sed -i 's/require(["\x27]bcrypt["\x27])/require("bcryptjs")/g' {} \\; || true
RUN find . -type f -name "*.js" -exec sed -i "s/from ['\"]bcrypt['\"]/from 'bcryptjs'/g" {} \\; || true

# Instalar dependencias
RUN npm install

# Copiar archivo .env generado por el script
COPY .env .env

# Crear script de inicio con comprobación de MongoDB
COPY wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Exponer el puerto que usa la aplicación
EXPOSE \${APP_PORT}

# Iniciar la aplicación
CMD ["/bin/sh", "-c", "/wait-for-it.sh mongo:27017 && npm start"]
EOF

# Eliminar el archivo server.js.fixed que ya no es necesario
rm -f server.js.fixed

# Crear wait-for-it.sh
cat > wait-for-it.sh << EOF
#!/bin/sh
# wait-for-it.sh - Script mejorado para verificar que MongoDB esté disponible antes de iniciar la aplicación

set -e

host=\$(printf "%s\n" "\$1"| cut -d : -f 1)
port=\$(printf "%s\n" "\$1"| cut -d : -f 2)
shift
cmd="\$@"

# Función para verificar si el puerto está abierto
check_port() {
    nc -z -w 2 \$host \$port
    return \$?
}

# Función para intentar la conexión con retroceso exponencial
wait_with_backoff() {
    local max_attempts=15
    local timeout=1
    local attempt=1

    while [ \$attempt -le \$max_attempts ]; do
        echo "Intento \$attempt de \$max_attempts: esperando a que \$host:\$port esté disponible..."
        
        # Verificar si el puerto está abierto
        if check_port; then
            # Esperar un segundo adicional para que MongoDB complete su inicialización
            sleep 1
            
            # Doble verificación para asegurarse que el servicio está estable
            if check_port; then
                echo "¡\$host:\$port está disponible después de \$attempt intentos!"
                return 0
            else
                echo "El servicio no es estable todavía, reintentando..."
            fi
        fi
        
        echo "Todavía no disponible, esperando \$timeout segundos..."
        sleep \$timeout
        
        # Incrementar el tiempo de espera exponencialmente (1s, 2s, 4s, 8s, etc.)
        # Pero limitar a un máximo de 15 segundos
        timeout=\$((timeout * 2))
        if [ \$timeout -gt 15 ]; then
            timeout=15
        fi
        attempt=\$((attempt + 1))
    done
    
    echo "WARNING: No se pudo conectar a \$host:\$port después de \$max_attempts intentos."
    echo "La aplicación intentará iniciarse de todos modos, pero puede fallar si MongoDB no está disponible."
    return 1
}

# Intentar conectar con retroceso exponencial
wait_with_backoff
echo "MongoDB está disponible, iniciando aplicación..."
exec \$cmd
EOF
chmod +x wait-for-it.sh

# Crear script de inicialización para Let's Encrypt
cat > init-letsencrypt.sh << EOF
#!/bin/sh

# Inicialización para Let's Encrypt

# Detener cualquier instancia de Nginx en ejecución
nginx -s stop 2>/dev/null || true
sleep 2

# Verificar si los puertos están en uso
if netstat -tln | grep -q ':80\|:443'; then
  echo "ADVERTENCIA: Los puertos 80 o 443 ya están en uso. Esto puede causar problemas con Nginx."
  echo "Considere detener otros servidores web o servicios que estén usando estos puertos."
  # No salimos con error para permitir que el contenedor siga funcionando
fi

# Verificar si se debe usar HTTPS
if [ "\$USE_HTTPS" = "true" ] && [ "\$DOMAIN" != "localhost" ] && [ "\$DOMAIN" != "" ]; then
  echo "Configurando HTTPS para dominio: \$DOMAIN"
  
  # Crear certificado autofirmado inicialmente
  mkdir -p /etc/ssl/private /etc/ssl/certs
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
          -keyout /etc/ssl/private/nginx-selfsigned.key \\
          -out /etc/ssl/certs/nginx-selfsigned.crt \\
          -subj "/CN=\$DOMAIN"
  
  # Configurar Diffie-Hellman
  openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048

  # Verificar si ya existen certificados de Let's Encrypt
  if [ ! -d "/etc/letsencrypt/live/\$DOMAIN" ]; then
    echo "No se encontraron certificados para \$DOMAIN. Intentando obtener nuevos certificados..."
    
    # Crear directorio para verificación de Let's Encrypt
    mkdir -p /var/www/certbot
    
    # Intentar obtener certificado real
    certbot --nginx --non-interactive --agree-tos --email \$EMAIL_USER \\
            --domains \$DOMAIN --keep-until-expiring
    
    # Si falla, ya tenemos certificados autofirmados listos
    if [ \$? -ne 0 ]; then
      echo "No se pudo obtener el certificado de Let's Encrypt. Usando certificado autofirmado..."
      
      # Actualizar configuración para usar certificado autofirmado
      sed -i "s|/etc/letsencrypt/live/\$DOMAIN/fullchain.pem|/etc/ssl/certs/nginx-selfsigned.crt|g" /etc/nginx/conf.d/default.conf
      sed -i "s|/etc/letsencrypt/live/\$DOMAIN/privkey.pem|/etc/ssl/private/nginx-selfsigned.key|g" /etc/nginx/conf.d/default.conf
    fi
  else
    echo "Certificados existentes encontrados para \$DOMAIN"
    
    # Verificar si los certificados son válidos
    if [ ! -f "/etc/letsencrypt/live/\$DOMAIN/fullchain.pem" ] || [ ! -f "/etc/letsencrypt/live/\$DOMAIN/privkey.pem" ]; then
      echo "Certificados incompletos o inválidos. Usando certificado autofirmado..."
      # Actualizar configuración para usar certificado autofirmado
      sed -i "s|/etc/letsencrypt/live/\$DOMAIN/fullchain.pem|/etc/ssl/certs/nginx-selfsigned.crt|g" /etc/nginx/conf.d/default.conf
      sed -i "s|/etc/letsencrypt/live/\$DOMAIN/privkey.pem|/etc/ssl/private/nginx-selfsigned.key|g" /etc/nginx/conf.d/default.conf
    fi
  fi
  
  # Configurar renovación automática en segundo plano
  (
    while :; do
      sleep 12h
      certbot renew --quiet
      nginx -s reload
    done
  ) &
  
else
  echo "HTTPS desactivado o usando IP. Usando configuración HTTP o certificado autofirmado."
  
  # Crear certificado autofirmado para IP/localhost
  mkdir -p /etc/ssl/private /etc/ssl/certs
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
          -keyout /etc/ssl/private/nginx-selfsigned.key \\
          -out /etc/ssl/certs/nginx-selfsigned.crt \\
          -subj "/CN=localhost"
  
  # Configurar Diffie-Hellman
  openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048
  
  # Actualizar configuración para usar certificado autofirmado
  sed -i "s|/etc/letsencrypt/live/.*/fullchain.pem|/etc/ssl/certs/nginx-selfsigned.crt|g" /etc/nginx/conf.d/default.conf
  sed -i "s|/etc/letsencrypt/live/.*/privkey.pem|/etc/ssl/private/nginx-selfsigned.key|g" /etc/nginx/conf.d/default.conf
fi

# Verificar y iniciar Nginx con intento de recuperación
nginx -t
if [ \$? -eq 0 ]; then
  # Configuración válida, iniciar Nginx
  nginx -g 'daemon off;'
else
  echo "Configuración de Nginx inválida, usando configuración alternativa con certificados autofirmados"
  # Actualizar a configuración mínima como fallback
  cat > /etc/nginx/conf.d/default.conf << EOT
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://app:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOT
  nginx -g 'daemon off;'
fi

exit 0
EOF
chmod +x init-letsencrypt.sh

# Exportar variables para docker compose
export APP_PORT
export MONGO_URI="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017/${MONGO_DB}?authSource=admin"
export JWT_SECRET
export SESSION_SECRET
export GOOGLE_CLIENT_ID
export GOOGLE_CLIENT_SECRET
export GOOGLE_CALLBACK_URL
export EMAIL_HOST
export EMAIL_PORT
export EMAIL_SECURE
export EMAIL_USER
export EMAIL_PASS
export EMAIL_FROM
export EMAIL_TLS_REJECT
export MONGO_USER
export MONGO_PASSWORD
export MONGO_DB
export DOMAIN_NAME
export USE_HTTPS

# Crear compose.yml
cat > compose.yml << EOF
services:
  nginx:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      app:
        condition: service_started
      mongo:
        condition: service_started
    volumes:
      - certbot-etc:/etc/letsencrypt
      - certbot-var:/var/lib/letsencrypt
      - certbot-www:/var/www/certbot
    environment:
      - DOMAIN=${DOMAIN_NAME}
      - USE_HTTPS=${USE_HTTPS}
      - EMAIL_USER=${EMAIL_USER}
      - APP_PORT=${APP_PORT}
    networks:
      - app-network
    restart: always
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  app:
    build:
      context: .
      dockerfile: Dockerfile.app
    environment:
      - PORT=${APP_PORT}
      - MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017/${MONGO_DB}?authSource=admin
      - JWT_SECRET=${JWT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}
      - EMAIL_HOST=${EMAIL_HOST}
      - EMAIL_PORT=${EMAIL_PORT}
      - EMAIL_SECURE=${EMAIL_SECURE}
      - EMAIL_USER=${EMAIL_USER}
      - EMAIL_PASS=${EMAIL_PASS}
      - EMAIL_FROM=${EMAIL_FROM}
      - EMAIL_TLS_REJECT_UNAUTHORIZED=${EMAIL_TLS_REJECT}
    expose:
      - "${APP_PORT}"
    depends_on:
      mongo:
        condition: service_started
    networks:
      - app-network
    restart: always
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:${APP_PORT}/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  mongo:
    image: mongo:latest
    command: ["--auth"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: ${MONGO_DB}
    volumes:
      - mongo-data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    ports:
      - "27017:27017"
    networks:
      - app-network
    restart: always
    # Healthcheck desactivado ya que puede causar problemas en algunas versiones
    # Si necesitas activarlo, descomenta estas líneas y ajústalas según tu versión de MongoDB
    # healthcheck:
    #   test: ["CMD", "mongo", "--eval", "db.stats()"]
    #   start_period: 60s
    #   interval: 20s
    #   timeout: 10s
    #   retries: 3

networks:
  app-network:
    driver: bridge

volumes:
  mongo-data:
  certbot-etc:
  certbot-var:
  certbot-www:
EOF

# Crear script de inicialización de MongoDB para asegurar que las credenciales estén correctamente configuradas
cat > mongo-init.js << EOF
# Crear usuario administrador si no existe
db.getSiblingDB("admin").createUser({
  user: "${MONGO_USER}",
  pwd: "${MONGO_PASSWORD}",
  roles: [{ role: "root", db: "admin" }]
});

# Crear la base de datos de la aplicación y un usuario específico
db.getSiblingDB("${MONGO_DB}").createUser({
  user: "${MONGO_USER}",
  pwd: "${MONGO_PASSWORD}",
  roles: [{ role: "dbOwner", db: "${MONGO_DB}" }]
});

# Crear algunas colecciones básicas
db.getSiblingDB("${MONGO_DB}").createCollection("users");
db.getSiblingDB("${MONGO_DB}").createCollection("chats");
db.getSiblingDB("${MONGO_DB}").createCollection("messages");
EOF

# Crear .env.local para uso local (sin contraseñas reales)
cat > .env.local.example << EOF
# ==========================================
# Variables de Entorno LOCALES (.env.local) - EJEMPLO
# ==========================================
# Este archivo es para configuración específica de tu máquina local.
# Cambia los valores según tu entorno específico.

# --- Configuración General ---
PORT=${APP_PORT}

# --- Base de Datos (MongoDB) ---
# Para entorno Docker, usa:
MONGO_URI=mongodb://${MONGO_USER}:********@mongo:27017/${MONGO_DB}?authSource=admin
# Para desarrollo local, usa:
# MONGO_URI=mongodb://${MONGO_USER}:********@localhost:27017/${MONGO_DB}?authSource=admin

# --- Seguridad (JWT y Sesiones) ---
JWT_SECRET=********
SESSION_SECRET=********

# --- Autenticación con Google (OAuth 2.0) ---
GOOGLE_CLIENT_ID=tu-client-id
GOOGLE_CLIENT_SECRET=********
GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}

# --- Configuración de servidor de correo electrónico ---
EMAIL_HOST=${EMAIL_HOST}
EMAIL_PORT=${EMAIL_PORT}
EMAIL_SECURE=${EMAIL_SECURE}
EMAIL_USER=${EMAIL_USER}
EMAIL_PASS=********
EMAIL_FROM=${EMAIL_FROM}
EMAIL_TLS_REJECT_UNAUTHORIZED=${EMAIL_TLS_REJECT}

# --- Panel de Administración ---
ADMIN_PASS=********  # Contraseña para acceder al panel de administración en /admin

# --- Configuración HTTPS ---
DOMAIN_NAME=${DOMAIN_NAME}
USE_HTTPS=${USE_HTTPS}

# ==========================================
# Fin de Variables de Entorno Locales
# ==========================================
EOF

# Crear una copia real de .env.local con los valores reales
cat > .env.local << EOF
# ==========================================
# Variables de Entorno LOCALES (.env.local)
# ==========================================
# Este archivo es para configuración específica de tu máquina local.

# --- Configuración General ---
PORT=${APP_PORT}

# --- Base de Datos (MongoDB) ---
# Para entorno Docker, usa:
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017/${MONGO_DB}?authSource=admin
# Para desarrollo local, usa:
# MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/${MONGO_DB}?authSource=admin

# --- Seguridad (JWT y Sesiones) ---
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}

# --- Autenticación con Google (OAuth 2.0) ---
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}

# --- Configuración de servidor de correo electrónico ---
EMAIL_HOST=${EMAIL_HOST}
EMAIL_PORT=${EMAIL_PORT}
EMAIL_SECURE=${EMAIL_SECURE}
EMAIL_USER=${EMAIL_USER}
EMAIL_PASS='${EMAIL_PASS}'
EMAIL_FROM=${EMAIL_FROM}
EMAIL_TLS_REJECT_UNAUTHORIZED=${EMAIL_TLS_REJECT}

# --- Panel de Administración ---
ADMIN_PASS='${ADMIN_PASS}'  # Contraseña para acceder al panel de administración en /admin

# --- Configuración HTTPS ---
DOMAIN_NAME=${DOMAIN_NAME}
USE_HTTPS=${USE_HTTPS}

# ==========================================
# Fin de Variables de Entorno Locales
# ==========================================
EOF

# Crear README.md
cat > README.md << EOF
# Configuración de Yappers Chat

Este repositorio contiene la configuración Docker para desplegar la aplicación Yappers Chat con Nginx como reverse proxy y MongoDB como base de datos.

## Estructura

- \`Dockerfile\`: Configura Nginx como reverse proxy con soporte HTTPS/Let's Encrypt
- \`Dockerfile.app\`: Configura la aplicación Node.js de Yappers
- \`compose.yml\`: Orquesta todos los servicios (Nginx, aplicación, MongoDB)
- \`nginx.conf\`: Configuración de Nginx para el dominio configurado
- \`wait-for-it.sh\`: Script para esperar a que MongoDB esté disponible
- \`init-letsencrypt.sh\`: Script para configurar certificados SSL
- \`.env\`: Variables de entorno para la aplicación
- \`.env.local\`: Variables de entorno para desarrollo local
- \`.env.local.example\`: Ejemplo de variables de entorno sin información sensible

## Características

- **HTTPS automático**: Configuración automática de certificados SSL con Let's Encrypt
- **Soporte para IP**: Si no tienes dominio, puedes acceder usando la IP del servidor
- **Certificados autofirmados**: Generación automática de certificados autofirmados cuando es necesario

## Configuración

Para configurar el proyecto:

\`\`\`bash
bash setup_yappers.sh
\`\`\`

Este script te pedirá toda la información necesaria para configurar los archivos, incluyendo:
- Puerto de aplicación
- Dominio (o se usará IP local si no tienes dominio)
- Configuración HTTPS/certificados SSL
- Credenciales de base de datos
- OAuth de Google y correo electrónico

## Despliegue con Docker Compose

Para desplegar toda la aplicación:

\`\`\`bash
docker compose up -d
\`\`\`

La aplicación estará disponible en:
- Con dominio: https://tu-dominio
- Sin dominio: https://tu-ip-local (certificado autofirmado)

## Seguridad

- **NO subas archivos con credenciales reales a repositorios públicos**
- Usa el archivo \`.env.local.example\` como referencia para crear tus propios archivos .env
- **IMPORTANTE**: GitHub bloquea el push de credenciales reales (como claves de OAuth, tokens, etc.)
- Utiliza el script \`setup_yappers.sh\` para configurar los archivos de forma segura

## Contribuir

Si encuentras algún problema o quieres contribuir, por favor crea un issue o un pull request.
EOF

# Crear archivo .gitignore
cat > .gitignore << EOF
# Archivos de entorno
.env
.env.local

# Archivos de Docker
compose.override.yml

# Directorios de dependencias
node_modules/

# Archivos de logs
*.log
npm-debug.log*

# Directorio de base de datos local
data/

# Certificados SSL
*.pem
*.key
*.crt

# Archivos del sistema operativo
.DS_Store
Thumbs.db
EOF

printf "\n${VERDE}Archivos creados correctamente:${NC}\n"
printf "${AZUL}- nginx.conf${NC}\n"
printf "${AZUL}- Dockerfile${NC}\n"
printf "${AZUL}- Dockerfile.app${NC}\n"
printf "${AZUL}- wait-for-it.sh${NC}\n"
printf "${AZUL}- init-letsencrypt.sh${NC}\n"
printf "${AZUL}- compose.yml${NC}\n"
printf "${AZUL}- .env${NC}\n"
printf "${AZUL}- .env.local${NC}\n"
printf "${AZUL}- .env.local.example${NC}\n"
printf "${AZUL}- README.md${NC}\n"
printf "${AZUL}- .gitignore${NC}\n"

printf "\n${VERDE}==================================================${NC}\n"
printf "${VERDE}     CONFIGURACIÓN COMPLETADA${NC}\n"
printf "${VERDE}==================================================${NC}\n"

# Mostrar información de conexión basada en el dominio/IP
if [ "$DOMAIN_NAME" != "localhost" ] && [ "$DOMAIN_NAME" != "" ] && [[ ! $DOMAIN_NAME =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [ "$USE_HTTPS" = "true" ]; then
        printf "${AZUL}Tu aplicación estará disponible en: ${VERDE}https://${DOMAIN_NAME}${NC}\n"
    else
        printf "${AZUL}Tu aplicación estará disponible en: ${VERDE}http://${DOMAIN_NAME}${NC}\n"
    fi
else
    IP_LOCAL=$(hostname -I | awk '{print $1}')
    printf "${AZUL}Tu aplicación estará disponible en: ${VERDE}https://${IP_LOCAL}${NC}\n"
    printf "${AMARILLO}Nota: Tu navegador mostrará una advertencia porque el certificado es autofirmado.${NC}\n"
    printf "${AMARILLO}      Deberás aceptar el riesgo o añadir una excepción de seguridad.${NC}\n"
fi

printf "\n${AZUL}Resumen de configuración:${NC}\n"
printf "${AMARILLO}Puerto de aplicación:${NC} ${VERDE}${APP_PORT}${NC}\n"
printf "${AMARILLO}Base de datos:${NC} ${VERDE}${MONGO_DB}${NC}\n"
printf "${AMARILLO}Usuario MongoDB:${NC} ${VERDE}${MONGO_USER}${NC}\n"
printf "${AMARILLO}URL de conexión MongoDB:${NC} ${VERDE}mongodb://${MONGO_USER}:********@mongo:27017/${MONGO_DB}?authSource=admin${NC}\n"

printf "\n${AZUL}Para iniciar la aplicación ejecuta:${NC}\n"
printf "${VERDE}docker compose up -d${NC}\n"
printf "\n${AZUL}Para ver los logs:${NC}\n"
printf "${VERDE}docker compose logs -f${NC}\n"
printf "${VERDE}==================================================${NC}\n"
printf "${ROJO}AVISO DE SEGURIDAD:${NC}\n"
printf "${ROJO}NO subas archivos con credenciales reales a GitHub.${NC}\n"
printf "${ROJO}Usa siempre .env.local.example como plantilla segura.${NC}\n"
printf "${VERDE}==================================================${NC}\n" 