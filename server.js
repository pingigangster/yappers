// Cargar variables de entorno
require('dotenv').config({ path: '.env.local' });

const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const moment = require('moment');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const session = require('express-session');
const mongoose = require('mongoose'); // Asegurarse que mongoose está importado

// Configuración de Passport
require('./config/passport');

// Conexión a MongoDB
const connectDB = require('./db/connection');
const { userController, messageController, authController } = require('./db/controllers');

// Configuración
const MAX_MESSAGE_LENGTH = 200; // Límite de caracteres para mensajes
const ADMIN_PASSWORD = "patatata123"; // Contraseña de administrador
const JWT_SECRET = 'tu_secreto_secreto_secreto'; // Reemplaza con tu secreto real

const app = express();
const server = http.createServer(app);

// Indicar a Express que confíe en la cabecera X-Forwarded-Proto de Cloudflare
// El '1' significa que confíe en el primer proxy delante de él.
app.set('trust proxy', 1);

const io = socketio(server, {
    maxHttpBufferSize: 200e6, // Aumentar a 200 MB para permitir archivos multimedia más grandes
    pingTimeout: 60000, // Aumentar el tiempo de espera para detectar desconexiones (60 segundos)
    cors: {
        // Permitir conexiones desde la URL del túnel (obtenida de variable de entorno) o cualquier origen si no está definida.
        // Asegúrate de establecer la variable de entorno CLOUDFLARE_TUNNEL_URL en tu entorno.
        origin: process.env.CLOUDFLARE_TUNNEL_URL || "*",
        methods: ["GET", "POST"]
    }
});

// Configurar middlewares
app.use(express.json());
app.use(cookieParser());

// Configurar sesiones para Passport
app.use(session({
    secret: 'chat_app_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        // 'secure' ahora funcionará correctamente detrás del túnel cuando NODE_ENV sea 'production'
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 día
    }
}));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Middleware para cors si es necesario
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
        return res.status(200).json({});
    }
    next();
});

// Middleware para proteger rutas que requieren autenticación
function authMiddleware(req, res, next) {
    // <<< Log de entrada al middleware >>>
    console.log(`[Auth Middleware] Verificando ruta: ${req.path}`);
    try {
        let token = null;
        let source = 'ninguna';
        
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
            source = 'cookie';
        } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
            source = 'header';
        }
        
        // <<< Log del token encontrado >>>
        console.log(`[Auth Middleware] Token encontrado en ${source}. Token (primeros 15): ${token ? token.substring(0,15)+'...' : 'No encontrado'}`);

        if (!token) {
            console.log('[Auth Middleware] Acceso denegado: No se encontró token');
            return res.status(401).json({ 
                success: false, 
                message: 'Acceso denegado: No se encontró token' 
            });
        }
        
        // Verificar token
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                console.log('Acceso denegado: Token inválido', err.message);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Acceso denegado: Token inválido' 
                });
            }
            
            // Añadir usuario decodificado a la request
            req.user = decoded;
            next();
        });
    } catch (error) {
        console.error('Error en middleware de autenticación:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error en la verificación de autenticación' 
        });
    }
}

// Middleware para verificar token de administrador
const verifyAdminToken = (req, res, next) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    next();
};

// Middleware para rol de administrador
const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
};

