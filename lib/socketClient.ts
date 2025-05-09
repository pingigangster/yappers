'use client';

import { io, Socket } from 'socket.io-client';

// Variable para mantener una única instancia del socket
let socket: Socket | null = null;

// Función para inicializar la conexión del socket
export const initializeSocket = (userId: string) => {
  // Si ya existe una conexión, la devolvemos
  if (socket && socket.connected) {
    return socket;
  }

  // Si había una conexión anterior pero está desconectada, intentamos reconectar
  if (socket) {
    socket.connect();
    return socket;
  }

  // Crear una nueva conexión
  try {
    socket = io({
      path: '/api/socket',
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Conectado al servidor de Socket.io. ID:', socket?.id);
      joinRoom('general');
    });

    socket.on('connect_error', (error) => {
      console.error('Error de conexión de Socket.io:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('Desconectado del servidor de Socket.io:', reason);
    });

    socket.on('error', (error) => {
      console.error('Error de Socket.io:', error);
    });

    return socket;
  } catch (error) {
    console.error('Error al inicializar Socket.io:', error);
    return null;
  }
};

// Función para unirse a una sala
export const joinRoom = (room: string) => {
  if (socket && socket.connected) {
    socket.emit('join-room', room);
    console.log(`Unido a la sala: ${room}`);
  } else {
    console.warn('No se puede unir a la sala, socket no conectado');
  }
};

// Función para enviar un mensaje
export const sendMessage = (content: string, room: string = 'general', userId: string) => {
  if (socket && socket.connected) {
    socket.emit('send-message', { content, room, userId });
  } else {
    console.warn('No se puede enviar mensaje, socket no conectado');
  }
};

// Función para suscribirse a nuevos mensajes
export const subscribeToMessages = (callback: (message: any) => void) => {
  if (socket) {
    socket.on('new-message', callback);

    return () => {
      if (socket) {
        socket.off('new-message', callback);
      }
    };
  }

  console.warn('No se puede suscribir a mensajes, socket no inicializado');
  return () => {};
};

// Función para desconectar el socket
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('Socket desconectado manualmente');
  }
}; 