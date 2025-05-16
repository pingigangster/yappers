const User = require('./models/User');
const Message = require('./models/Message');
const mongoose = require('mongoose');
const Grid = require('gridfs-stream');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const moment = require('moment');
const stream = require('stream');
const { promisify } = require('util');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/mailer');
const Room = require('./models/Room');
const roleController = require('./controllers/roleController');

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
    return moment().format('HH:mm');
};

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
                role: 'user'
            });
            
            await user.save();
            
            // Crear token JWT para enviar al cliente
            const token = jwt.sign(
                { id: user._id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );
            
            // Enviar correo de bienvenida
            try {
                await sendWelcomeEmail(user);
                console.log(`Correo de bienvenida enviado a ${user.email}`);
            } catch (emailError) {
                console.error(`Error al enviar correo de bienvenida: ${emailError}`);
                // No interrumpimos el flujo si falla el envío del correo
            }
            
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
            
            // Enviar correo con enlace de recuperación
            try {
                await sendPasswordResetEmail(user, resetToken);
                console.log(`Correo de recuperación enviado a ${user.email}`);
            } catch (emailError) {
                console.error(`Error al enviar correo de recuperación: ${emailError}`);
                // Revertir los cambios si falla el envío del correo
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;
                await user.save();
                throw new Error('Error al enviar el correo de recuperación');
            }
            
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
                user.isActive = false;
                user.lastActive = new Date();
                await user.save();
                console.log(`Usuario ${user.username} marcado como inactivo`);
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
            const user = await User.findOne({ googleId });
            console.log(`Buscando usuario con googleId: ${googleId}`);
            if (user) {
                console.log(`Usuario encontrado: ${user.username}`);
            } else {
                console.log('Usuario encontrado: No encontrado');
            }
            return user;
        } catch (error) {
            console.error(`Error al buscar usuario por Google ID ${googleId}:`, error);
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

    // <<< NUEVA FUNCIÓN >>>
    async findUserByEmail(email) {
        try {
            if (!email) return null; // No buscar si no hay email
            const user = await User.findOne({ email: email.toLowerCase() });
            console.log(`Buscando usuario con email: ${email}`);
            if (user) {
                console.log(`Usuario encontrado por email: ${user.username} (ID: ${user._id})`);
            } else {
                console.log('Usuario no encontrado por email.');
            }
            return user;
        } catch (error) {
            console.error(`Error al buscar usuario por email ${email}:`, error);
            throw error;
        }
    },
    // <<< FIN NUEVA FUNCIÓN >>>

    // Cambiar contraseña de un usuario (por administrador)
    async adminChangeUserPassword(userId, newPassword) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('Usuario no encontrado');
            }

            // La nueva contraseña será hasheada automáticamente por el pre-save hook del modelo User
            user.password = newPassword;
            // Invalidar cualquier token de reseteo de contraseña existente
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;

            await user.save();
            console.log(`Contraseña cambiada por admin para el usuario: ${user.username} (ID: ${user._id})`);
            return { success: true, message: 'Contraseña actualizada correctamente' };
        } catch (error) {
            console.error(`Error al cambiar contraseña por admin para el usuario ${userId}:`, error);
            throw error;
        }
    },
};

