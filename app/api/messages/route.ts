import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';

// Obtener mensajes
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const room = searchParams.get('room') || 'general';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Conectar a la base de datos
    try {
      await connectDB();
      console.log(`Conexión a MongoDB establecida para buscar mensajes en sala: ${room}`);
    } catch (dbError) {
      console.error('Error crítico al conectar a MongoDB:', dbError);
      return NextResponse.json({ 
        error: 'Error de conexión a la base de datos',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      }, { status: 503 });
    }

    console.log(`Buscando mensajes para la sala: ${room}, límite: ${limit}`);

    // Primero intentamos obtener mensajes con populate
    let messages = [];
    let populateSuccessful = false;
    
    try {
      messages = await Message.find({ room })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('sender', 'name email image')
        .lean();
      
      populateSuccessful = true;
      console.log(`Mensajes encontrados con populate: ${messages.length}`);
    } catch (populateError) {
      console.error('Error al poblar el sender, intentando sin populate:', populateError);
      
      try {
        // Si falla el populate, obtenemos los mensajes sin poblar
        messages = await Message.find({ room })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        
        console.log(`Mensajes encontrados sin populate: ${messages.length}`);
      } catch (findError) {
        console.error('Error crítico al buscar mensajes:', findError);
        return NextResponse.json({ 
          error: 'Error al buscar mensajes',
          details: process.env.NODE_ENV === 'development' ? findError.message : undefined
        }, { status: 500 });
      }
    }

    // Para los mensajes sin remitente adecuado, agregamos uno ficticio
    const processedMessages = messages.map(msg => {
      // Si el sender es un ObjectId y no un objeto, o si el populate falló
      if (!populateSuccessful || !msg.sender || typeof msg.sender !== 'object' || !msg.sender.name) {
        return {
          ...msg,
          sender: {
            _id: msg.sender || 'unknown',
            name: 'Usuario',
            email: 'unknown@example.com',
            image: 'https://via.placeholder.com/150'
          }
        };
      }
      return msg;
    });

    // Si no hay mensajes, devolver un array vacío con mensaje de depuración
    if (!processedMessages || processedMessages.length === 0) {
      console.log(`No se encontraron mensajes para la sala: ${room}`);
      return NextResponse.json([], { 
        status: 200,
        headers: {
          'X-Debug-Info': `No messages found for room: ${room}`
        }
      });
    }

    return NextResponse.json(processedMessages.reverse(), {
      headers: {
        'X-Debug-Info': `Found ${processedMessages.length} messages, populate ${populateSuccessful ? 'succeeded' : 'failed'}`
      }
    });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    return NextResponse.json(
      { 
        message: 'Error en el servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Crear mensaje
export async function POST(request: Request) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { message: 'No autorizado' },
        { status: 401 }
      );
    }

    const { content, room = 'general' } = await request.json();

    if (!content) {
      return NextResponse.json(
        { message: 'El mensaje no puede estar vacío' },
        { status: 400 }
      );
    }

    try {
      await connectDB();
      console.log('Conexión a MongoDB establecida para crear mensaje');
    } catch (dbError) {
      console.error('Error crítico al conectar a MongoDB para crear mensaje:', dbError);
      return NextResponse.json({ 
        error: 'Error de conexión a la base de datos',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      }, { status: 503 });
    }

    // Crear mensaje
    let message;
    try {
      message = await Message.create({
        content,
        sender: session.user.id,
        room,
      });
      console.log(`Mensaje creado con ID: ${message._id}`);
    } catch (createError) {
      console.error('Error al crear mensaje:', createError);
      return NextResponse.json({ 
        error: 'Error al crear el mensaje',
        details: process.env.NODE_ENV === 'development' ? createError.message : undefined
      }, { status: 500 });
    }

    // Intentar poblar el remitente
    try {
      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name email image')
        .lean();
        
      return NextResponse.json(populatedMessage, { status: 201 });
    } catch (populateError) {
      console.error('Error al poblar mensaje:', populateError);
      
      // Si falla el populate, devolver el mensaje sin poblar pero con un sender ficticio
      const messageObject = message.toObject ? message.toObject() : message;
      return NextResponse.json({
        ...messageObject,
        sender: {
          _id: session.user.id,
          name: session.user.name || 'Usuario',
          email: session.user.email || 'user@example.com',
          image: session.user.image || 'https://via.placeholder.com/150'
        }
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Error al crear mensaje:', error);
    return NextResponse.json(
      { 
        message: 'Error en el servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
} 