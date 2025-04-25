# 🚀 Yappers - Chat en Tiempo Real 💬

¡Bienvenido a Yappers! Una aplicación web moderna y dinámica para chatear en tiempo real con otros usuarios. Construida con Node.js, Express, Socket.IO y MongoDB.

![Chat Screenshot](https://via.placeholder.com/600x300.png?text=Imagen+del+Chat+Aqu%C3%AD)
*(Reemplaza la URL de arriba con una captura de pantalla real de tu aplicación)*

---

## ✨ Características Principales

*   **🗨️ Chat en Tiempo Real:** Comunicación instantánea gracias a WebSockets (Socket.IO).
*   **🔒 Autenticación de Usuarios:** Sistema seguro de registro e inicio de sesión (incluyendo Google OAuth).
*   **💾 Persistencia de Mensajes:** Los mensajes se guardan en una base de datos MongoDB.
*   **👤 Lista de Usuarios:** Ve quién está conectado en tiempo real.
*   **🖼️ Compartir Multimedia:** Envía y recibe imágenes, videos y otros archivos.
    *   Visualización integrada para imágenes y videos.
    *   Botones de descarga dedicados.
    *   Manejo eficiente de archivos grandes con GridFS.
*   **📊 Indicadores de Estado:** Feedback visual durante la subida y descarga de archivos.
*   **🎨 Interfaz Moderna:** Diseño limpio, responsivo y fácil de usar.
*   **⚙️ Panel de Administración (Opcional):** Funcionalidades para gestionar usuarios y mensajes (si se implementa).
*   **🚀 Optimizado:** Carga fragmentada para archivos grandes, limitación de tasa de mensajes y más.

---

## 🛠️ Tecnologías Utilizadas

*   **Backend:** Node.js, Express.js
*   **Comunicación Real-Time:** Socket.IO
*   **Base de Datos:** MongoDB (con Mongoose ODM y GridFS para archivos grandes)
*   **Autenticación:** Passport.js (estrategias Local y Google OAuth 2.0), JWT, bcrypt
*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS)
*   **Librerías Frontend:** Moment.js (para fechas)
*   **Despliegue (Ejemplos):** Heroku, Render, AWS, DigitalOcean, etc.

---

## ⚙️ Instalación y Configuración

Sigue estos pasos para poner en marcha la aplicación en tu entorno local:

1.  **Clonar el Repositorio:**
    ```bash
    git clone https://github.com/tu-usuario/yappers-chat.git # Reemplaza con la URL de tu repo
    cd yappers-chat
    ```

2.  **Instalar Dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto y añade las siguientes variables (ajusta los valores según tu configuración):
    ```dotenv
    PORT=3000
    MONGO_URI=mongodb://localhost:27017/yappers_chat # O tu URI de MongoDB Atlas/local
    JWT_SECRET=TU_SECRETO_JWT_MUY_SEGURO # Cambia esto por una clave segura
    SESSION_SECRET=OTRO_SECRETO_PARA_SESIONES # Cambia esto por otra clave segura

    # Configuración de Google OAuth (Opcional - si usas autenticación con Google)
    GOOGLE_CLIENT_ID=TU_GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET=TU_GOOGLE_CLIENT_SECRET
    GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback # Ajusta si es necesario
    ```
    *   **Nota:** Asegúrate de tener MongoDB instalado y corriendo localmente o usa una instancia en la nube como MongoDB Atlas.
    *   Para obtener las credenciales de Google OAuth, crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).

4.  **Iniciar la Aplicación:**
    *   **Modo Desarrollo (con nodemon para recarga automática):**
        ```bash
        npm run dev
        ```
    *   **Modo Producción:**
        ```bash
        npm start
        ```

5.  **Acceder a la Aplicación:**
    Abre tu navegador y visita `http://localhost:3000` (o el puerto que hayas configurado).

---

## 🚀 Uso

1.  **Regístrate:** Crea una nueva cuenta con un nombre de usuario y contraseña o usa la opción de Google.
2.  **Inicia Sesión:** Accede con tus credenciales.
3.  **Chatea:** ¡Empieza a enviar mensajes de texto y archivos multimedia!
4.  **Explora:** Interactúa con la lista de usuarios, visualiza archivos multimedia y disfruta de la experiencia en tiempo real.

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si deseas mejorar la aplicación:

1.  Haz un Fork del repositorio.
2.  Crea una nueva rama (`git checkout -b feature/nueva-funcionalidad`).
3.  Realiza tus cambios y haz commit (`git commit -m 'Añadir nueva funcionalidad'`).
4.  Haz Push a la rama (`git push origin feature/nueva-funcionalidad`).
5.  Abre un Pull Request.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles (si existe).

---

Hecho con ❤️ por [Tu Nombre/Usuario] 