#!/bin/bash

# Verificar que se ejecuta con bash y no con sh
if [ -z "$BASH_VERSION" ]; then
    printf "Este script requiere bash para funcionar correctamente.\n"
    printf "Por favor, ejecuta el script con: bash setup_yappers.sh\n"
    exit 1
fi

# Comprobar si Docker está instalado
comprobar_requisitos() {
    printf "Comprobando requisitos...\n"
    
    # Verificar si Docker está instalado
    if ! command -v docker &> /dev/null; then
        printf "${AMARILLO}Docker no está instalado en el sistema.${NC}\n"
        
        # Preguntar al usuario si quiere instalarlo automáticamente
        local respuesta
        printf "${VERDE}¿Quieres instalar Docker automáticamente? (si/no): ${NC}"
        read respuesta
        
        case "$respuesta" in
            [Ss]|[Ss][Ii]|[Yy]|[Yy][Ee][Ss]|true|TRUE|True)
                printf "${AZUL}Instalando Docker...${NC}\n"
                
                # Detectar si estamos en Debian o Ubuntu
                if [ -f /etc/os-release ]; then
                    . /etc/os-release
                    OS_NAME=$ID
                else
                    OS_NAME="unknown"
                fi
                
                printf "${AZUL}Sistema operativo detectado: ${VERDE}${OS_NAME}${NC}\n"
                
                # Instalar dependencias comunes
                sudo apt update
                sudo apt install -y ca-certificates curl gnupg lsb-release apt-transport-https
                
                # Crear directorio para repositorios
                sudo install -m 0755 -d /etc/apt/keyrings
                
                # Configurar repos según el sistema operativo
                if [ "$OS_NAME" = "debian" ]; then
                    # Instalar Docker para Debian
                    printf "${AZUL}Configurando repositorio para Debian...${NC}\n"
                    
                    # Descargar clave GPG
                    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                    sudo chmod a+r /etc/apt/keyrings/docker.gpg
                    
                    # Agregar repo
                    echo \
                      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
                      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                    
                    # Actualizar lista de paquetes
                    sudo apt update
                    
                    # En caso de error con la clave GPG, intentar solución alternativa
                    if [ $? -ne 0 ]; then
                        printf "${AMARILLO}Detectado problema con la clave GPG. Intentando solución alternativa...${NC}\n"
                        sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 7EA0A9C3F273FCD8
                        sudo apt update
                    fi
                    
                    # Instalar Docker - método alternativo si docker-ce no está disponible
                    if ! apt-cache show docker-ce &>/dev/null; then
                        printf "${AMARILLO}El paquete docker-ce no está disponible. Intentando instalación alternativa...${NC}\n"
                        sudo apt install -y docker.io docker-compose
                    else
                        sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                    fi
                    
                elif [ "$OS_NAME" = "ubuntu" ]; then
                    # Instalar Docker para Ubuntu
                    printf "${AZUL}Configurando repositorio para Ubuntu...${NC}\n"
                    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                    sudo chmod a+r /etc/apt/keyrings/docker.gpg
                    
                    echo \
                      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
                      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                      
                    # Actualizar e instalar Docker
                    sudo apt update
                    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                else
                    # Si no es Ubuntu ni Debian, intentar con el método genérico
                    printf "${AMARILLO}Sistema operativo no reconocido específicamente. Intentando método genérico...${NC}\n"
                    
                    # Intentamos detectar la familia de distribución
                    if [ -f /etc/debian_version ]; then
                        printf "${AZUL}Detectada distribución basada en Debian...${NC}\n"
                        
                        # Primero intentar con docker.io (paquete estándar de Debian)
                        printf "${AMARILLO}Intentando instalar paquetes de Docker desde los repositorios estándar...${NC}\n"
                        sudo apt update
                        sudo apt install -y docker.io docker-compose
                        
                        # Si falla, intentar con la configuración manual
                        if ! command -v docker &> /dev/null; then
                            printf "${AMARILLO}Intentando configuración manual de repositorios Docker...${NC}\n"
                            curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                            sudo chmod a+r /etc/apt/keyrings/docker.gpg
                            
                            echo \
                              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
                              $(grep -oP 'VERSION_CODENAME=\K\w+' /etc/os-release || echo 'buster') stable" | \
                              sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                              
                            sudo apt update
                            sudo apt install -y docker-ce docker-ce-cli containerd.io
                        fi
                    else
                        printf "${ROJO}No se puede determinar automáticamente cómo instalar Docker en este sistema.${NC}\n"
                        printf "Por favor, instala Docker manualmente siguiendo las instrucciones en: https://docs.docker.com/get-docker/\n"
                        exit 1
                    fi
                fi
                
                # Verificar si la instalación fue exitosa
                if ! command -v docker &> /dev/null; then
                    printf "${ROJO}Error al instalar Docker. Por favor, instala Docker manualmente.${NC}\n"
                    exit 1
                fi
                
                # Añadir usuario actual al grupo docker para no necesitar sudo
                sudo usermod -aG docker $USER
                printf "${VERDE}Docker instalado correctamente.${NC}\n"
                printf "${AMARILLO}NOTA: Es posible que necesites cerrar sesión y volver a iniciarla para usar Docker sin sudo.${NC}\n"
                ;;
            *)
                printf "${ROJO}Docker es necesario para ejecutar este script. Instalación cancelada.${NC}\n"
                printf "Por favor, instala Docker manualmente siguiendo las instrucciones en: https://docs.docker.com/get-docker/\n"
                exit 1
                ;;
        esac
    fi
    
    # Verificar si el plugin docker compose está disponible
    if ! docker compose version &> /dev/null; then
        printf "${ROJO}ERROR: El plugin Docker Compose no está instalado.${NC}\n"
        printf "Por favor, instala el plugin Docker Compose siguiendo las instrucciones en:\n"
        printf "https://docs.docker.com/compose/install/linux/#install-using-the-repository\n"
        exit 1
    fi
}

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

