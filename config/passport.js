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
        // Buscar si el usuario ya existe
        let user = await userController.findUserByGoogleId(profile.id);
        
        if (user) {
            // Si el usuario existe, actualizar información
            console.log(`Usuario de Google encontrado: ${user.username}`);
            return done(null, user);
        }
        
        // Si no existe, crear un nuevo usuario
        console.log(`Nuevo usuario de Google: ${profile.displayName}`);
        
        // Crear datos de usuario
        const userData = {
            googleId: profile.id,
            username: profile.displayName || `user_${profile.id.substring(0, 8)}`,
            email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
            password: new mongoose.Types.ObjectId().toString(), // Generar una contraseña aleatoria
            role: 'user',
            emailVerified: true, // Verificado porque viene de Google
            image: profile.photos && profile.photos[0] ? profile.photos[0].value : null
        };
        
        // Crear nuevo usuario
        const newUser = await userController.createGoogleUser(userData);
        return done(null, newUser);
    } catch (error) {
        console.error('Error en autenticación con Google:', error);
        return done(error, null);
    }
}));

module.exports = passport; 