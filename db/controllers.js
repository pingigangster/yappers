const User = require('./models/User');
const Message = require('./models/Message');
const mongoose = require('mongoose');
const Grid = require('gridfs-stream');

// Configurar GridFS
let gfs;
let gridFSBucket;
mongoose.connection.once('open', () => {
    // Inicializar tanto grid-fs-stream como GridFSBucket
    gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads'
    });
    
    // Inicializar grid-fs-stream con la instancia de GridFSBucket
    gfs = Grid(mongoose.connection.db, mongoose.mongo);
    gfs.collection('uploads');
    console.log('GridFS configurado correctamente');
});

// Formatear la fecha y hora
const formatTime = () => {
    const now = new Date();
    return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// Sistema de archivos temporal para almacenar chunks
const tempChunksStorage = new Map();

// Controladores para usuarios
const userController = {
    // Crear o actualizar usuario cuando se conecta
    async connectUser(username, socketId) {
        try {
            console.log(`Intentando conectar usuario: ${username} con socketId: ${socketId}`);
            
            // Validar longitud del nombre de usuario
            if (!username || username.length > 15) {
                throw new Error('El nombre de usuario debe tener entre 3 y 15 caracteres');
            }
            
            // Verificar si el nombre ya contiene un timestamp (de reconexión anterior)
            const hasTimestamp = username.includes('_') && !isNaN(username.split('_').pop());
            
            // Si tiene timestamp, extraer el nombre original
            const originalUsername = hasTimestamp ? username.split('_').slice(0, -1).join('_') : username;
            
            // Primero, buscar si existe un usuario con este socketId
            let user = await User.findOne({ socketId });
            
            if (user) {
                // Si existe, actualizar el nombre de usuario solo si no está reconectándose
                console.log(`Usuario encontrado con socketId ${socketId}, actualizando...`);
                if (!hasTimestamp) {
                    user.username = username;
                }
                user.lastActive = new Date();
                await user.save();
                console.log(`Usuario actualizado: ${user.username}`);
            } else {
                // Buscar si hay un usuario con este nombre (reconexión)
                let existingUser = await User.findOne({ 
                    username: { $in: [username, originalUsername] }, 
                    socketId: null 
                });
                
                if (existingUser) {
                    // Si el usuario existe pero está desconectado, solo actualizar el socketId
                    console.log(`Usuario desconectado encontrado: ${existingUser.username}, reconectando...`);
                    existingUser.socketId = socketId;
                    existingUser.lastActive = new Date();
                    await existingUser.save();
                    user = existingUser;
                    console.log(`Usuario reconectado: ${user.username}`);
                } else {
                    // Crear nuevo usuario
                    console.log(`Creando nuevo usuario: ${username}`);
                    user = new User({
                        username,
                        socketId,
                        lastActive: new Date()
                    });
                    
                    try {
                        await user.save();
                        console.log(`Nuevo usuario guardado: ${username} con ID: ${user._id}`);
                    } catch (saveError) {
                        console.error(`Error al guardar nuevo usuario: ${saveError}`);
                        // Si hay un error específico, intenta manejarlo
                        if (saveError.code === 11000) { // Error de clave duplicada
                            console.log(`Intentando resolver conflicto de nombre de usuario duplicado: ${username}`);
                            
                            // Crear un nombre de usuario único añadiendo un timestamp
                            const uniqueUsername = `${username}_${Date.now()}`;
                            user.username = uniqueUsername;
                            await user.save();
                            console.log(`Usuario guardado con nombre alternativo: ${uniqueUsername}`);
                        } else {
                            throw saveError; // Re-lanzar cualquier otro error
                        }
                    }
                }
            }
            
            // Verificar que el usuario se haya guardado correctamente
            const checkUser = await User.findOne({ socketId });
            if (checkUser) {
                console.log(`Verificación: Usuario encontrado con socketId ${socketId}: ${checkUser.username}`);
            } else {
                console.error(`ERROR: No se encontró usuario con socketId ${socketId} después de guardarlo`);
            }
            
            return user;
        } catch (error) {
            console.error(`Error al conectar usuario: ${error}`);
            throw error;
        }
    },
    
    // Obtener todos los usuarios conectados
    async getConnectedUsers() {
        try {
            console.log('Obteniendo usuarios conectados...');
            // Buscar usuarios donde socketId no sea nulo
            const users = await User.find({ socketId: { $ne: null } }).sort({ username: 1 });
            
            console.log(`Encontrados ${users.length} usuarios conectados.`);
            users.forEach((user, index) => {
                console.log(`  ${index + 1}. Usuario: ${user.username}, Socket: ${user.socketId}`);
            });
            
            // Si no encontramos usuarios, registrarlo
            if (users.length === 0) {
                console.log('Advertencia: No se encontraron usuarios conectados');
                
                // Buscar cualquier usuario para diagnosticar
                const allUsers = await User.find({}).limit(5);
                console.log(`Usuarios en base de datos (primeros 5): ${allUsers.length}`);
                allUsers.forEach((user, index) => {
                    console.log(`  ${index + 1}. Usuario: ${user.username}, Socket: ${user.socketId || 'null'}, ID: ${user._id}`);
                });
            }
            
            return users;
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
    
    // Eliminar todos los usuarios desconectados
    async deleteAllDisconnectedUsers() {
        try {
            console.log('Borrando todos los usuarios desconectados...');
            const result = await User.deleteMany({ socketId: null });
            console.log(`${result.deletedCount} usuarios desconectados eliminados.`);
            return result;
        } catch (error) {
            console.error(`Error al eliminar todos los usuarios desconectados: ${error}`);
            throw error;
        }
    },
    
    // Eliminar todos los usuarios, conectados y desconectados
    async deleteAllUsers() {
        try {
            console.log('Borrando todos los usuarios (conectados y desconectados)...');
            const result = await User.deleteMany({});
            console.log(`${result.deletedCount} usuarios eliminados en total.`);
            return result;
        } catch (error) {
            console.error(`Error al eliminar todos los usuarios: ${error}`);
            throw error;
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
    }
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
            // Comprobar si el tamaño del archivo es mayor a 15MB (límite para documentos BSON)
            const isLargeFile = messageData.fileSize > 15 * 1024 * 1024;
            let mediaId = null;
            let mediaUrl = null;
            
            if (isLargeFile && messageData.media) {
                // Para archivos grandes, guardar en GridFS
                // Extraer datos base64 y convertir a buffer
                const matches = messageData.media.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    
                    // Crear un ID único para el archivo
                    const fileId = new mongoose.Types.ObjectId();
                    
                    // Crear un stream para guardar en GridFS
                    const writeStream = gfs.createWriteStream({
                        filename: messageData.fileName || `file_${Date.now()}`,
                        contentType: mimeType,
                        _id: fileId,
                        metadata: {
                            username,
                            userId,
                            messageTime: formatTime()
                        }
                    });
                    
                    // Escribir el buffer en el stream
                    const readStream = require('stream').Readable.from(buffer);
                    readStream.pipe(writeStream);
                    
                    // Manejar eventos del stream
                    await new Promise((resolve, reject) => {
                        writeStream.on('close', file => {
                            mediaId = file._id;
                            // Crear URL para recuperar el archivo después
                            mediaUrl = `/api/files/${file._id}`;
                            resolve(file);
                        });
                        writeStream.on('error', err => {
                            reject(err);
                        });
                    });
                }
            }
            
            // Guardar el mensaje con o sin referencia a GridFS
            const message = new Message({
                text: messageData.text || '',
                username,
                userId,
                time: formatTime(),
                fileType: messageData.fileType,
                fileName: messageData.fileName,
                fileSize: messageData.fileSize,
                // Si es un archivo grande, guardar la referencia; de lo contrario, guardar el archivo completo
                media: isLargeFile ? null : messageData.media,
                mediaId, // ID de referencia al archivo en GridFS
                mediaUrl, // URL para acceder al archivo
                isLargeFile, // Indicador si el archivo es grande
                createdAt: new Date()
            });
            
            await message.save();
            
            // Modificar el messageData para la respuesta
            if (isLargeFile) {
                messageData.media = mediaUrl;
                messageData.isLargeFile = true;
                messageData.mediaId = mediaId;
            }
            
            return message;
        } catch (error) {
            console.error(`Error al guardar mensaje multimedia: ${error}`);
            throw error;
        }
    },
    
    // Obtener archivo de GridFS por ID
    async getFileById(fileId) {
        return new Promise((resolve, reject) => {
            try {
                const _id = new mongoose.Types.ObjectId(fileId);
                
                // Revisar primero si el archivo existe
                gfs.files.findOne({ _id }, (err, file) => {
                    if (err) return reject(err);
                    if (!file) return reject(new Error('Archivo no encontrado'));
                    
                    // Usar GridFSBucket para crear el stream de lectura
                    const readStream = gridFSBucket.openDownloadStream(_id);
                    
                    readStream.on('error', err => {
                        reject(err);
                    });
                    
                    resolve({
                        stream: readStream,
                        file
                    });
                });
            } catch (error) {
                reject(error);
            }
        });
    },
    
    // Obtener mensajes recientes
    async getRecentMessages(limit = 50) {
        try {
            console.log(`Obteniendo los últimos ${limit} mensajes...`);
            
            // Intentar obtener mensajes
            const messages = await Message.find({})
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean()
                .exec();
            
            console.log(`Recuperados ${messages.length} mensajes históricos.`);
            
            // Verificar si hay datos válidos en los mensajes
            if (messages.length > 0) {
                const sampleMessage = messages[0];
                console.log(`Ejemplo de mensaje: ID=${sampleMessage._id}, Usuario=${sampleMessage.username}, Texto=${sampleMessage.text?.substring(0, 30) || '[sin texto]'}...`);
            } else {
                console.log('No hay mensajes previos en la base de datos.');
            }
            
            // Devolver mensajes en orden cronológico (del más antiguo al más reciente)
            return messages.reverse();
        } catch (error) {
            console.error(`Error al obtener mensajes recientes: ${error}`);
            // En caso de error, devolver un array vacío para evitar bloquear la interfaz
            console.log('Devolviendo array vacío debido al error');
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
                            // Combinar todos los fragmentos en un solo buffer
                            const completeBuffer = Buffer.concat(fileStorage.chunks);
                            
                            // Guardar el archivo completo en GridFS
                            const fileInfo = await new Promise((resolve, reject) => {
                                try {
                                    // Usar GridFSBucket en lugar de createWriteStream de grid-fs-stream
                                    const writeStream = gridFSBucket.openUploadStreamWithId(
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
                                    
                                    // Crear un stream de lectura a partir del buffer combinado
                                    const readStream = require('stream').Readable.from(completeBuffer);
                                    
                                    // Establecer timeout para el stream
                                    const streamTimeout = setTimeout(() => {
                                        writeStream.destroy(new Error('Timeout escribiendo en GridFS'));
                                        reject(new Error('Tiempo de espera agotado al escribir en GridFS'));
                                    }, 60000); // 60 segundos de timeout
                                    
                                    // Pipe al stream de escritura
                                    readStream.pipe(writeStream);
                                    
                                    writeStream.on('finish', () => {
                                        clearTimeout(streamTimeout);
                                        console.log(`Archivo completo guardado en GridFS. ID: ${fileId}`);
                                        
                                        // Eliminar los datos temporales para liberar memoria
                                        tempChunksStorage.delete(fileId);
                                        
                                        resolve({
                                            _id: fileId,
                                            filename: fileName,
                                            contentType: fileStorage.mimeType
                                        });
                                    });
                                    
                                    writeStream.on('error', err => {
                                        clearTimeout(streamTimeout);
                                        console.error(`Error al guardar archivo completo en GridFS: ${err}`);
                                        reject(err);
                                    });
                                } catch (err) {
                                    console.error('Error al crear stream de escritura:', err);
                                    reject(err);
                                }
                            });
                            
                            // Guardar referencia en la base de datos
                            const message = new Message({
                                text: text || '',
                                username,
                                userId,
                                time: formatTime(),
                                fileType,
                                fileName,
                                fileSize,
                                mediaId: fileId,
                                mediaUrl: `/api/files/${fileId}`,
                                isLargeFile: true,
                                createdAt: new Date()
                            });
                            
                            await message.save();
                            console.log(`Mensaje con referencia al archivo guardado en la base de datos. ID: ${message._id}`);
                        }
                        
                        resolve({
                            fileId,
                            mediaUrl: `/api/files/${fileId}`
                        });
                    }
                } catch (error) {
                    console.error(`Error al procesar fragmento interno: ${error}`);
                    reject(error);
                }
            });
            
            // Establecer un tiempo límite para toda la operación
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Tiempo de espera agotado al procesar fragmento de archivo'));
                }, 90000); // 90 segundos como tiempo límite total
            });
            
            // Competir entre la operación y el timeout
            return await Promise.race([operationPromise, timeoutPromise]);
            
        } catch (error) {
            console.error(`Error al procesar fragmento: ${error}`);
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
    }
};

// Iniciar limpieza automática periódica del almacenamiento temporal
setInterval(() => {
    messageController.cleanupTempStorage();
}, 900000); // Ejecutar cada 15 minutos

module.exports = {
    userController,
    messageController
}; 