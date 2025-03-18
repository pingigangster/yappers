const mongoose = require('mongoose');

// Configuración de la conexión a MongoDB
const MONGO_URI = 'mongodb://admin:patata123@pingadominga.es:27017/chatapp?authSource=admin';

// Opciones de conexión
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoIndex: true,
    serverSelectionTimeoutMS: 5000, // Tiempo de espera para selección de servidor
    socketTimeoutMS: 45000, // Tiempo de espera para operaciones de socket
    family: 4 // Usar IPv4, omitir para permitir IPv6
};

// Conectar a MongoDB
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGO_URI, options);
        console.log(`MongoDB conectado: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error al conectar a MongoDB: ${error.message}`);
        process.exit(1);
    }
};

// Eventos de conexión
mongoose.connection.on('connected', () => {
    console.log('Mongoose conectado');
});

mongoose.connection.on('error', (err) => {
    console.error(`Mongoose error de conexión: ${err}`);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose desconectado');
});

// Cerrar la conexión si la aplicación termina
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('Conexión a MongoDB cerrada por finalización de la aplicación');
    process.exit(0);
});

module.exports = connectDB; 