// Controladores para mensajes
const messageController = {
    // Guardar un mensaje de texto
    async saveTextMessage(username, userId, text, room = 'general') {
        try {
            const message = new Message({
                text,
                username,
                userId,
                room,
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
            const { fileBuffer, fileType, fileName, fileSize, text } = messageData;

            // Verificar que tenemos el buffer del archivo
            if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
                throw new Error('No se proporcionó el buffer del archivo multimedia');
            }

            // Verificar que gridFSBucket esté disponible
            if (!gridFSBucket) {
                console.error('Error Crítico: GridFSBucket no está inicializado al intentar guardar archivo.');
                throw new Error('Error del servidor al preparar almacenamiento de archivos.');
            }

            console.log(`Guardando archivo en GridFS: ${fileName}, Tipo: ${fileType}, Tamaño: ${fileSize} bytes`);

                    const fileId = new mongoose.Types.ObjectId();
            let contentType = fileType;
             // Add more specific content type mapping if needed based on fileType or fileName extension
             if (fileType === 'image' && !contentType.includes('/')) contentType = 'image/jpeg'; // Default image type
             else if (fileType === 'video' && !contentType.includes('/')) contentType = 'video/mp4'; // Default video type
             // Consider using a library like 'mime-types' for better accuracy
             else if (!contentType || contentType === 'file' || contentType === 'application/octet-stream') {
                 // Try to infer from extension if type is generic or missing
                 const ext = fileName.split('.').pop().toLowerCase();
                 const mime = require('mime-types'); // Consider adding mime-types dependency
                 contentType = mime.lookup(ext) || 'application/octet-stream';
                 console.log(`Inferred content type for ${ext}: ${contentType}`);
             }


                        const metadata = {
                            username,
                            userId,
                originalName: fileName,
                clientFileType: fileType
            };
                        
            const uploadStream = gridFSBucket.openUploadStreamWithId(fileId, fileName || `file_${Date.now()}`, {
                            contentType: contentType,
                            metadata: metadata
                        });
                        
                        const readableStream = new stream.Readable();
            readableStream.push(fileBuffer);
            readableStream.push(null);

            const pipelineAsync = promisify(stream.pipeline);
            await pipelineAsync(readableStream, uploadStream);
                        
                        console.log(`Archivo guardado exitosamente en GridFS con ID: ${fileId}`);
                        
            const savedMessage = new Message({
                text: text || '',
                username,
                userId,
                time: formatTime(),
                fileType: fileType,
                fileName: fileName,
                fileSize: fileSize,
                media: null,
                mediaId: fileId.toString(),
                createdAt: new Date()
            });
            
            await savedMessage.save();
            console.log(`Mensaje guardado en DB con ID: ${savedMessage._id}, asociado a mediaId: ${fileId}`);

            const confirmedMessage = {
                 _id: savedMessage._id.toString(),
                 username: savedMessage.username,
                 userId: savedMessage.userId,
                 time: savedMessage.time,
                 text: savedMessage.text,
                 fileType: savedMessage.fileType,
                 fileName: savedMessage.fileName,
                 fileSize: savedMessage.fileSize,
                 mediaId: savedMessage.mediaId,
                 createdAt: savedMessage.createdAt
            };
            
            return { success: true, confirmedMessage: confirmedMessage };

        } catch (error) {
            console.error('Error detallado al guardar mensaje multimedia:', error);
            return { success: false, error: error.message || 'Error interno del servidor al guardar archivo' };
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
                
                // Verificar si es un video para manejos especiales
                const isVideo = file.contentType && file.contentType.startsWith('video/');
                const isSmallVideo = isVideo && file.length < 15 * 1024 * 1024;
                
                // Lista de IDs o características de videos problemáticos conocidos
                const isPotentiallyProblematic = isSmallVideo && 
                    (file.length > 10 * 1024 * 1024 && file.length < 12 * 1024 * 1024);
                
                // Si hay un header de Range, manejarlo para streaming de video
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
                        
                        // Manejar posibles errores en el stream
                        readStream.on('error', err => {
                            console.error('Error en stream de rango:', err);
                            reject(err);
                        });
                        
                        // Manejar fin del stream (opcional, para registro)
                        readStream.on('end', () => {
                            console.log(`Stream de rango completado para ${fileId}, bytes ${start}-${end}`);
                        });
                        
                        resolve({
                            file,
                            stream: readStream,
                            range: {
                                start,
                                end,
                                length: file.length,
                                chunkSize
                            },
                            isVideo,
                            isSmallVideo,
                            isPotentiallyProblematic
                        });
                    } catch (streamError) {
                        console.error('Error al crear stream de rango:', streamError);
                        reject(streamError);
                    }
                } else {
                    // Sin range, streaming normal
                    try {
                        const readStream = gridFSBucket.openDownloadStream(_id);
                        
                        // Manejar posibles errores en el stream
                        readStream.on('error', err => {
                            console.error('Error en stream normal:', err);
                            reject(err);
                        });
                        
                        // Manejar fin del stream (opcional, para registro)
                        readStream.on('end', () => {
                            console.log(`Stream completo finalizado para ${fileId}`);
                        });
                        
                        resolve({
                            file,
                            stream: readStream,
                            isVideo,
                            isSmallVideo,
                            isPotentiallyProblematic
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
                    _id: msg._id.toString(),
                    username: msg.username,
                    userId: msg.userId,
                    text: msg.text,
                    time: moment(msg.createdAt).format('HH:mm'),
                    fileType: msg.fileType,
                    fileName: msg.fileName,
                    fileSize: msg.fileSize,
                    mediaId: msg.mediaId,
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
    
    // Obtener mensajes por sala
    async getMessagesByRoom(room = 'general', limit = 50) {
        try {
            const messages = await Message.find({ room: room })
                .sort({ createdAt: 1 })
                .limit(limit)
                .lean();
            
            // Transformar cada mensaje para enviarlo al cliente
            const transformedMessages = messages.map(msg => {
                // Crear la URL para archivos multimedia si es necesario
                let mediaUrl = msg.media;
                if (msg.mediaId) {
                    mediaUrl = `/api/files/${msg.mediaId}`;
                }
                
                return {
                    _id: msg._id.toString(),
                    username: msg.username,
                    userId: msg.userId,
                    text: msg.text,
                    room: msg.room || 'general',
                    time: moment(msg.createdAt).format('HH:mm'),
                    fileType: msg.fileType,
                    fileName: msg.fileName,
                    fileSize: msg.fileSize,
                    mediaId: msg.mediaId,
                    createdAt: msg.createdAt
                };
            });
            
            console.log(`Obtenidos ${transformedMessages.length} mensajes de la sala ${room}`);
            return transformedMessages;
        } catch (error) {
            console.error(`Error al obtener mensajes de sala ${room}: ${error}`);
            // En caso de error, devolver array vacío para mantener consistencia
            return [];
        }
    },
    
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
            if (!gridFSBucket) throw new Error('GridFSBucket no está inicializado');
            if (!mongoose.Types.ObjectId.isValid(fileId)) {
                throw new Error('ID de archivo inválido');
            }
            const _id = new mongoose.Types.ObjectId(fileId);
            const files = await gridFSBucket.find({ _id }).toArray();
            if (!files || files.length === 0) {
                throw new Error('Archivo no encontrado');
            }
            return files[0];
        } catch (error) {
            console.error(`Error al obtener metadatos del archivo ${fileId}: ${error}`);
            throw error;
        }
    },
};

// Controlador para salas
const roomController = {
    // Obtener todas las salas
    async getAllRooms() {
        try {
            const rooms = await Room.find().sort({ name: 1 }).lean();
            return rooms;
        } catch (error) {
            console.error(`Error al obtener todas las salas: ${error}`);
            throw error;
        }
    },
    
    // Obtener una sala por su ID
    async getRoomById(roomId) {
        try {
            const room = await Room.findById(roomId).lean();
            return room;
        } catch (error) {
            console.error(`Error al obtener sala por ID: ${error}`);
            throw error;
        }
    },
    
    // Obtener una sala por su slug
    async getRoomBySlug(slug) {
        try {
            const room = await Room.findOne({ slug }).lean();
            return room;
        } catch (error) {
            console.error(`Error al obtener sala por slug: ${error}`);
            throw error;
        }
    },
    
    // Crear una nueva sala
    async createRoom(roomData) {
        try {
            // Generar slug a partir del nombre si no se proporciona
            if (!roomData.slug) {
                roomData.slug = roomData.name
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            }
            
            const room = new Room(roomData);
            await room.save();
            return room;
        } catch (error) {
            console.error(`Error al crear sala: ${error}`);
            throw error;
        }
    },
    
    // Actualizar una sala existente
    async updateRoom(roomId, roomData) {
        try {
            // Generar slug a partir del nombre si se actualiza el nombre pero no el slug
            if (roomData.name && !roomData.slug) {
                roomData.slug = roomData.name
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            }
            
            // Establecer la fecha de actualización
            roomData.updatedAt = new Date();
            
            const room = await Room.findByIdAndUpdate(
                roomId,
                roomData,
                { new: true, runValidators: true }
            );
            
            return room;
        } catch (error) {
            console.error(`Error al actualizar sala: ${error}`);
            throw error;
        }
    },
    
    // Eliminar una sala
    async deleteRoom(roomId) {
        try {
            // Verificar que exista la sala
            const room = await Room.findById(roomId);
            
            if (!room) {
                throw new Error('Sala no encontrada');
            }
            
            // Proteger solo la sala general
            if (room.slug === 'general') {
                throw new Error('No se puede eliminar la sala General');
            }
            
            // Para el resto de salas, permitir eliminar independientemente del estado isDefault
            await Room.findByIdAndDelete(roomId);
            return { success: true, message: 'Sala eliminada correctamente' };
        } catch (error) {
            console.error(`Error al eliminar sala: ${error}`);
            throw error;
        }
    },
    
    // Verificar si un usuario tiene acceso a una sala
    async checkAccess(roomId, userId) {
        try {
            const room = await Room.findById(roomId);
            const user = await User.findById(userId);
            
            if (!room || !user) {
                return false;
            }
            
            return room.hasAccess(user);
        } catch (error) {
            console.error(`Error al verificar acceso a sala: ${error}`);
            return false;
        }
    },
    
    // Inicializar salas predeterminadas
    async initDefaultRooms() {
        try {
            const defaultRooms = [
                {
                    name: 'General',
                    slug: 'general',
                    description: 'Chat general para todos los usuarios',
                    requiredRole: 'none',
                    isPrivate: false,
                    isDefault: true
                }
                // Las demás salas predeterminadas han sido eliminadas
            ];
            
            // Crear salas si no existen
            for (const roomData of defaultRooms) {
                const existingRoom = await Room.findOne({ slug: roomData.slug });
                if (!existingRoom) {
                    await this.createRoom(roomData);
                    console.log(`Sala predeterminada creada: ${roomData.name}`);
                } else {
                    // Actualizar el estado isDefault para asegurar que coincida con la configuración
                    if (existingRoom.isDefault !== roomData.isDefault) {
                        await Room.findByIdAndUpdate(
                            existingRoom._id,
                            { isDefault: roomData.isDefault },
                            { new: true }
                        );
                        console.log(`Estado 'isDefault' actualizado para ${roomData.name}: ${roomData.isDefault}`);
                    }
                }
            }
            
            return { success: true, message: 'Salas predeterminadas inicializadas correctamente' };
        } catch (error) {
            console.error(`Error al inicializar salas predeterminadas: ${error}`);
            throw error;
        }
    }
};

// Exportar controladores
module.exports = {
    authController,
    userController,
    messageController,
    roomController,
    roleController
}; 