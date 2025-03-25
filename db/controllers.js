const User = require('./models/User');
const Message = require('./models/Message');
const mongoose = require('mongoose');
const Grid = require('gridfs-stream');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Configuración de JWT
const JWT_SECRET = 'chat_app_secret_key_2023'; // Idealmente esto debería estar en variables de entorno
const JWT_EXPIRES_IN = '7d'; // Token válido por 7 días

// Configurar GridFS
let gfs;
let gridFSBucket;
mongoose.connection.once('open', () => {
    try {
        // Inicializar GridFSBucket
        gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });
        
        // Inicializar grid-fs-stream de manera compatible con MongoDB 4+
        // Esta línea es la que causa problemas: gfs = Grid(mongoose.connection.db, mongoose.mongo);
        // En lugar de eso, usamos una versión más compatible:
        gfs = {
            files: mongoose.connection.db.collection('uploads.files'),
            chunks: mongoose.connection.db.collection('uploads.chunks')
        };
        
        console.log('GridFS configurado correctamente');
    } catch (error) {
        console.error('Error al configurar GridFS:', error);
    }
});

// Formatear la fecha y hora
const formatTime = () => {
    const now = new Date();
    return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// Sistema de archivos temporal para almacenar chunks
const tempChunksStorage = new Map();

// Controladores para autenticación
const authController = {
    // Registrar un nuevo usuario
    async register(userData) {
        try {
            const { username, email, password } = userData;
            
            // Verificar si el email ya existe
            const emailExists = await User.findOne({ email: email.toLowerCase() });
            if (emailExists) {
                throw new Error('Este email ya está registrado');
            }
            
            // Verificar si el usuario ya existe
            const usernameExists = await User.findOne({ username });
            if (usernameExists) {
                throw new Error('Este nombre de usuario ya está en uso');
            }
            
            // Crear nuevo usuario
            const user = new User({
                username,
                email: email.toLowerCase(),
                password,
                emailVerified: true, // Por defecto, todos los usuarios ahora están verificados
                role: 'user'
            });
            
            await user.save();
            
            // Crear token JWT para enviar al cliente
            const token = jwt.sign(
                { id: user._id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );
            
            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token
            };
        } catch (error) {
            console.error(`Error al registrar usuario: ${error}`);
            throw error;
        }
    },
    
    // Iniciar sesión
    async login(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Email y contraseña son obligatorios');
            }

            // Buscar el usuario por email (case insensitive)
            const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
            
            if (!user) {
                console.log(`Intento de login fallido: usuario con email ${email} no encontrado`);
                throw new Error('Credenciales inválidas');
            }
            
            // Verificar contraseña
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (!isMatch) {
                console.log(`Intento de login fallido: contraseña incorrecta para ${email}`);
                throw new Error('Credenciales inválidas');
            }
            
            // Generar JWT
            const payload = {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role
            };
            
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            
            console.log(`Usuario ${user.username} (${user._id}) ha iniciado sesión correctamente`);
            console.log(`Token JWT generado correctamente (formato: ${token.split('.').length} partes)`);
            
            return {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            };
        } catch (error) {
            console.error(`Error al iniciar sesión: ${error}`);
            throw error;
        }
    },
    
    // Solicitar restablecimiento de contraseña
    async forgotPassword(email) {
        try {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) {
                throw new Error('No existe un usuario con este email');
            }
            
            // Generar token de restablecimiento
            const resetToken = crypto.randomBytes(20).toString('hex');
            user.passwordResetToken = resetToken;
            user.passwordResetExpires = Date.now() + 3600000; // 1 hora
            await user.save();
            
            return resetToken;
        } catch (error) {
            console.error(`Error al solicitar restablecimiento de contraseña: ${error}`);
            throw error;
        }
    },
    
    // Restablecer contraseña
    async resetPassword(token, newPassword) {
        try {
            const user = await User.findOne({
                passwordResetToken: token,
                passwordResetExpires: { $gt: Date.now() }
            });
            
            if (!user) {
                throw new Error('Token inválido o expirado');
            }
            
            user.password = newPassword;
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save();
            
            return {
                message: 'Contraseña restablecida correctamente'
            };
        } catch (error) {
            console.error(`Error al restablecer contraseña: ${error}`);
            throw error;
        }
    },
    
    // Verificar token JWT
    async verifyToken(token) {
        try {
            if (!token) {
                throw new Error('Token no proporcionado');
            }
            
            console.log(`Verificando JWT, formato: ${token.split('.').length} partes`);
            
            // Intentar decodificar el token
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (jwtError) {
                console.error(`Error JWT: ${jwtError.name} - ${jwtError.message}`);
                throw jwtError;
            }
            
            // Verificar que el token contiene un ID de usuario
            if (!decoded || !decoded.id) {
                console.error('Token sin ID de usuario:', decoded);
                throw new Error('Token inválido: sin ID de usuario');
            }
            
            // Buscar el usuario correspondiente
            const user = await User.findById(decoded.id);
            
            if (!user) {
                console.error(`Usuario no encontrado para ID: ${decoded.id}`);
                throw new Error('Usuario no encontrado');
            }
            
            console.log(`Verificación exitosa para usuario: ${user.username} (${user._id})`);
            
            return {
                user: {
                    _id: user._id,
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            };
        } catch (error) {
            console.error(`Error al verificar token: ${error}`);
            throw error;
        }
    },
    
    // Iniciar sesión con Google (generar token JWT)
    async loginWithGoogle(user) {
        try {
            if (!user || !user._id) {
                throw new Error('Datos de usuario de Google inválidos');
            }
            
            console.log(`Generando token JWT para usuario de Google: ${user.username}`);
            
            // Generar JWT
            const payload = {
                id: user._id,
                username: user.username,
                email: user.email,
                googleId: user.googleId,
                role: user.role
            };
            
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            
            console.log(`Login exitoso para usuario de Google ${user.username} (${user._id})`);
            
            return {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    image: user.image
                }
            };
        } catch (error) {
            console.error(`Error al iniciar sesión con Google: ${error}`);
            throw error;
        }
    }
};

