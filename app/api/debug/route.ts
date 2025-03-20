import { NextResponse } from 'next/server';
import { testDBConnection, checkCollection } from '@/lib/dbTest';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import mongoose from 'mongoose';

export async function GET() {
  try {
    // Información del sistema
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      mongoUri: process.env.MONGODB_URI || 'No definido'
    };

    // Probar conexión a MongoDB
    let dbStatus;
    try {
      dbStatus = await testDBConnection();
    } catch (e) {
      dbStatus = { error: String(e) };
    }

    // Verificar colecciones
    let collections = [];
    let userCount = 0;
    let messageCount = 0;
    let uuidStats = {
      usersWithUuid: 0,
      messagesWithUuid: 0
    };
    
    try {
      if (mongoose.connection.readyState === 1) {
        collections = await mongoose.connection.db.listCollections().toArray();
        collections = collections.map(col => col.name);
        
        // Contar usuarios con UUID
        if (collections.includes('users')) {
          userCount = await mongoose.connection.db.collection('users').countDocuments();
          uuidStats.usersWithUuid = await mongoose.connection.db.collection('users').countDocuments({ uuid: { $exists: true } });
        }
        
        // Contar mensajes con UUID
        if (collections.includes('messages')) {
          messageCount = await mongoose.connection.db.collection('messages').countDocuments();
          uuidStats.messagesWithUuid = await mongoose.connection.db.collection('messages').countDocuments({ uuid: { $exists: true } });
        }
      }
    } catch (err) {
      console.error('Error obteniendo colecciones:', err);
    }

    // Contar mensajes por sala
    let messageCounts = {};
    try {
      await connectDB();
      const counts = await Message.aggregate([
        { $group: { _id: '$room', count: { $sum: 1 } } }
      ]);
      messageCounts = counts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});
    } catch (e) {
      messageCounts = { error: String(e) };
    }

    // Estado de mongoose
    const mongooseStatus = {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      models: Object.keys(mongoose.models)
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      database: dbStatus,
      collections,
      messages: messageCounts,
      mongoose: mongooseStatus,
      userCount,
      uuidStats
    });
  } catch (error) {
    console.error('Error en el endpoint de debug:', error);
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 