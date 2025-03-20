import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';

// Usar una variable global para mantener la instancia de Socket.io
// @ts-ignore - necesario para variable global
declare global {
  var io: SocketIOServer | undefined;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { message: 'No autorizado' },
        { status: 401 }
      );
    }

    // Si el servidor ya está inicializado, devolver información
    if (global.io) {
      return NextResponse.json(
        { message: 'Socket.io server is running' },
        { status: 200 }
      );
    }

    // Obtener el objeto res de NextResponse
    const res: NextResponse = new NextResponse(
      JSON.stringify({ message: 'Socket server initialized' }),
      { status: 200 }
    );

    // Obtener el servidor HTTP subyacente
    const httpServer: NetServer = res.socket?.server as any;

    if (!httpServer) {
      return NextResponse.json(
        { message: 'Error al inicializar el servidor' },
        { status: 500 }
      );
    }

    // Inicializar Socket.io solo si no existe ya
    if (!global.io) {
      global.io = new SocketIOServer(httpServer, {
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
      });

      // Manejar conexiones
      global.io.on('connection', (socket) => {
        console.log('Cliente conectado:', socket.id);

        // Unirse a una sala
        socket.on('join-room', (room) => {
          socket.join(room);
          console.log(`Cliente ${socket.id} se unió a la sala ${room}`);
        });

        // Recibir mensaje
        socket.on('send-message', async (data) => {
          try {
            const { content, room, userId } = data;

            if (!content || !userId) {
              return;
            }

            await connectDB();

            // Guardar mensaje en la base de datos
            const message = await Message.create({
              content,
              sender: userId,
              room: room || 'general',
            });

            const populatedMessage = await Message.findById(message._id)
              .populate('sender', 'name email image')
              .lean();

            // Emitir mensaje a todos los clientes en la sala
            global.io.to(room || 'general').emit('new-message', populatedMessage);
          } catch (error) {
            console.error('Error al procesar mensaje:', error);
          }
        });

        // Manejar desconexión
        socket.on('disconnect', () => {
          console.log('Cliente desconectado:', socket.id);
        });
      });
    }

    return res;
  } catch (error) {
    console.error('Error en Socket.io:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
} 