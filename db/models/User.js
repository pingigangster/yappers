const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Esquema de usuario
const UserSchema = new mongoose.Schema({
    uuid: {
        type: String,
        default: uuidv4,
        unique: true,
        required: true
    },
    username: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Por favor ingresa un email válido']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    // Nuevos campos para autenticación con Google
    googleId: {
        type: String,
        unique: true,
        sparse: true // Permite que sea null para usuarios no-Google
    },
    image: {
        type: String
    },
    socketId: {
        type: String,
        required: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    passwordResetToken: {
        type: String,
        required: false
    },
    passwordResetExpires: {
        type: Date,
        required: false
    },
    // Rol principal (para compatibilidad con código existente)
    role: {
        type: String,
        default: 'user'
    },
    // Array de roles múltiples para el usuario
    // Ahora soporta tanto los roles predefinidos como los identificadores de roles personalizados
    roles: [{
        type: String
    }],
    lastActive: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para encriptar contraseña antes de guardar
UserSchema.pre('save', async function(next) {
    // Solo encriptar la contraseña si ha sido modificada o es nueva
    if (!this.isModified('password')) return next();
    
    try {
        // Generar salt
        const salt = await bcrypt.genSalt(10);
        // Encriptar la contraseña con el salt
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Middleware para asegurar que el rol principal esté siempre en roles
UserSchema.pre('save', function(next) {
    // Asegurar que el array de roles exista
    if (!this.roles) {
        this.roles = [];
    }
    
    // Asegurar que el rol principal esté en roles
    if (this.role && !this.roles.includes(this.role)) {
        this.roles.push(this.role);
    }
    
    // Si roles está vacío, añadir user como predeterminado
    if (this.roles.length === 0) {
        this.roles = ['user'];
        this.role = 'user';
    }
    
    next();
});

// Método para comprobar si un usuario tiene un rol específico
UserSchema.methods.hasRole = function(role) {
    return this.roles.includes(role);
};

// Método para comparar contraseñas
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Creación de índices para mejorar rendimiento
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ socketId: 1 });
UserSchema.index({ uuid: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema); 