# Llamar a la función para comprobar Docker y Compose
comprobar_requisitos

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
LETSENCRYPT_EMAIL=""
MONGO_USER=""
MONGO_PASSWORD=""
MONGO_DB=""
JWT_SECRET=""
SESSION_SECRET=""
ADMIN_PASS=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL=""
USE_EMAIL=""
EMAIL_HOST=""
EMAIL_PORT=""
EMAIL_SECURE=""
EMAIL_USER=""
EMAIL_PASS=""
EMAIL_FROM=""
EMAIL_TLS_REJECT=""
APP_URL=""

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
pedir_valor "Nombre de dominio principal (dejar vacío para usar IP local)" "localhost" DOMAIN_NAME

# Verificar si no hay dominio o es localhost, usar IP local
if [ "$DOMAIN_NAME" = "" ] || [ "$DOMAIN_NAME" = "localhost" ]; then
    printf "${AZUL}Se ha especificado 'localhost' o se ha dejado vacío el dominio.${NC}\n"
    printf "${AZUL}Se usará la IP local para acceder y NO se utilizará HTTPS con Let's Encrypt.${NC}\n"
    
    # Intentar obtener la IP local
    IP_LOCAL=$(hostname -I | awk '{print $1}')
    if [ -n "$IP_LOCAL" ]; then
        printf "${VERDE}IP local detectada: ${IP_LOCAL}${NC}\n"
        DOMAIN_NAME=$IP_LOCAL
    else
        printf "${AMARILLO}No se pudo detectar la IP local. Se usará 'localhost'.${NC}\n"
        DOMAIN_NAME="localhost"
    fi
    
    # Forzar USE_HTTPS a false para localhost/IP
    USE_HTTPS="false"
    printf "${AZUL}Se usará HTTP sin certificados SSL para desarrollo local.${NC}\n"
else
    # Solo preguntar por HTTPS si hay un dominio válido
    pedir_boolean "¿Usar HTTPS con Let's Encrypt?" "si" USE_HTTPS