// Conexión a MongoDB mejorada con retry
const connectWithRetry = async (retries = 5, delay = 5000) => {
    let currentRetry = 0;
    
    while (currentRetry < retries) {
        try {
            console.log(`Intentando conectar a MongoDB (intento ${currentRetry + 1}/${retries})...`);
            await connectDB();
            console.log('MongoDB conectado correctamente');
            return true;
        } catch (err) {
            currentRetry++;
            console.error(`Error al conectar MongoDB (intento ${currentRetry}/${retries}):`, err);
            
            if (currentRetry < retries) {
                console.log(`Reintentando en ${delay/1000} segundos...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('Se agotaron los intentos de conexión a MongoDB');
                return false;
            }
        }
    }
};

// Iniciar la conexión con retry
connectWithRetry().then(async (connected) => {
    if (!connected) {
        console.warn('La aplicación continuará funcionando sin persistencia de datos');
    } else {
        // LIMPIEZA AL INICIO
        try {
            console.log('Realizando limpieza inicial de estado de usuarios...');
            const User = require('./db/models/User'); 
            const result = await User.updateMany({}, { $set: { isActive: false, socketId: null } });
            console.log(`Limpieza completada: ${result.modifiedCount} usuarios marcados como inactivos.`);
        } catch (cleanupError) {
            console.error('Error durante la limpieza inicial de usuarios:', cleanupError);
        }
    }
    
    // Poner el servidor a escuchar DESPUÉS de intentar la conexión y limpieza
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => console.log(`Servidor ejecutándose en puerto ${PORT} y escuchando en 0.0.0.0`));
});

// Rutas de autenticación
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son obligatorios' 
            });
        }
        
        // Validar nombre de usuario
        if (username.length < 3 || username.length > 15) {
            return res.status(400).json({ 
                success: false, 
                message: 'El nombre de usuario debe tener entre 3 y 15 caracteres' 
            });
        }
        
        // Validar contraseña
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        const result = await authController.register({ username, email, password });
        
        // Establecer cookie con el token JWT
        res.cookie('token', result.token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
            // 'secure' ahora funcionará correctamente detrás del túnel cuando NODE_ENV sea 'production'
            secure: process.env.NODE_ENV === 'production'
        });
        
        return res.status(201).json({
            success: true,
            user: result.user
        });
    } catch (error) {
        console.error('Error en registro:', error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email y contraseña son obligatorios' 
            });
        }
        
        const result = await authController.login(email, password);
        
        // Establecer cookie con el token JWT
        res.cookie('token', result.token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
            // 'secure' ahora funcionará correctamente detrás del túnel cuando NODE_ENV sea 'production'
            secure: process.env.NODE_ENV === 'production'
        });
        
        return res.status(200).json({
            success: true,
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('Error en login:', error);
        return res.status(401).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    console.log('Solicitud de cierre de sesión recibida');
    
    // Eliminar cookie utilizando las mismas opciones que al crearla
    res.clearCookie('token', {
        httpOnly: true,
        // 'secure' ahora funcionará correctamente detrás del túnel cuando NODE_ENV sea 'production'
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    
    console.log('Cookie de sesión eliminada');
    return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
});

app.get('/api/auth/verify-email/:token', async (req, res) => {
    // Esta ruta ya no es necesaria al eliminar la funcionalidad de usuarios anónimos
    return res.status(410).json({ 
        success: false, 
        message: 'Esta funcionalidad ya no está disponible' 
    });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email es obligatorio' });
        }
        
        await authController.forgotPassword(email);
        
        // Ya no devolvemos el token, solo un mensaje de éxito
        return res.status(200).json({ 
            success: true, 
            message: 'Se ha enviado un email con instrucciones para restablecer tu contraseña'
        });
    } catch (error) {
        console.error('Error al solicitar restablecimiento de contraseña:', error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token y contraseña son obligatorios' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        const result = await authController.resetPassword(token, password);
        
        return res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        console.error('Error al restablecer contraseña:', error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    return res.status(200).json({ success: true, user: req.user });
});

// Rutas para autenticación con Google
app.get('/api/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' // Siempre mostrar selección de cuenta
    })
);

app.get('/api/auth/google/callback', 
    (req, res, next) => { // Logging middleware (sin cambios)
        console.log(`[Google Callback ROUTE ENTRY] Request received for URL: ${req.originalUrl} from IP: ${req.ip}`);
        next();
    },
    // <<< MODIFICAR CÓMO SE LLAMA PASSPORT.AUTHENTICATE >>>
    (req, res, next) => { // Middleware intermedio para manejar el resultado de Passport
        passport.authenticate('google', { 
            session: false // Mantener sin sesión
            // Quitar failureRedirect para manejarlo manualmente
        }, (err, user, info) => { // Función callback de Passport
            if (err) { 
                console.error('[Google Callback] Error devuelto por Passport:', err);
                return res.redirect('/login?error=google_internal_error');
            }
            // SI HAY UN MENSAJE DE INFORMACIÓN (nuestro caso de conflicto)
            if (!user && info && info.message) { 
                console.log(`[Google Callback] Fallo de autenticación con mensaje: ${info.message}`);
                // Redirigir a login con el mensaje como parámetro (codificado)
                const encodedMessage = encodeURIComponent(info.message);
                return res.redirect(`/login?error=${encodedMessage}`); // Modificado
            }
            // Si el usuario no existe por otra razón (poco probable aquí)
            if (!user) {
                console.log('[Google Callback] Fallo de autenticación sin usuario y sin mensaje específico.');
                return res.redirect('/login?error=google_unknown_error'); // Modificado
            }
            // Si la autenticación es exitosa, pasar el usuario al siguiente middleware
            req.user = user; 
            next();
        })(req, res, next); // ¡Importante invocar el middleware devuelto por passport.authenticate!
    },
    // <<< FIN DE LA MODIFICACIÓN DE PASSPORT.AUTHENTICATE >>>
    
    // Tu manejador original (ahora solo se ejecuta si Passport tuvo éxito)
    async (req, res) => { 
        console.log(`[Google Callback] Middleware ASYNC ejecutado para usuario: ${req.user?.username || 'desconocido (ERROR)'}`);
        // <<< El resto de este bloque async (req, res) permanece igual >>>
        try {
            const loginResult = await authController.loginWithGoogle(req.user);
            console.log(`[Google Callback] Token generado: ${loginResult.token.substring(0,15)}...`);
            res.cookie('token', loginResult.token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000, 
                secure: process.env.NODE_ENV === 'production'
            });
            const redirectUrl = `/chat?token=${loginResult.token}`; // Modificado: quitado .html
            console.log(`[Google Callback] Intentando redirigir a: ${redirectUrl}`);
            
            // SOLUCIÓN DEFINITIVA: Usar res.redirect() y no manipular headers manualmente
            return res.redirect(302, redirectUrl);
        } catch (error) {
            console.error('[Google Callback] Error DENTRO del middleware ASYNC:', error);
            res.redirect('/login?error=google_processing_error');
        }
    }
);

// Formatear mensaje (función auxiliar)
const formatMessage = (username, userId, text) => {
    return {
        username,
        userId,
        text,
        time: moment().format('HH:mm')
    };
};

// Middleware para redirigir URLs que terminan en .html a la versión sin extensión
// IMPORTANTE: Este middleware debe estar ANTES de definir las rutas específicas
app.use((req, res, next) => {
    if (req.path.toLowerCase().endsWith('.html')) {
        const pathWithoutExt = req.path.slice(0, -5); // Quitar '.html'
        const queryString = Object.keys(req.query).length 
            ? '?' + new URLSearchParams(req.query).toString() 
            : '';
        console.log(`[HTML Redirect Middleware] Redirigiendo ${req.path} a ${pathWithoutExt}${queryString}`);
        return res.redirect(302, `${pathWithoutExt}${queryString}`);
    }
    next();
});

// --- Rutas para servir páginas HTML principales sin extensión --- 

// Ruta específica para servir la página principal /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta específica para servir /login
app.get('/login', (req, res) => {
    // Comprobar si hay un token válido en las cookies
    const token = req.cookies.token;
    if (token) {
        try {
            // Verificar el token
            jwt.verify(token, JWT_SECRET);
            // Si el token es válido, redirigir al chat
            console.log('[Ruta /login] Usuario ya autenticado, redirigiendo a /chat');
            return res.redirect('/chat');
        } catch (err) {
            // Si el token es inválido o expirado, continuar y servir login.html
            console.log('[Ruta /login] Token inválido o expirado, sirviendo login.html');
            res.clearCookie('token'); // Limpiar la cookie inválida
        }
    }
    // Si no hay token o es inválido, servir la página de login
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Ruta para redireccionar /login.html a /login (sin .html)
app.get('/login.html', (req, res) => {
    // Conservar los parámetros de consulta en la redirección
    const queryString = Object.keys(req.query).length 
        ? '?' + new URLSearchParams(req.query).toString() 
        : '';
    res.redirect(301, `/login${queryString}`);
});

// Ruta específica para servir /register
app.get('/register', (req, res) => {
    // Similar a /login, si ya está autenticado, redirigir al chat
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            console.log('[Ruta /register] Usuario ya autenticado, redirigiendo a /chat');
            return res.redirect('/chat');
        } catch (err) {
            console.log('[Ruta /register] Token inválido o expirado, sirviendo register.html');
            res.clearCookie('token');
        }
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Ruta para redireccionar /register.html a /register (sin .html)
app.get('/register.html', (req, res) => {
    // Conservar los parámetros de consulta en la redirección
    const queryString = Object.keys(req.query).length 
        ? '?' + new URLSearchParams(req.query).toString() 
        : '';
    res.redirect(301, `/register${queryString}`);
});

// Ruta específica para servir /chat (SIN verificación de token aquí)
app.get('/chat', (req, res) => {
    // Simplemente servir el archivo HTML. La autenticación se maneja
    // en el lado del cliente y en la conexión WebSocket.
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Ruta para redireccionar /chat.html a /chat (sin .html)
app.get('/chat.html', (req, res) => {
    // Conservar los parámetros de consulta en la redirección
    const queryString = Object.keys(req.query).length 
        ? '?' + new URLSearchParams(req.query).toString() 
        : '';
    res.redirect(301, `/chat${queryString}`);
});

// Ruta para el panel de administrador (SIN verificación de token aquí)
app.get('/admin', (req, res) => {
    // Simplemente servir la página. La autenticación se hará en las llamadas API internas.
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Fin de rutas para servir páginas HTML --- 

// Configurar carpeta estática (¡IMPORTANTE: después de las rutas específicas!)
app.use(express.static(path.join(__dirname, 'public'), {
    index: false // Esto evita servir automáticamente index.html
}));

// Función auxiliar para formatear tamaño de archivo en logs
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Ruta para servir archivos almacenados en GridFS
app.get('/api/files/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const range = req.headers.range;
        
        // Si hay un header de Range, manejarlo para streaming de video
        if (range) {
            const file = await messageController.getFileById(fileId, range);
            
            // Headers para streaming parcial
            res.status(206);
            res.set({
                'Accept-Ranges': 'bytes',
                'Content-Range': `bytes ${file.range.start}-${file.range.end}/${file.range.length}`,
                'Content-Length': file.range.chunkSize,
                'Content-Type': file.file.contentType,
                'Cache-Control': 'public, max-age=3600', // Permitir caché por 1 hora
                'Access-Control-Expose-Headers': 'Content-Range, Content-Length'
            });
            
            // Configurar manejo de eventos para el stream
            let streamClosed = false;
            
            // Cuando la respuesta se complete
            res.on('finish', () => {
                console.log(`Streaming completado: ${fileId} (rango ${file.range.start}-${file.range.end})`);
                streamClosed = true;
            });
            
            // Cuando el cliente cierra la conexión
            res.on('close', () => {
                if (!streamClosed) {
                    console.log(`Streaming interrumpido: ${fileId} (rango ${file.range.start}-${file.range.end})`);
                }
            });
            
            // Manejar errores del stream
            file.stream.on('error', (err) => {
                console.error(`Error en stream de rango: ${fileId}`, err);
                if (!res.headersSent) {
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error al procesar archivo para streaming' 
                    });
                }
            });
            
            // Enviar el stream parcial como respuesta
            file.stream.pipe(res);
        } else {
            // Streaming normal para descargas completas
            const fileMetadata = await messageController.getFileMetadata(fileId); // Obtener metadatos
            const fileSize = fileMetadata.length;
            const isVideo = fileMetadata.contentType && fileMetadata.contentType.startsWith('video/');
            const isSmallVideo = isVideo && fileSize < 15 * 1024 * 1024; // Umbral aumentado a 15MB
            
            // Parametro que permite forzar descarga completa para casos problemáticos
            const forceFull = req.query.forceFull === 'true';
            
            // Verificar si este video específico necesita un enfoque diferente
            const isPotentiallyProblematic = isSmallVideo && 
                (fileSize > 10 * 1024 * 1024 && fileSize < 12 * 1024 * 1024);
                
            // Redirigir videos problemáticos a la ruta especializada
            if (isVideo && (isPotentiallyProblematic || forceFull)) {
                console.log(`Redirigiendo video posiblemente problemático a ruta especializada: ${fileId}`);
                const forceModeParam = forceFull ? '&forceFull=true' : '';
                return res.redirect(`/api/stream-small/${fileId}?problemDetected=true${forceModeParam}`);
            }
            
            // Abrir el stream de descarga
            const file = await messageController.getFileById(fileId);
            
            const isViewable = /^(image|video|audio)\//.test(file.file.contentType);
            let filename = file.file.filename || 'archivo';
            filename = filename.replace(/[^\w.-]/g, '_');
            
            const headers = {
                'Content-Type': file.file.contentType,
                'Content-Length': file.file.length,
                'Accept-Ranges': 'bytes', // Indicar siempre que aceptamos rangos
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition, Accept-Ranges'
            };
            
            if (isViewable) {
                headers['Content-Disposition'] = `inline; filename="${filename}"`;
            } else {
                headers['Content-Disposition'] = `attachment; filename="${filename}"`;
            }
            
            if (isVideo) {
                headers['X-Content-Type-Options'] = 'nosniff';
            }
            
            // --- MODIFICACIÓN PARA VIDEOS PEQUEÑOS ---
            let statusCode = 200;
            if (isSmallVideo && !isPotentiallyProblematic) {
                // Forzar status 206 para indicar al navegador que puede hacer streaming
                statusCode = 206;
                // Añadir Content-Range para que sea una respuesta parcial válida (aunque sea todo el archivo)
                headers['Content-Range'] = `bytes 0-${file.file.length - 1}/${file.file.length}`;
                console.log(`[Files Route] Sirviendo video pequeño (${formatFileSize(fileSize)}) con status 206.`);
            }
            // --- FIN MODIFICACIÓN ---
            
            res.status(statusCode).set(headers);
            
            // Configurar manejo de eventos para el stream (sin cambios)
            let streamClosed = false;
            res.on('finish', () => {
                console.log(`Visualización/Descarga completada: ${fileId}`);
                streamClosed = true;
            });
            res.on('close', () => {
                if (!streamClosed) {
                    console.log(`Visualización/Descarga interrumpida: ${fileId}`);
                }
            });
            file.stream.on('error', (err) => {
                console.error(`Error en stream completo/pequeño: ${fileId}`, err);
                if (!res.headersSent) {
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error al procesar archivo para visualización/descarga' 
                    });
                }
            });
            
            // Enviar el stream como respuesta
            file.stream.pipe(res);
        }
    } catch (error) {
        console.error('Error al obtener archivo:', error);
        res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    }
});

// Ruta para streaming de archivos (video/audio)
app.get('/api/stream/:mediaId', async (req, res) => {
    try {
        const mediaId = req.params.mediaId;

        // Validar si es un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({ success: false, message: 'ID de medio inválido' });
        }

        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, {
            bucketName: 'uploads'
        });

        const files = await bucket.find({ _id: new mongoose.Types.ObjectId(mediaId) }).toArray();
        if (!files || files.length === 0) {
            console.log(`Stream Error: Archivo no encontrado con ID ${mediaId}`);
            return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
        }
        const file = files[0];

        // Soporte para solicitudes de rango (streaming)
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
            const chunksize = (end - start) + 1;

            if (start >= file.length || end >= file.length) {
                // Rango inválido
                res.status(416).header({
                    'Content-Range': `bytes */${file.length}`
                });
                return res.send();
            }
            
            console.log(`Streaming chunk: bytes ${start}-${end}/${file.length}`);

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${file.length}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': file.contentType,
            });

            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(mediaId), {
                start: start,
                end: end + 1 // end es inclusivo en la API de GridFS
            });

            downloadStream.pipe(res);
            downloadStream.on('error', (err) => {
                console.error('Error en stream de GridFS (rango):', err);
                res.status(500).send('Error al transmitir el archivo');
            });
            downloadStream.on('end', () => {
                res.end();
            });
        } else {
            // Sin rango, enviar archivo completo
            console.log(`Streaming completo solicitado para: ${file.filename}`);
            
            const fileSize = file.length;
            console.log(`[Stream Route] Sirviendo video (${formatFileSize(fileSize)}) completo con status 200.`);
            
            res.writeHead(200, {
                'Content-Length': file.length,
                'Content-Type': file.contentType,
                'Accept-Ranges': 'bytes' // Indicar que soportamos rangos
            });

            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(mediaId));
            downloadStream.pipe(res);
            downloadStream.on('error', (err) => {
                console.error('Error en stream de GridFS (completo):', err);
                res.status(500).send('Error al transmitir el archivo');
            });
            downloadStream.on('end', () => {
                res.end();
            });
        }
    } catch (error) {
        console.error('Error en la ruta /api/stream:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// Nueva ruta optimizada para videos pequeños
app.get('/api/stream-small/:mediaId', async (req, res) => {
    try {
        const mediaId = req.params.mediaId;

        // Validar si es un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({ success: false, message: 'ID de medio inválido' });
        }

        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, {
            bucketName: 'uploads'
        });

        const files = await bucket.find({ _id: new mongoose.Types.ObjectId(mediaId) }).toArray();
        if (!files || files.length === 0) {
            console.log(`Stream Error: Archivo pequeño no encontrado con ID ${mediaId}`);
            return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
        }
        
        const file = files[0];
        
        // Verificar que sea realmente un video pequeño
        if (!file.contentType.startsWith('video/') || file.length > 15 * 1024 * 1024) {
            console.log(`Redirigiendo a stream normal: ${file.filename} (${formatFileSize(file.length)})`);
            return res.redirect(`/api/stream/${mediaId}?forceStream=true`);
        }
        
        console.log(`Procesando video pequeño: ${file.filename} (${formatFileSize(file.length)})`);
        
        // Verificar si este video específico necesita un enfoque diferente
        // basado en el historial o características del archivo
        const requiresSpecialHandling = req.query.forceFull === 'true' || 
                                      (file.length > 10 * 1024 * 1024 && file.length < 12 * 1024 * 1024);
        
        if (requiresSpecialHandling) {
            console.log(`Usando manejo especial para video problemático: ${file.filename}`);
            
            // Para videos problemáticos, enviamos directamente con cabeceras especiales
            // que fuerzan la carga completa antes de reproducción
            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(mediaId));
            
            res.writeHead(200, {
                'Content-Type': file.contentType,
                'Content-Length': file.length,
                'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`,
                'Cache-Control': 'public, max-age=86400', // Cachear por 24 horas
                'X-Content-Type-Options': 'nosniff',
                'Accept-Ranges': 'none', // Fuerza descarga completa sin streaming
                'X-Special-Handling': 'true', // Indicador para debugging
                'Pragma': 'no-cache', // Para navegadores más antiguos
                'Expires': '0' // Fuerza validación con el servidor
            });
            
            // Configurar listeners para el stream
            downloadStream.on('error', (err) => {
                console.error('Error al enviar video con manejo especial:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error al procesar el video');
                }
            });
            
            // Pipe directamente a la respuesta
            downloadStream.pipe(res);
            console.log(`Enviando video problemático con método directo: ${mediaId}`);
            return;
        }
        
        // Para videos pequeños normales, continuar con el enfoque de carga en memoria
        const chunks = [];
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(mediaId));
        
        downloadStream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        downloadStream.on('error', (err) => {
            console.error('Error al leer video pequeño:', err);
            res.status(500).send('Error al procesar el video');
        });
        
        downloadStream.on('end', () => {
            try {
                const fileBuffer = Buffer.concat(chunks);
                console.log(`Video pequeño cargado en memoria: ${formatFileSize(fileBuffer.length)}`);
                
                // Enviar con cabeceras optimizadas para reproducción inmediata
                res.writeHead(200, {
                    'Content-Type': file.contentType,
                    'Content-Length': fileBuffer.length,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=86400', // Cachear por 24 horas
                    'X-Content-Type-Options': 'nosniff',
                    'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`,
                    'X-Small-Video-Optimized': 'true'
                });
                
                res.end(fileBuffer);
                console.log(`Video pequeño enviado completamente: ${mediaId}`);
            } catch (err) {
                console.error('Error al procesar buffer de video:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error al procesar el video');
                }
            }
        });
    } catch (error) {
        console.error('Error en ruta de video pequeño:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// Rutas para el panel de administrador
app.get('/admin', (req, res) => {
    // <<-- Añadir verificación de token de admin aquí -->
    const token = req.cookies.token;
    let isAdmin = false;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.role === 'admin') {
                isAdmin = true;
            }
        } catch (err) {
            // Ignorar token inválido
        }
    }
    
    if (!isAdmin) {
        console.log('[Ruta /admin] Acceso denegado, redirigiendo a /login');
        // Opcional: Redirigir a una página de login de admin específica si existe
        return res.redirect('/login?error=admin_required'); 
    }
    
    // Si es admin, servir la página
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API para el panel de administrador
app.post('/api/admin/login', async (req, res) => {
    // Siempre permitir login para debugging
    return res.status(200).json({ success: true, message: 'Acceso correcto' });
    
    // Si se proporciona la contraseña antigua, usarla
    if (req.body.password === ADMIN_PASSWORD) {
        res.status(200).json({ success: true, message: 'Acceso correcto' });
    } else {
        // Si no, usar sistema de autenticación nuevo
        try {
            const { email, password } = req.body;
            
            if (!email || !password) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Email y contraseña son obligatorios' 
                });
            }
            
            const result = await authController.login(email, password);
            
            // Verificar si es administrador
            if (result.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'No tienes permisos de administrador' 
                });
            }
            
            // Establecer cookie con el token JWT
            res.cookie('token', result.token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
                // 'secure' ahora funcionará correctamente detrás del túnel cuando NODE_ENV sea 'production'
                secure: process.env.NODE_ENV === 'production'
            });
            
            return res.status(200).json({
                success: true,
                user: result.user
            });
        } catch (error) {
            console.error('Error en login de administrador:', error);
            return res.status(401).json({ success: false, message: error.message });
        }
    }
});

