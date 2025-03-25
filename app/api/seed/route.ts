import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Crear un ID de usuario ficticio para los mensajes de prueba
const DUMMY_USER_ID = new mongoose.Types.ObjectId();
const DUMMY_USER_UUID = uuidv4();

// Datos de prueba para mensajes
const testMessages = [
  {
    uuid: uuidv4(),
    content: 'Hola, bienvenido a la sala general',
    sender: DUMMY_USER_ID,
    room: 'general',
    createdAt: new Date()
  },
  {
    uuid: uuidv4(),
    content: '¿Cómo puedo usar esta aplicación?',
    sender: DUMMY_USER_ID,
    room: 'general',
    createdAt: new Date(Date.now() - 5 * 60000) // 5 minutos antes
  },
  {
    uuid: uuidv4(),
    content: 'Necesito ayuda con mi cuenta',
    sender: DUMMY_USER_ID,
    room: 'soporte',
    createdAt: new Date()
  },
  {
    uuid: uuidv4(),
    content: '¿Alguien sabe cómo crear una nueva sala?',
    sender: DUMMY_USER_ID,
    room: 'soporte',
    createdAt: new Date(Date.now() - 10 * 60000) // 10 minutos antes
  },
  {
    uuid: uuidv4(),
    content: '¡Hola a todos!',
    sender: DUMMY_USER_ID,
    room: 'casual',
    createdAt: new Date()
  },
  {
    uuid: uuidv4(),
    content: '¿Qué tal vuestro día?',
    sender: DUMMY_USER_ID,
    room: 'casual',
    createdAt: new Date(Date.now() - 15 * 60000) // 15 minutos antes
  }
];

export async function GET() {
  try {
    // Conectar a la base de datos
    await connectDB();
    
    // Crear un usuario ficticio para los mensajes
    const dummyUser = {
      _id: DUMMY_USER_ID,
      uuid: DUMMY_USER_UUID,
      name: 'Usuario de Prueba',
      email: 'test@example.com',
      image: 'https://via.placeholder.com/150'
    };
    
    // Insertar mensajes de prueba
    await Message.insertMany(testMessages);
    
    // Obtener los mensajes insertados
    const messages = await Message.find({ sender: DUMMY_USER_ID });
    
    return NextResponse.json({
      success: true,
      message: `Se han creado ${messages.length} mensajes de prueba`,
      dummyUser,
      messages
    });
  } catch (error) {
    console.error('Error al crear datos de prueba:', error);
    return NextResponse.json({
      success: false,
      message: 'Error al crear datos de prueba',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 