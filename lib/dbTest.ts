import connectDB from './mongodb';

// Función para probar la conexión a MongoDB
export async function testDBConnection() {
  try {
    const conn = await connectDB();
    if (conn && conn.readyState === 1) {
      console.log('✅ Conexión a MongoDB correcta. Servidor:', conn.host);
      return {
        success: true,
        message: 'Conexión a MongoDB correcta',
        details: {
          host: conn.host,
          name: conn.name,
          port: conn.port
        }
      };
    } else {
      console.error('❌ MongoDB no conectado. Estado:', conn?.readyState);
      return {
        success: false,
        message: 'MongoDB no está conectado',
        details: {
          readyState: conn?.readyState
        }
      };
    }
  } catch (error) {
    console.error('❌ Error al conectar con MongoDB:', error);
    return {
      success: false,
      message: 'Error al conectar con MongoDB',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Función para verificar si una colección existe
export async function checkCollection(collectionName: string) {
  try {
    const conn = await connectDB();
    const collections = await conn.db.listCollections().toArray();
    const collectionExists = collections.some(c => c.name === collectionName);
    
    console.log(`Colección ${collectionName}: ${collectionExists ? 'existe' : 'no existe'}`);
    
    return {
      success: true,
      exists: collectionExists,
      collection: collectionName
    };
  } catch (error) {
    console.error(`Error al verificar la colección ${collectionName}:`, error);
    return {
      success: false,
      exists: false,
      collection: collectionName,
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 