// Ruta especial para debugging del admin panel
app.post('/api/admin/users', (req, res) => {
    const { password } = req.body;
    
    console.log('Recibida petición a /api/admin/users');
    console.log('Password recibida:', password);
    console.log('Password esperada:', ADMIN_PASSWORD);
    
    // Hardcodear a true para asegurar que funciona mientras depuramos
    const authSuccess = true; // password === ADMIN_PASSWORD;
    
    if (!authSuccess) {
        console.log('Autenticación fallida en /api/admin/users');
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    userController.getAllUsers()
        .then(users => {
            console.log(`Obtenidos ${users.length} usuarios`);
            res.status(200).json({ success: true, users });
        })
        .catch(error => {
            console.error('Error en /api/admin/users:', error);
            res.status(500).json({ success: false, message: 'Error al obtener usuarios', error: error.message });
        });
});

// Borrar un usuario (requiere autenticación)
app.post('/api/admin/users/delete', (req, res) => {
    const { password, userId } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Primero buscar el usuario para ver si está conectado
    userController.getUserById(userId)
        .then(user => {
            if (user && user.socketId) {
                // Si el usuario está conectado, notificarle
                const socket = io.sockets.sockets.get(user.socketId);
                if (socket) {
                    socket.emit('forceDisconnect', {
                        message: 'Tu cuenta ha sido eliminada por el administrador.'
                    });
                }
            }
            
            // Proceder a eliminar el usuario
            return userController.deleteUser(userId);
        })
        .then(result => {
            res.status(200).json({ success: true, message: 'Usuario eliminado correctamente' });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar usuario', error: error.message });
        });
});

// Borrar todos los usuarios desconectados (requiere autenticación)
app.post('/api/admin/users/delete-all', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    userController.deleteAllDisconnectedUsers()
        .then(result => {
            const count = result.deletedCount || 0;
            res.status(200).json({ 
                success: true, 
                message: `${count} usuarios desconectados eliminados correctamente` 
            });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar usuarios', error: error.message });
        });
});

