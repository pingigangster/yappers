const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Esquema de sala de chat
const RoomSchema = new mongoose.Schema({
    uuid: {
        type: String,
        default: uuidv4,
        unique: true,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        required: false,
        trim: true,
        default: ''
    },
    slug: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    // Roles que pueden acceder a esta sala
    requiredRole: {
        type: String,
        default: 'none' // 'none' significa que todos pueden acceder
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para actualizar la fecha de actualización
RoomSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Método para comprobar si un usuario tiene acceso a la sala
RoomSchema.methods.hasAccess = function(user) {
    // Si no requiere rol específico, todos tienen acceso
    if (this.requiredRole === 'none') {
        return true;
    }
    
    // Obtener los roles del usuario (asegurando que sea un array)
    const userRoles = Array.isArray(user.roles) ? user.roles : [user.role || 'user'];
    
    // Si el usuario tiene rol admin, siempre tiene acceso
    if (userRoles.includes('admin')) {
        return true;
    }
    
    // Verificar que el usuario tenga el rol requerido
    if (this.requiredRole !== 'none' && !userRoles.includes(this.requiredRole)) {
        return false;
    }
    
    return true;
};

// Creación de índices para mejorar rendimiento
RoomSchema.index({ name: 1 }, { unique: true });
RoomSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Room', RoomSchema); 