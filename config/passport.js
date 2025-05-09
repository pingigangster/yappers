const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { userController } = require('../db/controllers');
const mongoose = require('mongoose');

// Usar variables de entorno para las credenciales
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '995845570947-2i6f01kd8gvps905l18sjcop5ipsh2e5.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

// Serializar y deserializar usuario
passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser((id, done) => {
    userController.getUserById(id)
        .then(user => {
            done(null, user);
        })
        .catch(err => {
            done(err, null);
        });
});

// Configurar la estrategia de Google OAuth
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        // 1. Buscar si el usuario ya existe POR GOOGLE ID
        let user = await userController.findUserByGoogleId(profile.id);
        
        if (user) {
            // Si existe por Google ID, autenticarlo directamente
            console.log(`Usuario de Google encontrado por ID: ${user.username}`);
            return done(null, user);
        }

        // 2. SI NO existe por Google ID, VERIFICAR POR EMAIL
        const googleEmail = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
        if (googleEmail) {
            console.log(`Google ID no encontrado. Verificando si existe usuario con email: ${googleEmail}`);
            const existingUserByEmail = await userController.findUserByEmail(googleEmail);

            if (existingUserByEmail) {
                // Encontramos un usuario con ese email.
                // VERIFICAR SI TIENE GOOGLE ID:
                if (!existingUserByEmail.googleId) {
                    // ¡CONFLICTO! El usuario existe pero se registró localmente (sin Google ID).
                    console.warn(`Conflicto: Email ${googleEmail} ya registrado localmente. Bloqueando login/registro con Google.`);
                    return done(null, false, { message: 'Ya existe una cuenta registrada con este correo electrónico usando contraseña. Por favor, inicia sesión con tu contraseña.' });
                } else {
                    // El usuario existe por email Y TAMBIÉN tiene un Google ID (aunque diferente al actual? Raro, pero lo logueamos)
                    // Esto podría pasar si cambiaron su Google ID pero no el email. Lo ideal sería actualizar el Google ID aquí.
                    console.warn(`Advertencia: Usuario encontrado por email (${googleEmail}) pero su Google ID (${existingUserByEmail.googleId}) no coincidía con el actual (${profile.id}). Logueando de todas formas.`);
                     // Opcional: Actualizar el googleId si se desea
                    // existingUserByEmail.googleId = profile.id;
                    // await existingUserByEmail.save();
                    return done(null, existingUserByEmail); 
                }
            }
        }
        
        // 3. SI NO existe ni por Google ID ni por Email, CREAR NUEVO USUARIO vinculado a Google
        console.log(`Nuevo usuario de Google: ${profile.displayName}. Email: ${googleEmail}`);
        
        // Crear datos de usuario
        const userData = {
            googleId: profile.id,
            username: profile.displayName || `user_${profile.id.substring(0, 8)}`,
            email: googleEmail,
            password: new mongoose.Types.ObjectId().toString(), 
            role: 'user',
            image: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
        };
        
        // Crear nuevo usuario
        const newUser = await userController.createGoogleUser(userData);
        console.log(`Nuevo usuario de Google creado: ${newUser.username}`);
        return done(null, newUser);

    } catch (error) {
        console.error('Error en la estrategia de autenticación con Google:', error);
        return done(error, null);
    }
}));

module.exports = passport; 