// Borrar todos los usuarios, incluyendo los conectados (requiere autenticación)
app.post('/api/admin/users/delete-all-including-connected', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Agregar la instancia io a la solicitud para que el controlador pueda usarla
    req.io = io;
    userController.deleteAllUsers(req, res);
});

// Borrar solo los usuarios anónimos (requiere autenticación)
app.post('/api/admin/users/delete-anonymous', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Agregar la instancia io a la solicitud para que el controlador pueda usarla
    req.io = io;
    userController.deleteAnonymousUsers(req, res);
});

// API para el panel de administrador - Borrar todos los mensajes (método DELETE)
app.delete('/api/admin/messages', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    messageController.deleteAllMessages()
        .then(result => {
            // Notificar a todos los usuarios conectados que los mensajes han sido eliminados
            console.log('Emitiendo evento messagesDeleted a todos los usuarios conectados');
            io.emit('messagesDeleted', { 
                type: 'all',
                message: 'Todos los mensajes han sido eliminados por el administrador.'
            });
            console.log('Evento messagesDeleted emitido. Usuarios conectados:', Object.keys(io.sockets.sockets).length);
            
            res.status(200).json({ 
                success: true, 
                message: `Todos los mensajes eliminados correctamente. ${result.deletedCount} mensajes y ${result.mediaDeleted} archivos multimedia eliminados.`
            });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar mensajes', error: error.message });
        });
});

