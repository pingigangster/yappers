// Añade estas funciones al objeto userController en db/controllers.js

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
} 