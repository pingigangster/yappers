import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://pingadominga.es:27017/chatapp';

// Definir interface para caché global
interface MongooseCache {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
}

// Declarar la variable global para TypeScript
declare global {
  var mongoose: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  } | undefined;
}

// Inicializar la caché global
let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB(): Promise<mongoose.Connection> {
  // Si ya hay una conexión, devolverla
  if (cached.conn) {
    console.log('Usando conexión existente a MongoDB');
    return cached.conn;
  }

  // Si no hay una promesa de conexión en proceso, crearla
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // IPv4, avoid issues
      autoCreate: true, // Crear base de datos si no existe
      autoIndex: true, // Crear índices automáticamente
    };

    mongoose.set('strictQuery', true);

    console.log(`Conectando a MongoDB en: ${MONGODB_URI}`);

    cached.promise = mongoose.connect(MONGODB_URI, opts)
      .then((mongoose) => {
        console.log('✅ Conexión a MongoDB establecida');
        return mongoose.connection;
      })
      .catch((error) => {
        console.error('❌ Error conectando a MongoDB:', error);
        if (error.code === 13 || error.codeName === 'Unauthorized') {
          console.error('Error de autenticación: La conexión requiere usuario y contraseña');
          console.error('Actualiza MONGODB_URI en .env.local con el formato: mongodb://usuario:contraseña@pingadominga.es:27017/chatapp');
        }
        cached.promise = null;
        throw error;
      });
  } else {
    console.log('Esperando conexión a MongoDB existente...');
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    console.error('❌ Error al obtener la conexión a MongoDB:', e);
    cached.promise = null;
    throw e;
  }
}

// Crear colecciones si no existen
connectDB().then(async (conn) => {
  try {
    // Verificar si las colecciones existen y crearlas si no
    const collections = (await conn.db.listCollections().toArray()).map(c => c.name);
    
    if (!collections.includes('messages')) {
      console.log('Creando colección messages...');
      await conn.db.createCollection('messages');
    }
    
    if (!collections.includes('users')) {
      console.log('Creando colección users...');
      await conn.db.createCollection('users');
    }
    
    console.log('Colecciones verificadas/creadas');
  } catch (error) {
    console.error('Error al verificar/crear colecciones:', error);
  }
}).catch(err => {
  console.error('Error inicializando MongoDB:', err);
});

export default connectDB; 