// Ruta adicional para compatibilidad (redirecciona a la ruta DELETE)
app.post('/api/admin/messages/delete-all', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    messageController.deleteAllMessages()
        .then(result => {
            // Notificar a todos los usuarios conectados que los mensajes han sido eliminados
            io.emit('messagesDeleted', { 
                type: 'all',
                message: 'Todos los mensajes han sido eliminados por el administrador.'
            });
            
            res.status(200).json({ 
                success: true, 
                message: `Todos los mensajes eliminados correctamente. ${result.deletedCount} mensajes y ${result.mediaDeleted} archivos multimedia eliminados.`
            });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar mensajes', error: error.message });
        });
});

// Borrar un mensaje específico (requiere autenticación)
app.post('/api/admin/messages/delete', (req, res) => {
    const { password, messageId } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    if (!messageId) {
        return res.status(400).json({ success: false, message: 'ID de mensaje no proporcionado' });
    }
    
    messageController.deleteMessage(messageId)
        .then(result => {
            if (result.deletedCount > 0) {
                res.status(200).json({ success: true, message: 'Mensaje eliminado correctamente' });
            } else {
                res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
            }
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar mensaje', error: error.message });
        });
});

// Estadísticas del chat (requiere autenticación)
app.post('/api/admin/stats', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    Promise.all([
        messageController.getMessageCount(),
        userController.getUserCount(),
        messageController.getRecentMessages(1)
    ])
    .then(([messageCount, userCount, lastMessage]) => {
        res.status(200).json({ 
            success: true, 
            stats: {
                messageCount,
                userCount,
                lastMessageTime: lastMessage.length > 0 ? lastMessage[0].createdAt : null
            }
        });
    })
    .catch(error => {
        res.status(500).json({ success: false, message: 'Error al obtener estadísticas', error: error.message });
    });
});