// Controladores para usuarios
const userController = {
    // Crear o actualizar usuario en la base de datos
    async createOrUpdateUser(userData) {
        try {
            // Esta función solo debe usarse para usuarios registrados
            if (!userData._id) {
                throw new Error('Se requiere ID de usuario para la conexión');
            }
            
            // Actualizar usuario existente
            const user = await User.findByIdAndUpdate(
                userData._id,
                {
                    socketId: userData.socketId,
                    isActive: userData.isActive || true,
                    lastActive: new Date(),
                    ...userData
                },
                { new: true, upsert: false }
            );
            
            if (!user) {
                throw new Error('Usuario no encontrado');
            }
            
            console.log(`Usuario actualizado correctamente: ${userData.username}`);
            return user;
        } catch (error) {
            console.error(`Error al crear/actualizar usuario: ${error}`);
            throw error;
        }
    },
    
    // Obtener todos los usuarios conectados
    async getConnectedUsers() {
        try {
            return await User.find({ 
                socketId: { $ne: null },
                isActive: true
            });
        } catch (error) {
            console.error(`Error al obtener usuarios conectados: ${error}`);
            throw error;
        }
    },
    
    // Desconectar usuario
    async disconnectUser(socketId) {
        try {
            const user = await User.findOne({ socketId });
            if (user) {
                user.socketId = null;
                user.lastActive = new Date();
                await user.save();
                return user;
            }
            return null;
        } catch (error) {
            console.error(`Error al desconectar usuario: ${error}`);
            throw error;
        }
    },
    
    // NUEVAS FUNCIONES PARA ADMINISTRADOR
    
    // Obtener todos los usuarios (conectados y desconectados)
    async getAllUsers() {
        try {
            return await User.find({}).sort({ username: 1 });
        } catch (error) {
            console.error(`Error al obtener todos los usuarios: ${error}`);
            throw error;
        }
    },
    
    // Obtener un usuario por su ID
    async getUserById(userId) {
        try {
            const user = await User.findById(userId);
            return user;
        } catch (error) {
            console.error(`Error al obtener usuario por ID: ${error}`);
            throw error;
        }
    },
    
    // Obtener un usuario por su UUID
    async getUserByUuid(uuid) {
        try {
            const user = await User.findOne({ uuid });
            return user;
        } catch (error) {
            console.error(`Error al obtener usuario por UUID: ${error}`);
            throw error;
        }
    },
    
    // Buscar usuario por su Google ID
    async findUserByGoogleId(googleId) {
        try {
            console.log(`Buscando usuario con googleId: ${googleId}`);
            const user = await User.findOne({ googleId });
            console.log(`Usuario encontrado: ${user ? user.username : 'No encontrado'}`);
            return user;
        } catch (error) {
            console.error(`Error al buscar usuario por Google ID: ${error}`);
            throw error;
        }
    },
    
    // Eliminar un usuario por ID
    async deleteUser(userId) {
        try {
            const result = await User.findByIdAndDelete(userId);
            return result;
        } catch (error) {
            console.error(`Error al eliminar usuario: ${error}`);
            throw error;
        }
    },
    
    // Eliminar todos los usuarios, conectados y desconectados
    async deleteAllUsers(req, res) {
        try {
            console.log('Borrando todos los usuarios (conectados y desconectados)...');
            
            // Obtener la lista de usuarios conectados antes de borrarlos
            const connectedUsers = await User.find({ 
                socketId: { $ne: null },
                isActive: true
            });
            
            // Almacenamos los socketIds de los usuarios conectados
            const connectedSocketIds = connectedUsers.map(user => user.socketId);
            
            // Borrar todos los usuarios de la base de datos
            const result = await User.deleteMany({});
            console.log(`${result.deletedCount} usuarios eliminados en total.`);
            
            // Emitir evento de desconexión forzada a todos los usuarios conectados
            connectedSocketIds.forEach(socketId => {
                const socket = req.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('forceDisconnect', {
                        message: 'Tu cuenta ha sido eliminada por el administrador.'
                    });
                }
            });
            
            res.status(200).json({ 
                success: true, 
                message: `${result.deletedCount} usuarios eliminados correctamente (incluyendo ${connectedSocketIds.length} conectados)` 
            });
        } catch (error) {
            console.error(`Error al eliminar todos los usuarios: ${error}`);
            res.status(500).json({ success: false, message: 'Error al eliminar usuarios', error: error.message });
        }
    },
    
    // Obtener el número total de usuarios
    async getUserCount() {
        try {
            return await User.countDocuments({});
        } catch (error) {
            console.error(`Error al contar usuarios: ${error}`);
            throw error;
        }
    },
    
    // Crear usuario autenticado con Google
    async createGoogleUser(userData) {
        try {
            console.log('Creando nuevo usuario de Google:', userData.username);
            
            // Verificar si el email ya existe
            if (userData.email) {
                const emailExists = await User.findOne({ email: userData.email.toLowerCase() });
                if (emailExists) {
                    // Si el usuario existe pero no tiene googleId, actualizar
                    if (!emailExists.googleId) {
                        console.log(`Usuario existente ${emailExists.username} actualizado con Google ID`);
                        emailExists.googleId = userData.googleId;
                        if (userData.image) emailExists.image = userData.image;
                        await emailExists.save();
                        return emailExists;
                    }
                    return emailExists;
                }
            }
            
            // Verificar si el nombre de usuario ya existe
            let username = userData.username;
            let counter = 1;
            let usernameExists = await User.findOne({ username });
            
            // Si el nombre de usuario existe, añadir un número al final
            while (usernameExists) {
                username = `${userData.username}${counter}`;
                counter++;
                usernameExists = await User.findOne({ username });
            }
            
            // Crear nuevo usuario
            const newUser = new User({
                username,
                email: userData.email ? userData.email.toLowerCase() : null,
                password: userData.password, // Ya debe venir encriptada o ser aleatoria
                googleId: userData.googleId,
                image: userData.image,
                emailVerified: true,
                role: 'user'
            });
            
            await newUser.save();
            console.log(`Nuevo usuario de Google creado: ${newUser.username}`);
            return newUser;
        } catch (error) {
            console.error(`Error al crear usuario de Google: ${error}`);
            throw error;
        }
    },
};

