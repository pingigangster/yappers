const CustomRole = require('../models/CustomRole');
const User = require('../models/User');
const mongoose = require('mongoose');

// Controlador para gestionar los roles personalizados
const roleController = {
    // Obtener todos los roles personalizados
    async getAllCustomRoles() {
        try {
            // Obtener roles personalizados de la base de datos
            const customRoles = await CustomRole.find().sort({ name: 1 });
            
            // Añadir los roles predeterminados del sistema
            const defaultRoles = [
                {
                    _id: 'system-user',
                    name: 'Usuario',
                    identifier: 'user',
                    description: 'Usuario normal con acceso básico',
                    color: '#3498db',
                    isDefault: true,
                    isSystemRole: true
                },
                {
                    _id: 'system-admin',
                    name: 'Administrador',
                    identifier: 'admin',
                    description: 'Administrador con acceso total al sistema',
                    color: '#e74c3c',
                    isDefault: true,
                    isSystemRole: true
                }
            ];
            
            // Combinar roles predeterminados y personalizados
            return [...defaultRoles, ...customRoles];
        } catch (error) {
            console.error('Error al obtener roles personalizados:', error);
            throw error;
        }
    },
    
    // Obtener un rol personalizado por ID
    async getCustomRoleById(roleId) {
        try {
            // Si es un ID de sistema, devolver el rol del sistema correspondiente
            if (roleId.startsWith('system-')) {
                const identifier = roleId.replace('system-', '');
                const systemRoles = {
                    'user': {
                        _id: 'system-user',
                        name: 'Usuario',
                        identifier: 'user',
                        description: 'Usuario normal con acceso básico',
                        color: '#3498db',
                        isDefault: true,
                        isSystemRole: true
                    },
                    'admin': {
                        _id: 'system-admin',
                        name: 'Administrador',
                        identifier: 'admin',
                        description: 'Administrador con acceso total al sistema',
                        color: '#e74c3c',
                        isDefault: true,
                        isSystemRole: true
                    }
                };
                
                if (systemRoles[identifier]) {
                    return systemRoles[identifier];
                } else {
                    throw new Error('Rol del sistema no encontrado');
                }
            }
            
            // Buscar rol personalizado por ID
            const role = await CustomRole.findById(roleId);
            if (!role) {
                throw new Error('Rol personalizado no encontrado');
            }
            return role;
        } catch (error) {
            console.error(`Error al obtener rol personalizado con ID ${roleId}:`, error);
            throw error;
        }
    },
    
    // Crear un nuevo rol personalizado
    async createCustomRole(roleData) {
        try {
            // Verificar que el identificador no sea uno de los reservados (solo user y admin son válidos)
            if (['user', 'admin'].includes(roleData.identifier)) {
                throw new Error('Este identificador está reservado para el sistema');
            }
            
            // Verificar que el identificador no exista ya
            if (roleData.identifier) {
                const existingRole = await CustomRole.findOne({ identifier: roleData.identifier });
                if (existingRole) {
                    throw new Error('Ya existe un rol con este identificador');
                }
            }
            
            const role = new CustomRole(roleData);
            await role.save();
            return role;
        } catch (error) {
            console.error('Error al crear rol personalizado:', error);
            throw error;
        }
    },
    
    // Actualizar un rol personalizado
    async updateCustomRole(roleId, roleData) {
        try {
            // No se pueden actualizar roles del sistema
            if (roleId.startsWith('system-')) {
                throw new Error('No se pueden modificar los roles del sistema');
            }
            
            // Verificar que el rol existe
            const role = await CustomRole.findById(roleId);
            if (!role) {
                throw new Error('Rol personalizado no encontrado');
            }
            
            // Verificar que el identificador no sea uno de los reservados
            if (['user', 'admin'].includes(roleData.identifier)) {
                throw new Error('Este identificador está reservado para el sistema');
            }
            
            // Si se está cambiando el identificador, verificar que no exista ya
            if (roleData.identifier && roleData.identifier !== role.identifier) {
                const existingRole = await CustomRole.findOne({ identifier: roleData.identifier });
                if (existingRole) {
                    throw new Error('Ya existe un rol con este identificador');
                }
            }
            
            // Actualizar el rol
            Object.assign(role, roleData);
            await role.save();
            return role;
        } catch (error) {
            console.error(`Error al actualizar rol personalizado con ID ${roleId}:`, error);
            throw error;
        }
    },
    
    // Actualizar el estado predeterminado de un rol personalizado
    async updateDefaultStatus(roleId, isDefault) {
        try {
            // No se pueden modificar roles del sistema
            if (roleId.startsWith('system-')) {
                throw new Error('No se pueden modificar los roles del sistema');
            }
            
            // Verificar que el rol existe
            const role = await CustomRole.findById(roleId);
            if (!role) {
                throw new Error('Rol personalizado no encontrado');
            }
            
            // Actualizar solo el estado isDefault
            role.isDefault = isDefault;
            await role.save();
            
            return {
                success: true,
                message: `Estado predeterminado del rol ${role.name} actualizado a ${isDefault ? 'predeterminado' : 'no predeterminado'}`,
                role
            };
        } catch (error) {
            console.error(`Error al actualizar estado predeterminado del rol con ID ${roleId}:`, error);
            throw error;
        }
    },
    
    // Eliminar un rol personalizado
    async deleteCustomRole(roleId) {
        try {
            // No se pueden eliminar roles del sistema
            if (roleId.startsWith('system-')) {
                throw new Error('No se pueden eliminar los roles del sistema');
            }
            
            // Verificar que el rol existe
            const role = await CustomRole.findById(roleId);
            if (!role) {
                throw new Error('Rol personalizado no encontrado');
            }
            
            // No se pueden eliminar roles predeterminados
            if (role.isDefault) {
                throw new Error('No se pueden eliminar roles predeterminados');
            }
            
            // Eliminar el rol de todos los usuarios que lo tengan
            await User.updateMany(
                { roles: role.identifier },
                { $pull: { roles: role.identifier } }
            );
            
            // Eliminar el rol
            await CustomRole.findByIdAndDelete(roleId);
            return { success: true, message: 'Rol eliminado correctamente' };
        } catch (error) {
            console.error(`Error al eliminar rol personalizado con ID ${roleId}:`, error);
            throw error;
        }
    },
    
    // Inicializar roles predeterminados
    async initDefaultRoles() {
        try {
            // Verificar si ya existen los roles user y admin
            const userRole = await CustomRole.findOne({ identifier: 'custom-user' });
            const adminRole = await CustomRole.findOne({ identifier: 'custom-admin' });
            
            // Si no existen, crearlos
            const rolesToCreate = [];
            if (!userRole) {
                rolesToCreate.push({
                    name: 'Usuario Personalizado',
                    identifier: 'custom-user',
                    description: 'Rol de usuario personalizado con permisos básicos',
                    color: '#3498db',
                    isDefault: true
                });
            }
            
            if (!adminRole) {
                rolesToCreate.push({
                    name: 'Admin Personalizado',
                    identifier: 'custom-admin',
                    description: 'Rol de administrador personalizado con todos los permisos',
                    color: '#e74c3c',
                    isDefault: true
                });
            }
            
            // Crear los roles que faltan
            for (const roleData of rolesToCreate) {
                const role = new CustomRole(roleData);
                await role.save();
                console.log(`Rol predeterminado ${roleData.name} creado con éxito`);
            }
            
            return { success: true, message: 'Roles predeterminados inicializados correctamente' };
        } catch (error) {
            console.error('Error al inicializar roles predeterminados:', error);
            throw error;
        }
    }
};

module.exports = roleController; 