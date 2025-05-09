const mongoose = require('mongoose');

// Configuración de la conexión a MongoDBa
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';

// Opciones de conexión mejoradas para archivos grandes
const options = {
    autoIndex: true,
    serverSelectionTimeoutMS: 10000, // Aumentado a 10 segundos
    socketTimeoutMS: 90000, // Aumentado a 90 segundos para transferencias grandes
    family: 4, // Usar IPv4
    maxPoolSize: 10, // Limitar el número de conexiones simultáneas
};

// Controlar las advertencias de deprecación de grid-fs-stream
mongoose.set('strictQuery', false);

// Conectar a MongoDB
const connectDB = async () => {
    try {
        // Asegurarnos de que la conexión no exista ya
        if (mongoose.connection.readyState === 1) {
            console.log('MongoDB ya está conectado');
            return mongoose.connection;
        }
        
        console.log('Conectando a MongoDB...');
        const conn = await mongoose.connect(MONGO_URI, options);
        console.log(`MongoDB conectado: ${conn.connection.host}`);
        
        return conn;
    } catch (error) {
        console.error(`Error al conectar a MongoDB: ${error.message}`);
        throw error;
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
    try {
        await mongoose.connection.close();
        console.log('Conexión a MongoDB cerrada por finalización de la aplicación');
        process.exit(0);
    } catch (error) {
        console.error('Error al cerrar conexión MongoDB:', error);
        process.exit(1);
    }
});

module.exports = connectDB; 