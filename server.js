const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const moment = require('moment');

// Conexión a MongoDB
const connectDB = require('./db/connection');
const { userController, messageController } = require('./db/controllers');

// Configuración
const MAX_MESSAGE_LENGTH = 200; // Límite de caracteres para mensajes
const ADMIN_PASSWORD = "patatata123"; // Contraseña de administrador

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    maxHttpBufferSize: 200e6 // Aumentar a 200 MB para permitir archivos multimedia más grandes
});

// Configurar middleware para analizar JSON
app.use(express.json());

// Conectar a MongoDB
connectDB().then(() => {
    console.log('MongoDB conectado correctamente');
}).catch(err => {
    console.error('Error al conectar MongoDB:', err);
});

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
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.status(200).json({ success: true, message: 'Acceso correcto' });
    } else {
        res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
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
app.post('/api/admin/users/delete-all-including-connected', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    
    // Obtener la lista de usuarios conectados antes de borrarlos
    userController.getConnectedUsers()
        .then(connectedUsers => {
            // Almacenamos los socketIds de los usuarios conectados
            const connectedSocketIds = connectedUsers.map(user => user.socketId);
            
            // Borrar todos los usuarios de la base de datos
            return userController.deleteAllUsers()
                .then(result => {
                    const count = result.deletedCount || 0;
                    
                    // Emitir evento de desconexión forzada a todos los usuarios conectados
                    connectedSocketIds.forEach(socketId => {
                        const socket = io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('forceDisconnect', {
                                message: 'Tu cuenta ha sido eliminada por el administrador.'
                            });
                        }
                    });
                    
                    res.status(200).json({ 
                        success: true, 
                        message: `${count} usuarios eliminados correctamente (incluyendo ${connectedSocketIds.length} conectados)` 
                    });
                });
        })
        .catch(error => {
            res.status(500).json({ success: false, message: 'Error al eliminar usuarios', error: error.message });
        });
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

// Ejecutar cuando un cliente se conecta
io.on('connection', async socket => {
    console.log('Nueva conexión de WebSocket...');

    // Usuario se une al chat
    socket.on('joinChat', async ({ username, isFirstVisit }) => {
        console.log(`[${new Date().toISOString()}] Usuario uniéndose al chat: ${username}, socketId: ${socket.id}, isFirstVisit: ${isFirstVisit}`);
        
        // Validar la longitud del nombre de usuario
        if (!username || username.length > 15) {
            console.log(`Nombre de usuario inválido: "${username}" - demasiado largo o vacío`);
            socket.emit('joinError', {
                message: 'El nombre de usuario debe tener entre 3 y 15 caracteres'
            });
            return;
        }
        
        // Remover timestamps del nombre de usuario si es una reconexión
        let cleanUsername = username;
        if (username && username.includes('_')) {
            const parts = username.split('_');
            const lastPart = parts[parts.length - 1];
            
            // Si la última parte es un número (timestamp), usar solo el nombre original
            if (!isNaN(lastPart) && lastPart.length > 5) {
                cleanUsername = parts.slice(0, -1).join('_');
                console.log(`Detectado nombre con timestamp: ${username}, usando nombre limpio: ${cleanUsername}`);
            }
        }
        
        try {
            // Registrar o actualizar el usuario en la base de datos
            console.log(`Intentando registrar/actualizar usuario ${cleanUsername} en la base de datos...`);
            const user = await userController.connectUser(cleanUsername || 'Anónimo', socket.id);
            console.log(`Usuario registrado exitosamente: ${user.username}, ID: ${user._id}`);
            
            // Enviar confirmación de conexión al cliente
            console.log(`Enviando confirmación de conexión a ${user.username}...`);
            socket.emit('connectionSuccess', { 
                socketId: socket.id,
                username: user.username,
                userId: user._id
            });
            
            // Manejar la lista de usuarios y los mensajes de forma independiente
            // para evitar que un error en uno afecte al otro
            
            // 1. Obtener y enviar usuarios conectados
            try {
                console.log(`Obteniendo lista de usuarios conectados para ${user.username}...`);
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
                console.error(`Error al obtener usuarios conectados para ${user.username}:`, userError);
                // En caso de error, enviar al menos el usuario actual
                console.log(`Enviando lista de usuarios alternativa solo con ${user.username}`);
                socket.emit('usersList', [{
                    username: user.username || 'Anónimo',
                    id: socket.id
                }]);
            }
            
            // 2. Obtener y enviar mensajes históricos
            try {
                console.log(`Obteniendo mensajes históricos para ${user.username}...`);
                const recentMessages = await messageController.getRecentMessages(50);
                console.log(`Enviando ${recentMessages.length} mensajes históricos a ${user.username}`);
                
                // Siempre enviar el array de mensajes, incluso si está vacío
                socket.emit('historicalMessages', recentMessages || []);
                console.log(`Mensajes históricos enviados a ${user.username}`);
            } catch (msgError) {
                console.error(`Error al obtener mensajes históricos para ${user.username}:`, msgError);
                // En caso de error, enviar un array vacío para completar el flujo de carga
                console.log(`Enviando array vacío de mensajes a ${user.username} debido a error`);
                socket.emit('historicalMessages', []);
            }
            
        } catch (error) {
            console.error(`Error al registrar el usuario ${cleanUsername}:`, error);
            
            // Garantizar que el cliente reciba las respuestas necesarias para continuar
            console.log(`Enviando respuestas mínimas a ${cleanUsername} debido a error general`);
            
            // Enviar confirmación básica de conexión
            socket.emit('connectionSuccess', { 
                socketId: socket.id,
                username: cleanUsername || 'Anónimo'
            });
            
            // Enviar una lista mínima de usuarios
            socket.emit('usersList', [{
                username: cleanUsername || 'Anónimo',
                id: socket.id
            }]);
            
            // Enviar array vacío de mensajes
            socket.emit('historicalMessages', []);
        }
        
        console.log(`Proceso de joinChat completado para ${cleanUsername}`);
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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Servidor ejecutándose en puerto ${PORT}`)); 