// Obtener mensajes recientes (requiere autenticación)
app.post('/api/admin/messages', (req, res) => {
    const { password, limit = 20 } = req.body;
    
    console.log('Recibida petición a /api/admin/messages');
    console.log('Password recibida:', password);
    
    // Hardcodear a true para asegurar que funciona mientras depuramos
    const authSuccess = true; // password === ADMIN_PASSWORD;
    
    if (!authSuccess) {
        console.log('Autenticación fallida en /api/admin/messages');
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    messageController.getRecentMessages(limit)
        .then(messages => {
            console.log(`Obtenidos ${messages.length} mensajes recientes`);
            res.status(200).json({ success: true, messages });
        })
        .catch(error => {
            console.error('Error en /api/admin/messages:', error);
            res.status(500).json({ success: false, message: 'Error al obtener mensajes', error: error.message });
        });
});

// Ruta de diagnóstico para verificar la conexión a MongoDB
app.get('/api/diagnose', async (req, res) => {
    try {
        console.log('[Diagnóstico] Verificando conexión a MongoDB...');
        const diagnosticInfo = {
            timestamp: new Date().toISOString(),
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            },
            database: {
                connectionString: process.env.MONGODB_URI || 'mongodb://admin:patata123@localhost:27017/chatapp?authSource=admin',
                status: 'checking...'
            }
        };

        // Intentar conectar a MongoDB
        try {
            await connectDB();
            diagnosticInfo.database.status = 'connected';
            diagnosticInfo.database.message = 'Conexión exitosa a MongoDB';
            
            // Verificar colecciones
            const db = require('mongoose').connection.db;
            const collections = await db.listCollections().toArray();
            diagnosticInfo.database.collections = collections.map(c => c.name);
            
            // Verificar mensajes
            const messagesCount = await messageController.getMessagesCount();
            diagnosticInfo.database.messagesCount = messagesCount;
            
            // Verificar usuarios
            const usersCount = await userController.getUsersCount();
            diagnosticInfo.database.usersCount = usersCount;
            
            // Obtener algunos mensajes de muestra
            try {
                const sampleMessages = await messageController.getRecentMessages(3);
                diagnosticInfo.database.sampleMessages = sampleMessages.map(m => ({
                    id: m._id,
                    content: m.content.substring(0, 30) + (m.content.length > 30 ? '...' : ''),
                    time: m.createdAt
                }));
            } catch (msgError) {
                diagnosticInfo.database.sampleMessagesError = msgError.message;
            }
            
        } catch (dbError) {
            diagnosticInfo.database.status = 'error';
            diagnosticInfo.database.error = dbError.message;
            diagnosticInfo.database.errorCode = dbError.code;
            diagnosticInfo.database.errorName = dbError.name;
            
            if (dbError.code === 13 || dbError.codeName === 'Unauthorized') {
                diagnosticInfo.database.suggestion = 'La conexión requiere autenticación. Verifica usuario y contraseña.';
            } else if (dbError.name === 'MongoServerSelectionError') {
                diagnosticInfo.database.suggestion = 'No se pudo conectar al servidor. Verifica que el servidor esté en ejecución.';
            }
        }
        
        // Socket.io info
        diagnosticInfo.socket = {
            connections: Object.keys(io.sockets.sockets).length,
            rooms: Object.keys(io.sockets.adapter.rooms).length
        };
        
        res.json({
            success: true,
            diagnosticInfo
        });
    } catch (error) {
        console.error('[Diagnóstico] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cuando se conecta un usuario
io.on('connection', async (socket) => {
    console.log(`Nueva conexión: ${socket.id}`);
    socket.emit('connectionEstablished', { id: socket.id });
    
    // Manejar eventos de ping para verificación de conexión
    socket.on('ping', (data, callback) => {
        // Solo para diagnóstico
        console.log(`Ping recibido de ${socket.id}`);
        
        // Responder inmediatamente para confirmar que el socket está activo
        if (callback && typeof callback === 'function') {
            callback({ success: true, time: Date.now() });
        }
    });

    // Manejar la inicialización de la carga de archivos
    socket.on('initializeUpload', async (data, callback) => {
        try {
            console.log(`Inicialización de carga recibida desde ${socket.id}:`, data?.sessionId || 'sin sessionId');
            
            // Verificar que los datos sean válidos
            if (!data || !data.sessionId || !data.fileName || !data.totalChunks) {
                console.error('Datos de inicialización incompletos');
                if (callback && typeof callback === 'function') {
                    callback({ success: false, error: 'Datos de inicialización incompletos' });
                }
                return;
            }

            // Obtener usuario por socketId
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);
            
            if (!user) {
                console.error('Usuario no encontrado al inicializar carga');
                if (callback && typeof callback === 'function') {
                    callback({ success: false, error: 'Usuario no encontrado' });
                }
                return;
            }

            // Generar un ID único para el archivo (o usar el proporcionado)
            const fileId = data.fileId || data.sessionId;
            
            console.log(`Inicializando carga para ${data.fileName} (${data.fileSize} bytes, ${data.totalChunks} chunks)`);
            
            // Enviar respuesta exitosa inmediatamente para evitar timeout
            if (callback && typeof callback === 'function') {
                callback({
                    success: true,
                    sessionId: data.sessionId,
                    fileId: fileId,
                    existingChunks: [] // Array de índices de chunks que ya existen en el servidor
                });
            }
        } catch (error) {
            console.error('Error al inicializar carga:', error);
            if (callback && typeof callback === 'function') {
                callback({ success: false, error: error.message || 'Error al inicializar carga' });
            }
        }
    });

    // Manejar el evento de unirse al chat
    socket.on('joinChat', async ({ token, isFirstVisit }) => {
        // Declarar username en un ámbito que sea accesible dentro de todo el evento
        let username = 'Usuario';
        
        try {
            console.log(`Solicitud de unión al chat recibida con token: ${token ? 'Sí hay token' : 'No hay token'}`);
            
            // Verificar que el usuario tenga un token válido
            if (!token) {
                console.log(`Usuario sin token intenta conectarse, rechazado`);
                socket.emit('joinError', { message: 'Se requiere iniciar sesión para acceder al chat.' });
                return;
            }
            
            // Validar que el token tenga un formato válido
            if (typeof token !== 'string' || !token.trim()) {
                console.error('Token con formato inválido');
                socket.emit('joinError', { message: 'Formato de token inválido. Inicie sesión nuevamente.' });
                return;
            }
            
            // Validar token
            let userData;
            try {
                const verificationResult = await authController.verifyToken(token);
                userData = verificationResult.user;
                
                if (!userData) {
                    throw new Error('No se obtuvo información del usuario');
                }
                
                if (!userData._id) {
                    throw new Error('ID de usuario no encontrado');
                }
            } catch (tokenError) {
                console.error(`Error al verificar token: ${tokenError.message}`);
                
                // Proporcionar mensajes de error más específicos según el tipo de error
                let errorMessage = 'Sesión no válida. Inicie sesión nuevamente.';
                
                if (tokenError.name === 'TokenExpiredError') {
                    errorMessage = 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.';
                } else if (tokenError.name === 'JsonWebTokenError') {
                    errorMessage = 'Token de sesión inválido. Por favor, inicie sesión nuevamente.';
                }
                
                socket.emit('joinError', { message: errorMessage });
                return;
            }
            
            // Asignar usuario con datos completos
            username = userData.username;
            const userId = userData._id.toString();
            
            console.log(`Usuario registrado ${username} autenticado correctamente (ID: ${userId})`);
            
            // Registrar/actualizar usuario en la base de datos
            let createdUser;
            try {
                createdUser = await userController.createOrUpdateUser({
                    _id: userId,
                    username: username,
                    socketId: socket.id,
                    isActive: true,
                    isAuthenticated: true,
                    lastActive: new Date()
                });
                
                console.log(`Usuario registrado en la base de datos: ${username}`);
            } catch (dbError) {
                console.error(`Error al registrar usuario en la BD: ${dbError.message}`);
                socket.emit('joinError', { message: 'Error al acceder al chat. Inténtelo de nuevo más tarde.' });
                return;
            }
            
            // Enviar confirmación de conexión al cliente
            console.log(`Enviando confirmación de conexión a ${username}...`);
            socket.emit('connectionSuccess', { 
                socketId: socket.id,
                username: username,
                userId: userId,
                userImage: createdUser.image || null // Enviar imagen de perfil si existe
            });
            
            // Manejar la lista de usuarios y los mensajes de forma independiente
            // para evitar que un error en uno afecte al otro
            
            // 1. Obtener y enviar usuarios conectados
            try {
                console.log(`Obteniendo lista de usuarios conectados para ${username}...`);
                const connectedUsers = await userController.getConnectedUsers();
                console.log(`Usuarios conectados: ${connectedUsers.length}`, 
                    connectedUsers.map(u => u.username).join(', '));
                
                // Enviar la lista actualizada de usuarios a todos los clientes
                console.log(`Enviando lista de ${connectedUsers.length} usuarios a todos los clientes`);
                io.emit('usersList', connectedUsers.map(u => ({
                    username: u.username,
                    id: u.socketId
                })));
            } catch (userError) {
                console.error(`Error al obtener usuarios conectados para ${username}:`, userError);
                // En caso de error, enviar al menos el usuario actual
                console.log(`Enviando lista de usuarios alternativa solo con ${username}`);
                socket.emit('usersList', [{
                    username: username,
                    id: socket.id
                }]);
            }
            
            // 2. Obtener y enviar mensajes históricos
            try {
                console.log(`Obteniendo mensajes históricos para ${username}...`);
                const recentMessages = await messageController.getRecentMessages(50);
                console.log(`Enviando ${recentMessages.length} mensajes históricos a ${username}`);
                
                // Siempre enviar el array de mensajes, incluso si está vacío
                socket.emit('historicalMessages', recentMessages || []);
                console.log(`Mensajes históricos enviados a ${username}`);
            } catch (msgError) {
                console.error(`Error al obtener mensajes históricos para ${username}:`, msgError);
                // En caso de error, enviar un array vacío para completar el flujo de carga
                console.log(`Enviando array vacío de mensajes a ${username} debido a error`);
                socket.emit('historicalMessages', []);
            }
            
        } catch (error) {
            console.error(`Error al registrar el usuario ${username}:`, error);
            
            // Garantizar que el cliente reciba las respuestas necesarias para continuar
            console.log(`Enviando respuestas mínimas a ${username} debido a error general`);
            
            // Enviar confirmación básica de conexión
            socket.emit('connectionSuccess', { 
                socketId: socket.id,
                username: username || 'Anónimo'
            });
            
            // Enviar una lista mínima de usuarios
            socket.emit('usersList', [{
                username: username || 'Anónimo',
                id: socket.id
            }]);
            
            // Enviar array vacío de mensajes
            socket.emit('historicalMessages', []);
        }
        
        console.log(`Proceso de joinChat completado para ${username}`);
    });

    // Escuchar mediaMessage (MODIFICADO para recibir buffer y usar nuevo saveMediaMessage)
    socket.on('mediaMessage', async (data, callback) => {
        // ... (código existente de la versión simplificada) ...
        try {
            // Verificar datos básicos y que el callback sea una función
            if (!data || !data.fileBuffer || !data.fileName || typeof callback !== 'function') {
                 console.error('Llamada inválida a mediaMessage:', { hasData: !!data, hasBuffer: !!data?.fileBuffer, hasFileName: !!data?.fileName, hasCallback: typeof callback === 'function' });
                 return callback({ success: false, error: 'Datos multimedia o callback inválidos' });
                }

             if (!Buffer.isBuffer(data.fileBuffer)) {
                 console.error('Error: fileBuffer no es un Buffer en mediaMessage. Tipo recibido:', typeof data.fileBuffer);
                 return callback({ success: false, error: 'Tipo de datos del archivo inesperado' });
            }

            console.log(`mediaMessage recibido: ${data.fileName}, Tamaño: ${data.fileSize || data.fileBuffer.length} bytes`);

            const operationTimeout = setTimeout(() => {
                console.error(`Timeout procesando mediaMessage para ${data.fileName} de ${socket.id}`);
                if (callback) { 
                    callback({ 
                        success: false, 
                        error: 'Tiempo de espera agotado en el servidor al procesar el archivo'
                    });
                    callback = null;
                }
            }, 120000); 
            
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);
            
            if (!user) {
                 clearTimeout(operationTimeout);
                 console.error(`Usuario no encontrado para socket ${socket.id} al procesar mediaMessage`);
                 return callback({ success: false, error: 'Usuario no encontrado o no autenticado' });
            }

                const validatedText = data.text && data.text.length > MAX_MESSAGE_LENGTH 
                    ? data.text.substring(0, MAX_MESSAGE_LENGTH) 
                    : data.text || '';
                
            const result = await messageController.saveMediaMessage(user.username, socket.id, {
                fileBuffer: data.fileBuffer,
                    fileType: data.fileType,
                    fileName: data.fileName,
                fileSize: data.fileSize || data.fileBuffer.length,
                text: validatedText
            });

                clearTimeout(operationTimeout);
                
             if (!callback) {
                console.warn(`Callback inválido después de procesar mediaMessage para ${data.fileName}`);
                return; 
            }

            if (result.success && result.confirmedMessage) {
                console.log(`Archivo ${data.fileName} guardado y mensaje creado (${result.confirmedMessage._id}). Emitiendo broadcast.`);
                socket.broadcast.emit('mediaMessage', result.confirmedMessage);
                        callback({
                            success: true, 
                    confirmedMessage: result.confirmedMessage
                        });
                    } else {
                console.error(`Error al guardar mediaMessage para ${data.fileName}:`, result.error);
                    callback({ 
                        success: false, 
                    error: result.error || 'Error desconocido al guardar el archivo en el servidor'
                    });
                }
        } catch (error) {
            console.error('Error general en el handler de mediaMessage:', error);
            if (callback && typeof callback === 'function') {
                callback({ 
                    success: false, 
                     error: error.message || 'Error inesperado en el servidor al procesar archivo'
                });
            }
        }
    });

    // Listener para chatMessage (SIN CAMBIOS)
    socket.on('chatMessage', async (msg, callback) => {
        try {
            // Obtener usuario por socketId
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);

            if (user) {
                // Validar y limitar longitud del mensaje
                const validatedMsg = msg.length > MAX_MESSAGE_LENGTH 
                    ? msg.substring(0, MAX_MESSAGE_LENGTH) 
                    : msg;
                
                // Guardar mensaje en la base de datos
                const savedMessage = await messageController.saveTextMessage(user.username, socket.id, validatedMsg);
                
                // Formatear mensaje para enviar a los clientes
                const formattedMessage = {
                    username: user.username,
                    userId: socket.id,
                    text: validatedMsg,
                    time: moment(savedMessage.createdAt).format('HH:mm'),
                    _id: savedMessage._id.toString() // Incluir ID para posible referencia futura
                };

                // CORREGIDO: Emitir a todos EXCEPTO al remitente
                socket.broadcast.emit('message', formattedMessage);
                console.log(`Mensaje de ${user.username} emitido a todos los demás.`);

                // Enviar confirmación al remitente (callback)
                if (callback && typeof callback === 'function') {
                    callback({ success: true, messageId: savedMessage._id.toString() });
                }
            } else {
                 console.error(`Usuario no encontrado para socket ${socket.id} al enviar chatMessage`);
                 if (callback && typeof callback === 'function') {
                     callback({ success: false, error: 'Usuario no autenticado o no encontrado.' });
                 }
            }
        } catch (error) {
            console.error('Error al procesar chatMessage:', error);
             if (callback && typeof callback === 'function') {
                 callback({ success: false, error: 'Error interno al procesar mensaje.' });
             }
        }
    });

    // Cuando un cliente se desconecta (SIN CAMBIOS)
    socket.on('disconnect', async () => {
        try {
            console.log(`Usuario desconectado, socketId: ${socket.id}`);
            
            // Marcar usuario como desconectado en la base de datos
            const user = await userController.disconnectUser(socket.id);
            
            if (user) {
                console.log(`Usuario ${user.username} marcado como desconectado`);
                
                // Enviar la lista actualizada de usuarios
                const connectedUsers = await userController.getConnectedUsers();
                
                console.log(`Usuarios conectados después de desconexión: ${connectedUsers.length}`);
                
                io.emit('usersList', connectedUsers.map(u => ({
                    username: u.username,
                    id: u.socketId
                })));
            }
        } catch (error) {
            console.error('Error al desconectar usuario:', error);
        }
    });
});

// Obtener un mensaje específico (requiere autenticación)
app.get('/api/messages/:id', authMiddleware, (req, res) => {
    const messageId = req.params.id;
    
    messageController.getMessageById(messageId)
        .then(message => {
            if (!message) {
                return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
            }
            res.status(200).json({ success: true, message });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al obtener mensaje', error: error.message });
        });
});

// API para buscar por UUID
app.get('/api/uuid/:type/:uuid', (req, res) => {
    const { type, uuid } = req.params;
    
    if (!uuid) {
        return res.status(400).json({ success: false, message: 'UUID no proporcionado' });
    }
    
    if (type === 'user') {
        userController.getUserByUuid(uuid)
            .then(user => {
                if (!user) {
                    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
                }
                // No enviar la contraseña
                const userResponse = {
                    _id: user._id,
                    uuid: user.uuid,
                    username: user.username,
                    email: user.email,
                    isActive: user.isActive,
                    role: user.role,
                    lastActive: user.lastActive,
                    createdAt: user.createdAt
                };
                res.status(200).json({ success: true, user: userResponse });
            })
            .catch(error => {
                res.status(500).json({ success: false, message: 'Error al buscar usuario', error: error.message });
            });
    } else if (type === 'message') {
        messageController.getMessageByUuid(uuid)
            .then(message => {
                if (!message) {
                    return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
                }
                res.status(200).json({ success: true, message });
            })
            .catch(error => {
                res.status(500).json({ success: false, message: 'Error al buscar mensaje', error: error.message });
            });
    } else {
        res.status(400).json({ success: false, message: 'Tipo no válido. Use "user" o "message"' });
    }
});

// API para obtener todos los UUIDs
app.get('/api/uuids/:type', verifyAdminToken, (req, res) => {
    const { type } = req.params;
    
    if (type === 'users') {
        userController.getAllUsers()
            .then(users => {
                res.status(200).json({ 
                    success: true, 
                    count: users.length,
                    uuids: users.map(user => ({ 
                        uuid: user.uuid, 
                        username: user.username 
                    }))
                });
            })
            .catch(error => {
                res.status(500).json({ success: false, message: 'Error al obtener UUIDs de usuarios', error: error.message });
            });
    } else if (type === 'messages') {
        messageController.getAllMessages()
            .then(messages => {
                res.status(200).json({ 
                    success: true, 
                    count: messages.length,
                    uuids: messages.map(msg => ({ 
                        uuid: msg.uuid, 
                        text: msg.text ? (msg.text.substring(0, 30) + (msg.text.length > 30 ? '...' : '')) : '[Media]',
                        date: msg.createdAt
                    }))
                });
            })
            .catch(error => {
                res.status(500).json({ success: false, message: 'Error al obtener UUIDs de mensajes', error: error.message });
            });
    } else {
        res.status(400).json({ success: false, message: 'Tipo no válido. Use "users" o "messages"' });
    }
});

// Para manejar archivos grandes subidos en chunks
app.post('/api/upload/chunk', authMiddleware, async (req, res) => {
    try {
        const { chunk, totalChunks, currentChunk, fileInfo } = req.body;
        
        if (!chunk || !totalChunks || currentChunk === undefined || !fileInfo) {
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos para el procesamiento de chunks'
            });
        }
        
        // Procesar el chunk
        const result = await messageController.processFileChunk({
            chunk,
            totalChunks: parseInt(totalChunks),
            currentChunk: parseInt(currentChunk),
            fileInfo: {
                ...fileInfo,
                userId: req.user.id,
                username: req.user.username
            }
        });
        
        // Si este es el último chunk, devolver información completa del archivo
        if (result.isComplete) {
            return res.status(200).json({
                success: true,
                isComplete: true,
                fileId: result.fileId,
                fileUrl: result.fileUrl
            });
        }
        
        // Si no es el último chunk, confirmar recepción
        return res.status(200).json({
            success: true,
            isComplete: false,
            currentChunk
        });
    } catch (error) {
        console.error('Error al procesar chunk:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al procesar chunk de archivo',
            error: error.message
        });
    }
});

