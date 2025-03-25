/**
 * Este script verifica si MongoDB está instalado y disponible
 * Para ejecutarlo: node verificar-mongodb.js
 */

const { MongoClient } = require('mongodb');

// URL de conexión a MongoDB en servidor remoto
// IMPORTANTE: Para autenticación, usa el formato:
// const url = 'mongodb://usuario:contraseña@pingadominga.es:27017';
const url = 'mongodb://pingadominga.es:27017';

// Nombre de la base de datos para pruebas
const dbName = 'chatapp';

// Función principal de verificación
async function verificarMongoDB() {
  console.log('🔍 Verificando conexión a MongoDB...');
  console.log(`URL: ${url}`);
  console.log(`Base de datos: ${dbName}`);
  console.log('-----------------------------------');
  
  let client;
  
  try {
    // Intentar conectar a MongoDB
    console.log('Conectando a MongoDB...');
    client = new MongoClient(url, { 
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000 
    });
    
    await client.connect();
    console.log('✅ Conexión exitosa a MongoDB!');
    
    // Verificar la base de datos
    const db = client.db(dbName);
    
    try {
      // Obtener información del servidor
      const adminDb = client.db('admin');
      const serverInfo = await adminDb.command({ serverStatus: 1 });
      console.log(`✅ Versión de MongoDB: ${serverInfo.version}`);
      console.log(`✅ Tiempo de actividad: ${Math.round(serverInfo.uptime / 60)} minutos`);
    } catch (authError) {
      console.log('⚠️ No se pudo obtener información del servidor: Requiere autenticación');
      console.log('Sin embargo, la conexión a la base de datos es posible.');
    }
    
    // Verificar colecciones
    try {
      const collections = await db.listCollections().toArray();
      
      if (collections.length > 0) {
        console.log(`✅ Base de datos "${dbName}" tiene ${collections.length} colección(es):`);
        collections.forEach(coll => {
          console.log(`   - ${coll.name}`);
        });
      } else {
        console.log(`⚠️ Base de datos "${dbName}" existe pero no tiene colecciones`);
      }
    } catch (collError) {
      console.log(`⚠️ No se pudo listar colecciones: ${collError.message}`);
    }
    
    // Probar inserción
    try {
      // Añadir dato de prueba
      const messagesCollection = db.collection('messages');
      const testMessage = {
        content: 'Mensaje de prueba desde verificador',
        sender: 'script-verificador',
        room: 'general',
        createdAt: new Date()
      };
      
      await messagesCollection.insertOne(testMessage);
      console.log('✅ Mensaje de prueba insertado correctamente');
    } catch (insertError) {
      console.log(`⚠️ No se pudo insertar mensaje: ${insertError.message}`);
      console.log('Es posible que necesites permisos de escritura en la base de datos');
    }
    
    console.log('\n✅ La conexión a MongoDB es posible!');
    
  } catch (error) {
    console.error('❌ Error al conectar con MongoDB:');
    console.error(error);
    
    // Ofrecer sugerencias según el error
    if (error.name === 'MongoServerSelectionError') {
      console.log('\n🛠️ Posibles soluciones:');
      console.log('1. Verifica que el servidor MongoDB en pingadominga.es está en funcionamiento');
      console.log('2. Comprueba tu conexión a Internet');
      console.log('3. Asegúrate de que los firewalls permiten la conexión al puerto 27017');
    } else if (error.code === 13 || error.message.includes('authentication')) {
      console.log('\n🛠️ Este servidor requiere autenticación:');
      console.log('1. Edita este script para incluir las credenciales en la URL:');
      console.log('   const url = \'mongodb://usuario:contraseña@pingadominga.es:27017\';');
      console.log('2. O actualiza el archivo .env.local con las credenciales correctas.');
    }
  } finally {
    // Cerrar la conexión
    if (client) {
      await client.close();
      console.log('Conexión a MongoDB cerrada');
    }
  }
}

// Ejecutar la verificación
verificarMongoDB().catch(console.error); 