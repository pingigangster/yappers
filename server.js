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
const io = socketio(server, {
    maxHttpBufferSize: 200e6, // Aumentar a 200 MB para permitir archivos multimedia más grandes
    pingTimeout: 60000, // Aumentar el tiempo de espera para detectar desconexiones (60 segundos)
    cors: {
        origin: "*",
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
    try {
        let token = null;
        
        // Intentar obtener el token de las cookies
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }
        // Si no está en las cookies, buscar en el header Authorization
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            console.log('Acceso denegado: No se encontró token');
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
connectWithRetry().then(connected => {
    if (!connected) {
        console.warn('La aplicación continuará funcionando sin persistencia de datos');
    }
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
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    
    console.log('Cookie de sesión eliminada');
    return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
});

app.get('/api/auth/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const result = await authController.verifyEmail(token);
        
        return res.status(200).json({ success: true, user: result });
    } catch (error) {
        console.error('Error al verificar email:', error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email es obligatorio' });
        }
        
        const token = await authController.forgotPassword(email);
        
        // Aquí se enviaría un email con el enlace para restablecer contraseña
        // Por ahora, solo devolvemos el token
        return res.status(200).json({ 
            success: true, 
            message: 'Se ha enviado un email con instrucciones',
            token // Solo para desarrollo
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
    passport.authenticate('google', { 
        failureRedirect: '/login.html',
        session: false
    }),
    async (req, res) => {
        try {
            // req.user contiene el usuario autenticado por Google
            const loginResult = await authController.loginWithGoogle(req.user);
            
            // Establecer cookie con el token JWT
            res.cookie('token', loginResult.token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
                secure: process.env.NODE_ENV === 'production'
            });
            
            // Redirigir a la página de chat con el token como parámetro de URL
            res.redirect(`/chat.html?token=${loginResult.token}`);
        } catch (error) {
            console.error('Error en callback de Google:', error);
            res.redirect('/login.html?error=google_auth');
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

// Configurar carpeta estática
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para servir archivos almacenados en GridFS
app.get('/api/files/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const file = await messageController.getFileById(fileId);
        
        // Configurar headers de respuesta
        res.set('Content-Type', file.file.contentType);
        res.set('Content-Disposition', `inline; filename="${file.file.filename}"`);
        
        // Enviar el stream como respuesta
        file.stream.pipe(res);
    } catch (error) {
        console.error('Error al obtener archivo:', error);
        res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    }
});

// Rutas para el panel de administrador
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API para el panel de administrador
app.post('/api/admin/login', async (req, res) => {
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

// Obtener todos los usuarios (requiere autenticación)
app.post('/api/admin/users', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    userController.getAllUsers()
        .then(users => {
            res.status(200).json({ success: true, users });
        })
        .catch(error => {
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
app.post('/api/admin/users/delete-all-including-connected', verifyAdminToken, (req, res) => {
    // Agregar la instancia io a la solicitud para que el controlador pueda usarla
    req.io = io;
    userController.deleteAllUsers(req, res);
});

// Borrar solo los usuarios anónimos (requiere autenticación)
app.post('/api/admin/users/delete-anonymous', verifyAdminToken, (req, res) => {
    // Agregar la instancia io a la solicitud para que el controlador pueda usarla
    req.io = io;
    userController.deleteAnonymousUsers(req, res);
});

// Borrar todos los mensajes (requiere autenticación)
app.post('/api/admin/messages/delete-all', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    messageController.deleteAllMessages()
        .then(result => {
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
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    messageController.getRecentMessages(limit)
        .then(messages => {
            res.status(200).json({ success: true, messages });
        })
        .catch(error => {
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
                connectionString: process.env.MONGODB_URI || 'mongodb://pingadominga.es:27017/chatapp',
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
                    lastActive: new Date(),
                    emailVerified: userData.emailVerified || false
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
                isAuthenticated: !!userData.emailVerified, // Indicar si es un usuario verificado
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

    // Escuchar chatMessage (mensaje de texto)
    socket.on('chatMessage', async msg => {
        try {
            // Obtener usuario por socketId
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);
            
            if (user) {
                // Validar longitud del mensaje
                const validatedMsg = msg.length > MAX_MESSAGE_LENGTH 
                    ? msg.substring(0, MAX_MESSAGE_LENGTH) 
                    : msg;
                
                // Guardar mensaje en la base de datos
                const savedMessage = await messageController.saveTextMessage(user.username, socket.id, validatedMsg);
                
                // Emitir mensaje a todos los clientes
                io.emit('message', {
                    username: user.username,
                    userId: socket.id,  // Mantenemos socket.id para consistencia
                    text: validatedMsg,
                    time: moment(savedMessage.createdAt).format('HH:mm')
                });
            }
        } catch (error) {
            console.error('Error al procesar mensaje de texto:', error);
        }
    });

    // Escuchar mediaMessage (mensaje con archivo multimedia)
    socket.on('mediaMessage', async (data, callback) => {
        try {
            // Verificar que los datos son válidos
            if (!data || !data.media) {
                if (callback && typeof callback === 'function') {
                    callback({ success: false, error: 'Datos multimedia no proporcionados' });
                }
                return;
            }

            // Establecer un timeout para la operación
            const operationTimeout = setTimeout(() => {
                // Si el callback todavía existe, enviar respuesta de timeout
                if (callback && typeof callback === 'function') {
                    callback({ 
                        success: false, 
                        error: 'Tiempo de espera agotado en el servidor al procesar el archivo multimedia' 
                    });
                    // Invalidar el callback para que no se llame dos veces
                    callback = null;
                }
            }, 60000); // 60 segundos de timeout
            
            // Obtener usuario por socketId
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);
            
            if (user) {
                // Validar longitud del texto asociado al archivo
                const validatedText = data.text && data.text.length > MAX_MESSAGE_LENGTH 
                    ? data.text.substring(0, MAX_MESSAGE_LENGTH) 
                    : data.text || '';
                
                // Preparar datos del mensaje
                const messageData = {
                    text: validatedText,
                    media: data.media,
                    fileType: data.fileType,
                    fileName: data.fileName,
                    fileSize: data.fileSize
                };
                
                try {
                    // Guardar mensaje multimedia en la base de datos
                    const savedMessage = await messageController.saveMediaMessage(user.username, socket.id, messageData);
                    
                    // Cancelar el timeout ya que la operación completó exitosamente
                    clearTimeout(operationTimeout);
                
                    // Emitir mensaje a todos los clientes
                    io.emit('mediaMessage', {
                        username: user.username,
                        userId: socket.id,  // Mantenemos socket.id para consistencia
                        time: moment(savedMessage.createdAt).format('HH:mm'),
                        ...messageData
                    });
                    
                    // Enviar respuesta al cliente que subió el archivo
                    if (callback && typeof callback === 'function') {
                        callback({ success: true });
                    }
                } catch (error) {
                    // Cancelar el timeout ya que tenemos un error
                    clearTimeout(operationTimeout);
                    
                    console.error('Error al guardar mensaje multimedia:', error);
                    
                    // Enviar error al cliente
                    if (callback && typeof callback === 'function') {
                        callback({ 
                            success: false, 
                            error: error.message || 'Error al guardar mensaje multimedia'
                        });
                    }
                }
            } else {
                // Cancelar el timeout ya que tenemos un error
                clearTimeout(operationTimeout);
                
                // Usuario no encontrado
                if (callback && typeof callback === 'function') {
                    callback({ success: false, error: 'Usuario no encontrado' });
                }
            }
        } catch (error) {
            console.error('Error general al procesar mensaje multimedia:', error);
            
            // Enviar error al cliente si el callback es válido
            if (callback && typeof callback === 'function') {
                callback({ 
                    success: false, 
                    error: error.message || 'Error inesperado al procesar mensaje multimedia'
                });
            }
        }
    });

    // Manejar subida de archivos por fragmentos (chunks)
    socket.on('chunkUpload', async (data, callback) => {
        try {
            // Verificar que los datos son válidos
            if (!data || !data.chunkData) {
                callback({ success: false, error: 'Datos del fragmento no proporcionados' });
                return;
            }

            // Establecer un timeout para la operación
            const operationTimeout = setTimeout(() => {
                // Si el callback todavía existe, enviar respuesta de timeout
                if (callback && typeof callback === 'function') {
                    callback({ 
                        success: false, 
                        error: 'Tiempo de espera agotado en el servidor al procesar el fragmento' 
                    });
                    // Invalidar el callback para que no se llame dos veces
                    callback = null;
                }
            }, 60000); // 60 segundos de timeout

            // Obtener usuario por socketId
            const users = await userController.getConnectedUsers();
            const user = users.find(u => u.socketId === socket.id);
            
            if (!user) {
                clearTimeout(operationTimeout);
                callback({ success: false, error: 'Usuario no encontrado' });
                return;
            }
            
            // Validar longitud del texto asociado al archivo (solo para el primer fragmento)
            const validatedText = data.text && data.text.length > MAX_MESSAGE_LENGTH 
                ? data.text.substring(0, MAX_MESSAGE_LENGTH) 
                : data.text || '';
            
            // Iniciar procesamiento asíncrono del fragmento
            const processPromise = messageController.processFileChunk({
                username: user.username,
                userId: socket.id,
                chunkData: data.chunkData,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize,
                text: validatedText,
                currentChunk: data.currentChunk,
                totalChunks: data.totalChunks,
                isLastChunk: data.isLastChunk,
                fileId: data.fileId
            });
            
            // Manejar resultado o error
            processPromise.then(processedChunk => {
                // Cancelar el timeout ya que la operación completó exitosamente
                clearTimeout(operationTimeout);
                
                // Verificar que el callback todavía sea válido
                if (callback && typeof callback === 'function') {
                    // Respuesta al cliente que subió el fragmento
                    if (data.isLastChunk) {
                        // Si es el último fragmento, emitir el mensaje completo a todos los clientes
                        io.emit('mediaMessage', {
                            username: user.username,
                            userId: socket.id,
                            time: moment().format('HH:mm'),
                            text: validatedText,
                            media: processedChunk.mediaUrl,
                            fileType: data.fileType,
                            fileName: data.fileName,
                            fileSize: data.fileSize,
                            isLargeFile: true,
                            mediaId: processedChunk.fileId
                        });
                    }
                    
                    callback({ 
                        success: true, 
                        fileId: processedChunk.fileId,
                        chunkProcessed: data.currentChunk + 1,
                        totalChunks: data.totalChunks
                    });
                }
            }).catch(error => {
                // Cancelar el timeout ya que tenemos un error
                clearTimeout(operationTimeout);
                
                console.error('Error al procesar fragmento de archivo:', error);
                
                // Verificar que el callback todavía sea válido
                if (callback && typeof callback === 'function') {
                    // Enviar error al cliente
                    callback({ 
                        success: false, 
                        error: error.message || 'Error al procesar fragmento de archivo'
                    });
                }
            });
            
        } catch (error) {
            console.error('Error general al procesar fragmento de archivo:', error);
            // Enviar error al cliente si el callback es válido
            if (callback && typeof callback === 'function') {
                callback({ 
                    success: false, 
                    error: error.message || 'Error inesperado al procesar fragmento'
                });
            }
        }
    });

    // Cuando un cliente se desconecta
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
                    emailVerified: user.emailVerified,
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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Servidor ejecutándose en puerto ${PORT}`)); 