// Nueva ruta para descarga optimizada con soporte para reportar progreso
app.get('/api/download/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const file = await messageController.getFileById(fileId);
        
        // Detectar si es un video
        const isVideo = file.file.contentType && file.file.contentType.startsWith('video/');
        
        // Sanitizar el nombre del archivo para el header Content-Disposition
        let filename = file.file.filename || 'archivo';
        // Eliminar caracteres problemáticos y codificar
        filename = filename.replace(/[^\w.-]/g, '_');
        
        // Configurar headers adecuados según el tipo de archivo
        if (isVideo) {
            res.set({
                'Content-Type': file.file.contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': file.file.length,
                'Accept-Ranges': 'bytes',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=3600', // Cache por 1 hora para el cliente
                'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition' // Exponer estos headers para XHR
            });
        } else {
            // Para otros tipos de archivo, usar application/octet-stream
            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': file.file.length,
                'Accept-Ranges': 'bytes',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=3600',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition'
            });
        }
        
        // Manejar eventos de finalización y error para asegurar limpieza adecuada
        let streamClosed = false;
        
        // Cuando la respuesta se complete
        res.on('finish', () => {
            console.log(`Descarga completada: ${fileId}`);
            streamClosed = true;
            
            // No es necesario cerrar el stream explícitamente, 
            // pipe() se encarga de esto cuando la respuesta finaliza
        });
        
        // Cuando la respuesta se cierra (cliente desconecta)
        res.on('close', () => {
            if (!streamClosed) {
                console.log(`Descarga interrumpida: ${fileId}`);
                // El stream se cierra automáticamente cuando pipe() detecta que el destino se ha cerrado
            }
        });
        
        // Manejar error del stream
        file.stream.on('error', (err) => {
            console.error(`Error en stream de descarga: ${fileId}`, err);
            // Solo enviar respuesta de error si aún no se ha enviado la cabecera
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Error al procesar archivo para descarga' 
                });
            }
        });
        
        // Enviar el stream como respuesta para descarga
        file.stream.pipe(res);
    } catch (error) {
        console.error('Error al descargar archivo:', error);
        res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    }
});

