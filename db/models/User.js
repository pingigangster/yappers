const mongoose = require('mongoose');

// Esquema de usuario
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },
    socketId: {
        type: String,
        required: false
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Creación de índices para mejorar rendimiento
UserSchema.index({ username: 1 });
UserSchema.index({ socketId: 1 });

module.exports = mongoose.model('User', UserSchema); 