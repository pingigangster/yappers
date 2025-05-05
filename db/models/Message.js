const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Esquema de mensaje
const MessageSchema = new mongoose.Schema({
    uuid: {
        type: String,
        default: uuidv4,
        required: true
    },
    text: {
        type: String,
        required: false,
        trim: true
    },
    username: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    // Campos para archivos multimedia
    media: {
        type: String,
        required: false
    },
    // Campos nuevos para GridFS
    mediaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'uploads.files',
        required: false
    },
    mediaUrl: {
        type: String,
        required: false
    },
    isLargeFile: {
        type: Boolean,
        default: false,
        required: false
    },
    // Nuevo campo para identificar videos pequeños
    isSmallVideo: {
        type: Boolean,
        default: false,
        required: false
    },
    fileType: {
        type: String,
        required: false,
        enum: ['image', 'gif', 'video', 'audio', 'pdf', 'word', 'excel', 'powerpoint', 'archive', 'text', 'code', 'file', null]
    },
    fileName: {
        type: String,
        required: false
    },
    fileSize: {
        type: Number,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índices para mejorar rendimiento de consultas
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ userId: 1 });
MessageSchema.index({ uuid: 1 }, { unique: true });

// Método para obtener los mensajes más recientes
MessageSchema.statics.getRecentMessages = async function(limit = 50) {
    return this.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

// Método para guardar un mensaje
MessageSchema.statics.saveMessage = async function(messageData) {
    const message = new this(messageData);
    return await message.save();
};

module.exports = mongoose.model('Message', MessageSchema); 