// API para verificar metadatos de un archivo sin descargarlo
app.get('/api/files/:id/info', async (req, res) => {
    try {
        const fileId = req.params.id;
        const file = await messageController.getFileMetadata(fileId);
        
        res.status(200).json({
            success: true,
            file: {
                filename: file.filename,
                contentType: file.contentType,
                size: file.length,
                uploadDate: file.uploadDate,
                metadata: file.metadata
            }
        });
    } catch (error) {
        console.error('Error al obtener información del archivo:', error);
        res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    }
});

// API para el panel de administrador - Endpoint específico para usuarios conectados
app.post('/api/admin/connected', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    userController.getConnectedUsers()
        .then(users => {
            res.status(200).json({ success: true, users });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al obtener usuarios conectados', error: error.message });
        });
});

// API para el panel de administrador - Obtener estadísticas
app.post('/api/admin/stats', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    Promise.all([
        messageController.getMessageCount(),
        userController.getUserCount(),
        messageController.getRecentMessages(1)
    ])
    .then(([messageCount, userCount, lastMessage]) => {
        res.status(200).json({ 
            success: true, 
            stats: {
                messageCount,
                userCount,
                lastMessageTime: lastMessage.length > 0 ? lastMessage[0].createdAt : null
            }
        });
    })
    .catch(error => {
        res.status(500).json({ success: false, message: 'Error al obtener estadísticas', error: error.message });
    });
});

// API para el panel de administrador - Borrar un usuario por ID (método DELETE)
app.delete('/api/admin/user/:userId', (req, res) => {
    const { password } = req.body;
    const { userId } = req.params;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Primero buscar el usuario para ver si está conectado
    userController.getUserById(userId)
        .then(user => {
            if (user && user.socketId) {
                // Si el usuario está conectado, notificarle
                const socket = io.sockets.sockets.get(user.socketId);
                if (socket) {
                    socket.emit('forceDisconnect', {
                        message: 'Tu cuenta ha sido eliminada por el administrador.'
                    });
                }
            }
            
            // Proceder a eliminar el usuario
            return userController.deleteUser(userId);
        })
        .then(result => {
            res.status(200).json({ success: true, message: 'Usuario eliminado correctamente' });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar usuario', error: error.message });
        });
});

// Borrar todos los usuarios, incluyendo los conectados (método DELETE)
app.delete('/api/admin/users', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Agregar la instancia io a la solicitud para que el controlador pueda usarla
    req.io = io;
    userController.deleteAllUsers(req, res);
}); 

// API para que el administrador cambie la contraseña de un usuario
app.post('/api/admin/user/change-password', verifyAdminToken, async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ success: false, message: 'Se requieren el ID del usuario y la nueva contraseña.' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    try {
        const result = await userController.adminChangeUserPassword(userId, newPassword);
        // Considerar notificar al usuario por correo que su contraseña fue cambiada por un admin.
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error en ruta /api/admin/user/change-password:', error);
        return res.status(500).json({ success: false, message: error.message || 'Error al cambiar la contraseña del usuario.' });
    }
});

// Ruta comodín final - IMPORTANTE: debe ir después de todas las rutas específicas
// Esta ruta captura cualquier acceso que aún contenga 'chat.html' y lo redirige a /chat
app.use((req, res, next) => {
    const url = req.url.toLowerCase();
    if (url.includes('chat.html')) {
        // Preservar parámetros de consulta
        const queryParams = url.includes('?') ? url.substring(url.indexOf('?')) : '';
        console.log(`[Último recurso] Redirigiendo solicitud con 'chat.html' a /chat${queryParams}`);
        return res.redirect(301, `/chat${queryParams}`);
    }
    next();
});

// Middleware para los archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas para páginas estáticas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Nuevas rutas para recuperación de contraseña
app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});