// Controladores para mensajes
const messageController = {
    // Guardar un mensaje de texto
    async saveTextMessage(username, userId, text) {
        try {
            const message = new Message({
                text,
                username,
                userId,
                time: formatTime(),
                createdAt: new Date()
            });
            
            await message.save();
            return message;
        } catch (error) {
            console.error(`Error al guardar mensaje de texto: ${error}`);
            throw error;
        }
    },
    
    // Guardar un mensaje con archivo multimedia
    async saveMediaMessage(username, userId, messageData) {
        try {
            // Verificar si es un video
            const isVideo = messageData.fileType === 'video';
            if (isVideo) {
                console.log(`Procesando video: ${messageData.fileName}, tamaño: ${messageData.fileSize} bytes`);
            }
            
            // Guardar siempre en GridFS para mejor manejo de archivos grandes
            let mediaId = null;
            let mediaUrl = null;
            
            if (messageData.media) {
                // Extraer datos base64 y convertir a buffer
                const matches = messageData.media.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    
                    // Crear un ID único para el archivo
                    const fileId = new mongoose.Types.ObjectId();
                    
                    try {
                        // Verificar que gridFSBucket esté disponible
                        if (!gridFSBucket) {
                            throw new Error('GridFSBucket no está inicializado');
                        }
                        
                        // Usar GridFSBucket en lugar de gfs.createWriteStream
                        const metadata = {
                            username,
                            userId,
                            messageTime: formatTime(),
                            originalName: messageData.fileName,
                            fileType: messageData.fileType
                        };
                        
                        // Determinar el contentType correcto para videos
                        let contentType = mimeType;
                        if (isVideo && !contentType.startsWith('video/')) {
                            // Si es un video pero el contentType no lo refleja, corregirlo
                            console.log(`Corrigiendo contentType para video: ${contentType}`);
                            const ext = messageData.fileName.split('.').pop().toLowerCase();
                            switch (ext) {
                                case 'mp4': contentType = 'video/mp4'; break;
                                case 'webm': contentType = 'video/webm'; break;
                                case 'ogg': contentType = 'video/ogg'; break;
                                case 'mov': contentType = 'video/quicktime'; break;
                                case 'avi': contentType = 'video/x-msvideo'; break;
                                case 'wmv': contentType = 'video/x-ms-wmv'; break;
                                case 'flv': contentType = 'video/x-flv'; break;
                                case 'mkv': contentType = 'video/x-matroska'; break;
                                case '3gp': contentType = 'video/3gpp'; break;
                                default: contentType = 'video/mp4'; // Valor predeterminado
                            }
                            console.log(`Nuevo contentType: ${contentType}`);
                        }
                        
                        const uploadStream = gridFSBucket.openUploadStreamWithId(fileId, 
                            messageData.fileName || `file_${Date.now()}`, {
                            contentType: contentType,
                            metadata: metadata
                        });
                        
                        // Usar promisify para convertir el flujo en una promesa
                        const stream = require('stream');
                        const pipeline = require('util').promisify(stream.pipeline);
                        
                        // Crear un readable stream desde el buffer
                        const readableStream = new stream.Readable();
                        readableStream.push(buffer);
                        readableStream.push(null); // Indicar fin del stream
                        
                        // Procesar el stream
                        await pipeline(readableStream, uploadStream);
                        
                        // Obtener información del archivo guardado
                        const savedFile = await gfs.files.findOne({ _id: fileId });
                        
                        if (!savedFile) {
                            throw new Error('No se pudo guardar el archivo en GridFS');
                        }
                        
                        mediaId = fileId;
                        mediaUrl = `/api/files/${fileId}`;
                        
                        console.log(`Archivo guardado exitosamente en GridFS con ID: ${fileId}`);
                        
                    } catch (gridFsError) {
                        console.error('Error al guardar archivo en GridFS:', gridFsError);
                        throw gridFsError;
                    }
                }
            }
            
            // Guardar el mensaje con referencia a GridFS
            const message = new Message({
                text: messageData.text || '',
                username,
                userId,
                time: formatTime(),
                fileType: messageData.fileType,
                fileName: messageData.fileName,
                fileSize: messageData.fileSize,
                // No guardar el archivo directamente en el documento
                media: null,
                mediaId, // ID de referencia al archivo en GridFS
                mediaUrl, // URL para acceder al archivo
                isLargeFile: true, // Indicar que está en GridFS
                createdAt: new Date()
            });
            
            await message.save();
            
            // Modificar el messageData para la respuesta
            messageData.media = mediaUrl;
            messageData.isLargeFile = true;
            messageData.mediaId = mediaId;
            
            return message;
        } catch (error) {
            console.error(`Error al guardar mensaje multimedia: ${error}`);
            throw error;
        }
    },
    
    // Obtener archivo de GridFS por ID
    async getFileById(fileId, range = null) {
        return new Promise(async (resolve, reject) => {
            try {
                const _id = new mongoose.Types.ObjectId(fileId);
                
                // Revisar primero si el archivo existe usando promesas en lugar de callbacks
                const file = await gfs.files.findOne({ _id });
                
                if (!file) {
                    return reject(new Error('Archivo no encontrado'));
                }
                
                // Si hay un range (para streaming de video), procesar adecuadamente
                if (range) {
                    // Obtener información del rango solicitado
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
                    const chunkSize = (end - start) + 1;
                    
                    try {
                        // Crear un stream con el rango específico
                        const readStream = gridFSBucket.openDownloadStream(_id, {
                            start,
                            end: end + 1
                        });
                        
                        readStream.on('error', err => {
                            console.error('Error en stream de rango:', err);
                            reject(err);
                        });
                        
                        resolve({
                            file,
                            stream: readStream,
                            range: {
                                start,
                                end,
                                length: file.length,
                                chunkSize
                            }
                        });
                    } catch (streamError) {
                        console.error('Error al crear stream de rango:', streamError);
                        reject(streamError);
                    }
                } else {
                    // Sin range, streaming normal
                    try {
                        const readStream = gridFSBucket.openDownloadStream(_id);
                        
                        readStream.on('error', err => {
                            console.error('Error en stream normal:', err);
                            reject(err);
                        });
                        
                        resolve({
                            file,
                            stream: readStream
                        });
                    } catch (streamError) {
                        console.error('Error al crear stream normal:', streamError);
                        reject(streamError);
                    }
                }
            } catch (error) {
                console.error(`Error al obtener archivo: ${error}`);
                reject(error);
            }
        });
    },
    
    // Obtener mensajes recientes
    async getRecentMessages(limit = 50) {
        try {
            console.log(`Obteniendo ${limit} mensajes recientes...`);
            
            // Buscar mensajes ordenados por fecha (más recientes al final)
            const messages = await Message.find()
                .sort({ createdAt: 1 })
                .limit(limit)
                .lean();
            
            console.log(`Mensajes encontrados: ${messages.length}`);
            
            // Transformar cada mensaje para enviarlo al cliente
            const transformedMessages = messages.map(msg => {
                // Crear la URL para archivos multimedia si es necesario
                let mediaUrl = msg.media;
                if (msg.mediaId) {
                    mediaUrl = `/api/files/${msg.mediaId}`;
                }
                
                return {
                    username: msg.username,
                    userId: msg.userId,
                    text: msg.text,
                    time: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    media: mediaUrl,
                    fileType: msg.fileType,
                    fileName: msg.fileName,
                    fileSize: msg.fileSize,
                    isLargeFile: !!msg.mediaId,
                    createdAt: msg.createdAt
                };
            });
            
            console.log(`Mensajes transformados y listos para enviar: ${transformedMessages.length}`);
            return transformedMessages;
            
        } catch (error) {
            console.error('Error al obtener mensajes recientes:', error);
            // En caso de error, devolver array vacío en lugar de propagar el error
            return [];
        }
    },
    
    // NUEVAS FUNCIONES PARA ADMINISTRADOR
    
    // Eliminar todos los mensajes
    async deleteAllMessages() {
        try {
            // Primero obtenemos todos los mensajes para identificar los archivos multimedia
            const messages = await Message.find({ mediaId: { $exists: true, $ne: null } });
            
            // Recopilamos los IDs de los archivos multimedia que hay que eliminar
            const mediaIds = messages
                .filter(msg => msg.mediaId)
                .map(msg => msg.mediaId);
            
            console.log(`Se encontraron ${mediaIds.length} archivos multimedia para eliminar`);
            
            // Eliminamos los archivos de GridFS
            if (mediaIds.length > 0) {
                try {
                    for (const fileId of mediaIds) {
                        try {
                            // Convertir string a ObjectId si es necesario
                            const objectId = typeof fileId === 'string' ? 
                                new mongoose.Types.ObjectId(fileId) : fileId;
                            
                            // Eliminar archivo de GridFS
                            await gridFSBucket.delete(objectId);
                            console.log(`Archivo eliminado de GridFS: ${fileId}`);
                        } catch (fileError) {
                            console.error(`Error al eliminar archivo ${fileId} de GridFS:`, fileError);
                            // Continuamos con los demás archivos aunque este falle
                        }
                    }
                } catch (gridError) {
                    console.error('Error general al eliminar archivos de GridFS:', gridError);
                }
            }
            
            // Ahora eliminamos todos los mensajes
            const result = await Message.deleteMany({});
            console.log(`${result.deletedCount} mensajes eliminados de la base de datos`);
            
            return {
                ...result,
                mediaDeleted: mediaIds.length
            };
        } catch (error) {
            console.error(`Error al eliminar todos los mensajes: ${error}`);
            throw error;
        }
    },
    
    // Eliminar un mensaje específico
    async deleteMessage(messageId) {
        try {
            // Buscar el mensaje para ver si tiene archivo multimedia
            const message = await Message.findById(messageId);
            
            if (!message) {
                return { acknowledged: true, deletedCount: 0 };
            }
            
            // Si el mensaje tiene un archivo multimedia, eliminarlo
            if (message.mediaId) {
                try {
                    const objectId = typeof message.mediaId === 'string' ?
                        new mongoose.Types.ObjectId(message.mediaId) : message.mediaId;
                    
                    await gridFSBucket.delete(objectId);
                    console.log(`Archivo eliminado de GridFS: ${message.mediaId}`);
                } catch (fileError) {
                    console.error(`Error al eliminar archivo ${message.mediaId} de GridFS:`, fileError);
                }
            }
            
            // Eliminar el mensaje
            const result = await Message.findByIdAndDelete(messageId);
            return { acknowledged: true, deletedCount: result ? 1 : 0 };
        } catch (error) {
            console.error(`Error al eliminar mensaje: ${error}`);
            throw error;
        }
    },
    
    // Obtener el número total de mensajes
    async getMessageCount() {
        try {
            return await Message.countDocuments({});
        } catch (error) {
            console.error(`Error al contar mensajes: ${error}`);
            throw error;
        }
    },
    
    // Procesar un fragmento de archivo
    async processFileChunk(chunkData) {
        try {
            const { 
                username, userId, chunkData: dataChunk, fileName, fileType, fileSize, 
                text, currentChunk, totalChunks, isLastChunk, fileId 
            } = chunkData;
            
            // Establecer un límite de tiempo para la operación completa
            const operationPromise = new Promise(async (resolve, reject) => {
                try {
                    // Extraer datos base64 y convertir a buffer
                    const matches = dataChunk.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (!matches || matches.length !== 3) {
                        throw new Error('Formato de datos inválido para el fragmento');
                    }
                    
                    const mimeType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    
                    if (currentChunk === 0) {
                        // Para el primer fragmento, generar un ID único para el archivo
                        const newFileId = new mongoose.Types.ObjectId();
                        
                        // Inicializar almacenamiento para este archivo
                        tempChunksStorage.set(newFileId.toString(), {
                            chunks: [buffer],
                            mimeType,
                            processed: 1,
                            totalChunks,
                            lastActivity: Date.now()
                        });
                        
                        console.log(`Iniciando carga fragmentada. Archivo: ${fileName}, ID: ${newFileId}, Fragmentos totales: ${totalChunks}`);
                        
                        resolve({
                            fileId: newFileId,
                            mediaUrl: `/api/files/${newFileId}`
                        });
                        
                    } else {
                        // Verificar que tenemos un fileId válido
                        if (!fileId) {
                            throw new Error('ID de archivo no proporcionado para fragmento secundario');
                        }
                        
                        // Obtener el almacenamiento para este archivo
                        const fileStorage = tempChunksStorage.get(fileId);
                        if (!fileStorage) {
                            throw new Error('No se encontró almacenamiento para este archivo');
                        }
                        
                        // Añadir este fragmento
                        fileStorage.chunks.push(buffer);
                        fileStorage.processed += 1;
                        fileStorage.lastActivity = Date.now(); // Actualizar timestamp de actividad
                        
                        console.log(`Fragmento ${currentChunk+1}/${totalChunks} recibido para archivo ${fileId}`);
                        
                        // Si es el último fragmento, guardar el archivo completo en GridFS
                        if (isLastChunk) {
                            try {
                                // Combinar todos los fragmentos en un solo buffer
                                const completeBuffer = Buffer.concat(fileStorage.chunks);
                                
                                if (!gridFSBucket) {
                                    throw new Error('GridFSBucket no está inicializado');
                                }
                                
                                // Usar util.promisify y stream.pipeline para manejar streams con promesas
                                const stream = require('stream');
                                const { promisify } = require('util');
                                const pipeline = promisify(stream.pipeline);
                                
                                // Crear un stream de lectura a partir del buffer combinado
                                const readStream = new stream.Readable();
                                readStream.push(completeBuffer);
                                readStream.push(null); // Señal de fin de stream
                                
                                // Crear stream de escritura en GridFS
                                const uploadStream = gridFSBucket.openUploadStreamWithId(
                                    new mongoose.Types.ObjectId(fileId),
                                    fileName || `file_${Date.now()}`,
                                    {
                                        contentType: fileStorage.mimeType,
                                        metadata: {
                                            username,
                                            userId,
                                            messageTime: formatTime(),
                                            uploadType: 'chunked',
                                            originalSize: fileSize
                                        }
                                    }
                                );
                                
                                // Establecer timeout para la operación
                                const saveTimeout = setTimeout(() => {
                                    uploadStream.destroy(new Error('Timeout al guardar en GridFS'));
                                    throw new Error('Tiempo de espera agotado al guardar en GridFS');
                                }, 60000); // 60 segundos de timeout
                                
                                // Procesar el stream y esperar a que termine
                                await pipeline(readStream, uploadStream);
                                
                                // Limpiar timeout y datos temporales
                                clearTimeout(saveTimeout);
                                tempChunksStorage.delete(fileId);
                                
                                console.log(`Archivo completo guardado en GridFS. ID: ${fileId}`);
                                
                                // Crear mensaje asociado al archivo
                                const message = new Message({
                                    text: text || '',
                                    username,
                                    userId,
                                    time: formatTime(),
                                    fileType,
                                    fileName,
                                    fileSize,
                                    // No guardar el archivo directamente en el documento
                                    media: null,
                                    mediaId: fileId,
                                    mediaUrl: `/api/files/${fileId}`,
                                    isLargeFile: true,
                                    createdAt: new Date()
                                });
                                
                                // Guardar el mensaje
                                const savedMessage = await message.save();
                                console.log(`Mensaje con referencia al archivo guardado en la base de datos. ID: ${savedMessage._id}`);
                                
                                // Resolver con la información del archivo y mensaje
                                resolve({
                                    success: true,
                                    fileId,
                                    mediaUrl: `/api/files/${fileId}`,
                                    messageId: savedMessage._id
                                });
                                
                            } catch (saveError) {
                                console.error('Error al guardar archivo completo:', saveError);
                                // Limpiar datos temporales en caso de error
                                tempChunksStorage.delete(fileId);
                                reject(saveError);
                            }
                        } else {
                            // No es el último fragmento, confirmar recepción
                            resolve({
                                fileId,
                                currentChunk: currentChunk + 1,
                                totalChunks
                            });
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            // Configurar un timeout general para la operación
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Tiempo de espera agotado en el procesamiento del fragmento')), 120000);
            });
            
            // Esperar la finalización de la operación o el timeout
            return await Promise.race([operationPromise, timeout]);
        } catch (error) {
            console.error(`Error al procesar fragmento de archivo: ${error}`);
            throw error;
        }
    },
    
    // Añadir función para limpiar archivos temporales obsoletos
    cleanupTempStorage() {
        try {
            const now = Date.now();
            // Tiempo de expiración: 1 hora
            const expirationTime = 3600000;
            
            for (const [fileId, fileData] of tempChunksStorage.entries()) {
                // Si el último acceso fue hace más de 1 hora, eliminar
                if (now - fileData.lastActivity > expirationTime) {
                    console.log(`Eliminando datos temporales obsoletos para archivo ${fileId}`);
                    tempChunksStorage.delete(fileId);
                }
            }
        } catch (error) {
            console.error(`Error al limpiar almacenamiento temporal: ${error}`);
        }
    },
    
    // Obtener un mensaje específico por ID
    async getMessageById(messageId) {
        try {
            const message = await Message.findById(messageId);
            return message;
        } catch (error) {
            console.error(`Error al obtener mensaje por ID: ${error}`);
            throw error;
        }
    },
    
    // Obtener un mensaje por su UUID
    async getMessageByUuid(uuid) {
        try {
            const message = await Message.findOne({ uuid });
            return message;
        } catch (error) {
            console.error(`Error al obtener mensaje por UUID: ${error}`);
            throw error;
        }
    },
    
    // Obtener todos los mensajes (limitado a los más recientes)
    async getAllMessages(limit = 100) {
        try {
            return await Message.find({})
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
        } catch (error) {
            console.error(`Error al obtener todos los mensajes: ${error}`);
            throw error;
        }
    },
    
    // Obtener metadatos de archivo sin descargar su contenido
    async getFileMetadata(fileId) {
        try {
            const _id = new mongoose.Types.ObjectId(fileId);
            
            // Buscar el archivo en GridFS usando promesas
            const file = await gfs.files.findOne({ _id });
            
            if (!file) {
                throw new Error('Archivo no encontrado');
            }
            
            // Devolver solo los metadatos
            return file;
        } catch (error) {
            console.error(`Error al obtener metadatos del archivo: ${error}`);
            throw error;
        }
    },
};

// Iniciar limpieza automática periódica del almacenamiento temporal
setInterval(() => {
    messageController.cleanupTempStorage();
}, 900000); // Ejecutar cada 15 minutos

module.exports = { userController, messageController, authController }; 