fi

# Configurar APP_URL basado en el protocolo y dominio
if [ "$USE_HTTPS" = "true" ]; then
    APP_URL="https://${DOMAIN_NAME}"
else
    APP_URL="http://${DOMAIN_NAME}"
fi
printf "${AZUL}URL de la aplicación configurada como: ${VERDE}${APP_URL}${NC}\n"

# Solicitar correo electrónico para Let's Encrypt solo si se eligió HTTPS y no es localhost
if [ "$USE_HTTPS" = "true" ]; then
    printf "${AZUL}Para obtener certificados SSL de Let's Encrypt, es necesario proporcionar un correo electrónico válido.${NC}\n"
    printf "${AZUL}Este correo se usará para notificaciones sobre renovación y problemas con tus certificados.${NC}\n"
    LETSENCRYPT_EMAIL_DEFAULT="admin@${DOMAIN_NAME}"
    pedir_valor "Correo electrónico para certificados SSL" "$LETSENCRYPT_EMAIL_DEFAULT" LETSENCRYPT_EMAIL
    
    # Añadir información sobre certificados y advertencias
    printf "\n${AMARILLO}--- Información importante sobre HTTPS ---${NC}\n"
    if [[ "$DOMAIN_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        printf "${ROJO}AVISO: Has elegido usar HTTPS con una IP.${NC}\n"
        printf "${ROJO}Esto utilizará un certificado autofirmado que el navegador marcará como NO SEGURO.${NC}\n"
        printf "${ROJO}Es completamente normal y no indica un problema con tu instalación.${NC}\n"
        printf "${AZUL}Para usar el sitio, necesitarás aceptar el riesgo en tu navegador o añadir una excepción.${NC}\n"
    else
        printf "${AMARILLO}IMPORTANTE: Para que Let's Encrypt funcione correctamente:${NC}\n"
        printf "  ${VERDE}1. El dominio ${DOMAIN_NAME} debe apuntar a la IP pública de este servidor${NC}\n"
        printf "  ${VERDE}2. Los puertos 80 y 443 deben estar abiertos y accesibles desde Internet${NC}\n"
        printf "  ${VERDE}3. El servidor debe ser accesible públicamente (no detrás de una red NAT sin redirección)${NC}\n"
        printf "\n${AMARILLO}Si tu servidor no cumple estos requisitos:${NC}\n"
        printf "  ${AZUL}- Se usará un certificado autofirmado como respaldo${NC}\n"
        printf "  ${AZUL}- El navegador mostrará una advertencia de 'Sitio no seguro'${NC}\n"
        printf "  ${AZUL}- Deberás añadir una excepción de seguridad en tu navegador${NC}\n"
    fi
    printf "\n"
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

# Preguntar primero si se desea configurar el correo electrónico
printf "\n${AMARILLO}--- Configuración de Correo Electrónico ---${NC}\n"
pedir_boolean "¿Deseas configurar el servidor de correo electrónico?" "no" USE_EMAIL

if [ "$USE_EMAIL" = "true" ]; then
    # Configuración de Correo Electrónico si el usuario quiere configurarlo
    EMAIL_HOST_DEFAULT="mail.${DOMAIN_NAME}"
    pedir_valor "Host de correo" "$EMAIL_HOST_DEFAULT" EMAIL_HOST
    pedir_valor "Puerto SMTP" "587" EMAIL_PORT
    pedir_boolean "¿Usar conexión segura para correo?" "no" EMAIL_SECURE
    EMAIL_USER_DEFAULT="admin@${DOMAIN_NAME}"
    pedir_valor "Usuario de correo" "$EMAIL_USER_DEFAULT" EMAIL_USER
    pedir_valor "Contraseña de correo" "tu-contraseña" EMAIL_PASS false
    pedir_valor "Dirección de origen de correos" "$EMAIL_USER" EMAIL_FROM
    pedir_boolean "¿Rechazar certificados no válidos para correo?" "no" EMAIL_TLS_REJECT
else
    # Valores por defecto si no se configura el correo
    printf "${AZUL}Omitiendo configuración de correo electrónico. Se usarán valores por defecto.${NC}\n"
    EMAIL_HOST="localhost"
    EMAIL_PORT="25"
    EMAIL_SECURE="false"
    EMAIL_USER=""
    EMAIL_PASS=""
    EMAIL_FROM="noreply@example.com"
    EMAIL_TLS_REJECT="false"
fi

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
ADMIN_PASS='${ADMIN_PASS}'
APP_URL=${APP_URL}
EOF

# Crear Dockerfile para Nginx
cat > Dockerfile << EOF
FROM nginx:alpine

# Argumentos de construcción
ARG DOMAIN=localhost

# Instalar herramientas necesarias
RUN apk add --no-cache curl certbot certbot-nginx openssl

# Crear directorios necesarios
RUN mkdir -p /etc/letsencrypt /var/www/certbot /etc/ssl/private /etc/ssl/certs

# Generar certificado autofirmado por defecto usando el dominio proporcionado
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
    -keyout /etc/ssl/private/nginx-selfsigned.key \\
    -out /etc/ssl/certs/nginx-selfsigned.crt \\
    -subj "/CN=\${DOMAIN}"

# Copiar los archivos de configuración predefinidos
COPY nginx-http.conf /etc/nginx/conf.d/default.conf.http
COPY nginx-https.conf /etc/nginx/conf.d/default.conf.https
COPY nginx-selfsigned.conf /etc/nginx/conf.d/default.conf.selfsigned

# Copiar script de inicialización simplificado
COPY init-nginx.sh /init-nginx.sh
RUN chmod +x /init-nginx.sh

# Exponer puertos HTTP y HTTPS
EXPOSE 80
EXPOSE 443

# Iniciar script de configuración
CMD ["/init-nginx.sh"]
EOF

# Crear archivo de configuración HTTP básico
cat > nginx-http.conf << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Para validación de Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Todo lo demás redirige a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

# Crear archivo de configuración HTTPS con certificados Let's Encrypt
cat > nginx-https.conf << 'EOF'
server {
    listen 443 ssl;
    http2 on;
    server_name DOMAIN_PLACEHOLDER;
    
    # Certificados Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    
    # Configuración SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://app:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

# Crear archivo de configuración con certificado autofirmado
cat > nginx-selfsigned.conf << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Para validación de Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Todo lo demás redirige a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name _;
    
    # Certificados autofirmados
    ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;
    
    # Configuración SSL 
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://app:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

# Crear script de inicialización ultra simplificado
cat > init-nginx.sh << 'EOF'
#!/bin/sh

# Variables del entorno
DOMAIN=${DOMAIN:-localhost}
USE_HTTPS=${USE_HTTPS:-false}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-admin@example.com}
APP_PORT=${APP_PORT:-3000}

echo "========================================================"
echo "   CONFIGURACIÓN SIMPLIFICADA DE NGINX"
echo "========================================================"
echo "- Dominio: $DOMAIN"
echo "- HTTPS: $USE_HTTPS"
echo "- Puerto App: $APP_PORT"
echo "- Email Let's Encrypt: $LETSENCRYPT_EMAIL"

# Reemplazar valores en archivos de configuración
sed -i "s/APP_PORT_PLACEHOLDER/$APP_PORT/g" /etc/nginx/conf.d/default.conf.https
sed -i "s/APP_PORT_PLACEHOLDER/$APP_PORT/g" /etc/nginx/conf.d/default.conf.selfsigned
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/conf.d/default.conf.https

# Instalar configuración base HTTP para comenzar
cp /etc/nginx/conf.d/default.conf.http /etc/nginx/conf.d/default.conf

# Si se solicita HTTPS y tenemos un dominio válido
if [ "$USE_HTTPS" = "true" ] && [ "$DOMAIN" != "localhost" ]; then
    echo "Configurando HTTPS para dominio: $DOMAIN"
    
    # Intentar obtener o renovar certificado
    echo "Intentando obtener/renovar certificado Let's Encrypt..."
    
    # Comprobar si ya existe un certificado previo o en curso
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ] || [ -d "/etc/letsencrypt/renewal/$DOMAIN.conf" ]; then
        echo "Se encontró un certificado existente. Intentando renovar..."
        # Iniciar nginx temporalmente solo para validación
        nginx
        sleep 2
        
        # Intentar renovar certificado existente
        certbot renew --quiet
        
        # Detener nginx temporal
        nginx -s stop
        sleep 2
    else
        # Iniciar nginx temporalmente solo para validación
        nginx
        sleep 2
        
        # Obtener certificado nuevo
        certbot certonly --webroot -n --agree-tos --email $LETSENCRYPT_EMAIL \
            -w /var/www/certbot -d $DOMAIN
        
        # Detener nginx temporal
        nginx -s stop
        sleep 2
    fi
    
    # Verificar si se obtuvo el certificado
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        echo "✅ Certificado obtenido correctamente."
        
        # Usar configuración HTTPS
        cp /etc/nginx/conf.d/default.conf.https /etc/nginx/conf.d/default.conf
        
        # Configurar renovación en segundo plano
        (
            while :; do
                sleep 12h
                echo "Verificando renovación de certificados..."
                nginx -s stop
                sleep 2
                certbot renew --quiet
                if [ $? -eq 0 ]; then
                    echo "Certificados renovados."
                fi
                nginx
                sleep 2
            done
        ) &
    else
        echo "❌ Error obteniendo certificado. Usando autofirmado."
        cp /etc/nginx/conf.d/default.conf.selfsigned /etc/nginx/conf.d/default.conf
    fi
else
    echo "Usando HTTPS con certificado autofirmado."
    cp /etc/nginx/conf.d/default.conf.selfsigned /etc/nginx/conf.d/default.conf
fi

# Verificar configuración
echo "Verificando configuración..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Configuración correcta."
else
    echo "❌ Error en configuración. Usando fallback minimal."
    echo "server { listen 80; location / { proxy_pass http://app:$APP_PORT; } }" > /etc/nginx/conf.d/default.conf
fi

# Iniciar Nginx
echo "Iniciando Nginx..."
nginx -g 'daemon off;'
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
COPY .env.local .env.local

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

# Mostrar información de depuración para ayudar a resolver problemas
echo "Intentando conectar a: \$host en el puerto \$port"

# Función para verificar resolución DNS
check_dns() {
    echo "Verificando resolución DNS para \$host..."
    if getent hosts \$host > /dev/null 2>&1; then
        echo "✅ Resolución DNS exitosa para \$host"
        return 0
    fi
    
    echo "❌ Error de resolución DNS para \$host"
    return 1
}

# Función para verificar si el puerto está abierto con netcat
check_port_nc() {
    nc -z -w 2 \$host \$port > /dev/null 2>&1
    return \$?
}

# Función para verificar si el host está disponible con ping
check_host_ping() {
    ping -c 1 -W 2 \$host > /dev/null 2>&1
    return \$?
}

# Función alternativa para verificar puerto con timeout y /dev/tcp (más compatible)
check_port_tcp() {
    (echo > /dev/tcp/\$host/\$port) > /dev/null 2>&1
    return \$?
}

# Función principal para verificar si el puerto está abierto usando múltiples métodos
check_port() {
    # Intentar con netcat primero (más confiable)
    if check_port_nc; then
        return 0
    fi
    
    # Si netcat falla, intentar con /dev/tcp
    if check_port_tcp; then
        return 0
    fi
    
    # Si ambos fallan, verificar si al menos el host responde
    if check_host_ping; then
        echo "Host responde a ping pero el puerto no está disponible"
    fi
    
    return 1
}

# Función para intentar la conexión con retroceso exponencial
wait_with_backoff() {
    local max_attempts=15
    local timeout=1
    local attempt=1
    
    # Intentar resolver el nombre de host primero
    check_dns
    
    # En caso de error de resolución DNS, mostrar información útil
    if [ \$? -ne 0 ]; then
        echo "Problemas de resolución DNS detectados. Verificando la configuración de red..."
        
        # Mostrar información de red útil para depuración
        echo "---- Información de red para depuración ----"
        echo "Contenido de /etc/hosts:"
        cat /etc/hosts
        echo "Contenido de /etc/resolv.conf:"
        cat /etc/resolv.conf
        echo "Resultado de ip addr:"
        ip addr
        echo "Resultado de ip route:"
        ip route
        echo "-----------------------------------------"
        
        # Como alternativa, intentar usar la dirección IP 172.17.0.2 (IP típica del primer contenedor en la red default)
        echo "Intentando con IP alternativa (172.17.0.2) como fallback..."
        host="172.17.0.2"
    fi

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
    # Retorno 0 en lugar de 1 para permitir que la aplicación intente iniciar de todos modos
    return 0
}

# Intentar conectar con retroceso exponencial
wait_with_backoff
echo "MongoDB está disponible o se agotó el tiempo de espera, iniciando aplicación..."
exec \$cmd
EOF
chmod +x wait-for-it.sh

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
APP_URL=${APP_URL}

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
APP_URL=${APP_URL}

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
printf "${AZUL}Recuerda: Puedes acceder al panel de administración en /admin ${NC}\n"
printf "${AZUL}usando la contraseña que configuraste.${NC}\n"

# Añadir información sobre HTTPS en los mensajes finales
if [ "$USE_HTTPS" = "true" ]; then
    if [ "$DOMAIN_NAME" = "localhost" ] || [[ "$DOMAIN_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        printf "\n${AMARILLO}NOTA SOBRE HTTPS:${NC}\n"
        printf "${AMARILLO}Al acceder por HTTPS verás una advertencia de seguridad.${NC}\n"
        printf "${AMARILLO}Esto es normal cuando se usan certificados autofirmados.${NC}\n"
        printf "${AMARILLO}Para continuar, haz clic en 'Avanzado' → 'Continuar a sitio no seguro'${NC}\n"
    else
        printf "\n${AMARILLO}NOTA SOBRE HTTPS:${NC}\n"
        printf "${AMARILLO}Si Let's Encrypt no puede verificar tu dominio, verás una advertencia.${NC}\n"
        printf "${AMARILLO}Verifica que tu dominio ${DOMAIN_NAME} esté correctamente configurado${NC}\n"
        printf "${AMARILLO}y que los puertos 80 y 443 estén accesibles desde Internet.${NC}\n"
    fi
fi

printf "${VERDE}==================================================${NC}\n" 

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
export LETSENCRYPT_EMAIL
export APP_URL

# Crear compose.yml actualizado con formato YAML correcto
cat > compose.yml << EOF
services:
  nginx:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - DOMAIN=${DOMAIN_NAME}
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
      - LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
      - APP_PORT=${APP_PORT}
    networks:
      app-network:
        aliases:
          - nginx
    restart: always
    extra_hosts:
      - "host.docker.internal:host-gateway"
    hostname: nginx
    container_name: nginx
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
      - ADMIN_PASS=${ADMIN_PASS}
      - APP_URL=${APP_URL}
    expose:
      - "${APP_PORT}"
    depends_on:
      mongo:
        condition: service_started
    networks:
      app-network:
        aliases:
          - app
    restart: always
    hostname: app
    container_name: app
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:${APP_PORT}/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  mongo:
    image: mongo:4.4
    command: ["--auth", "--bind_ip_all"]
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
      app-network:
        aliases:
          - mongo
    restart: always
    hostname: mongo
    container_name: mongo
    extra_hosts:
      - "host.docker.internal:host-gateway"
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
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1

volumes:
  mongo-data:
  certbot-etc:
  certbot-var:
  certbot-www:
EOF

# Mostrar el archivo compose.yml generado (para verificación)
echo "Archivo compose.yml generado:"
cat compose.yml