const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Esquema para roles personalizados
const CustomRoleSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    identifier: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[a-z0-9-]+$/, 'El identificador solo puede contener letras minúsculas, números y guiones']
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    color: {
        type: String,
        default: '#3498db', // Color azul por defecto
        match: [/^#[0-9A-Fa-f]{6}$/, 'El color debe estar en formato hexadecimal (#RRGGBB)']
    },
    isDefault: {
        type: Boolean,
        default: false
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

// Middleware pre-save para actualizar el campo updatedAt
CustomRoleSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Middleware para crear slug a partir del nombre si no se proporciona
CustomRoleSchema.pre('save', function(next) {
    if (!this.identifier || this.identifier.trim() === '') {
        // Generar identifier a partir del nombre
        this.identifier = this.name
            .toLowerCase()
            .replace(/\s+/g, '-')       // Reemplazar espacios por guiones
            .replace(/[^a-z0-9-]/g, '') // Eliminar caracteres no permitidos
            .replace(/-+/g, '-')        // Reemplazar múltiples guiones por uno solo
            .replace(/^-|-$/g, '');     // Eliminar guiones al inicio y al final
        
        // Si quedó vacío o es un reserved word, usar un identificador por defecto
        if (!this.identifier || ['user', 'admin'].includes(this.identifier)) {
            this.identifier = 'custom-' + Date.now().toString().substring(8);
        }
    }
    next();
});

module.exports = mongoose.model('CustomRole', CustomRoleSchema); 