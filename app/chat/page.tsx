'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';

// Componente para el mensaje individual
const ChatMessage = ({ message, isCurrentUser }: { message: any; isCurrentUser: boolean }) => {
  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg ${
          isCurrentUser
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
        }`}
      >
        {!isCurrentUser && (
          <div className="font-bold text-sm mb-1">{message.sender.name}</div>
        )}
        <p className="text-sm">{message.content}</p>
        <div className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-100' : 'text-gray-500'}`}>
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

// Componente para los botones de sala
const RoomSelector = ({ rooms, currentRoom, onChangeRoom }: { 
  rooms: string[], 
  currentRoom: string, 
  onChangeRoom: (room: string) => void 
}) => {
  return (
    <div className="w-full bg-white shadow-md p-3 mb-4 rounded-lg">
      <h3 className="text-md font-bold text-gray-700 mb-2">Seleccionar sala:</h3>
      <div className="flex flex-wrap gap-2">
        {rooms.map((room) => (
          <button
            key={room}
            onClick={() => onChangeRoom(room)}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              currentRoom === room
                ? 'bg-blue-600 text-white shadow-md transform scale-105'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            #{room}
          </button>
        ))}
      </div>
    </div>
  );
};

export default function Chat() {
  const { user, loading: authLoading, logout } = useAuth();
  const { messages, loading: chatLoading, error: chatError, sendMessage, currentRoom, changeRoom, fetchMessages } = useChat();
  const [messageInput, setMessageInput] = useState('');
  const [availableRooms] = useState(['general', 'soporte', 'casual', 'tecnología']);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();

  // Redirigir si no está autenticado
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Intentar cargar los mensajes al iniciar o cambiar de sala
  useEffect(() => {
    if (user?.id) {
      fetchMessages().catch(err => {
        console.error('Error al cargar mensajes:', err);
      });
    }
  }, [user?.id, currentRoom, retryCount]);

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Función para manejar errores y reintentar
  const handleRetryFetch = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim()) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };

  const handleRoomChange = (room: string) => {
    changeRoom(room);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Barra superior */}
      <header className="bg-white shadow-sm py-4 px-6 flex justify-between items-center">
        <div className="flex items-center space-x-2">
        <h1 className="text-xl font-semibold text-gray-800">ChatApp</h1>
          <span className="text-sm text-gray-600 ml-2">Sala actual: <span className="font-medium text-blue-600">#{currentRoom}</span></span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            Hola, <span className="font-medium">{user.name}</span>
          </div>
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

        {/* Área de chat */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Selector de salas (visible en todas las pantallas) */}
        <RoomSelector 
          rooms={availableRooms} 
          currentRoom={currentRoom} 
          onChangeRoom={handleRoomChange} 
        />

          {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 bg-white rounded-lg shadow-md">
            {chatLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Cargando mensajes...</div>
              </div>
            ) : chatError ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-red-500 mb-4">{chatError}</div>
                <button 
                  onClick={handleRetryFetch}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Reintentar
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">No hay mensajes en esta sala. ¡Sé el primero en enviar uno!</div>
              </div>
            ) : (
              <div>
                {messages.map((message) => (
                  <ChatMessage
                    key={message._id}
                    message={message}
                    isCurrentUser={message.sender._id === user.id}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Formulario de entrada */}
        <div className="p-4 mt-4 bg-white rounded-lg shadow-md">
            <form onSubmit={handleSendMessage} className="flex">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
              placeholder={`Escribe un mensaje en #${currentRoom}...`}
                className="flex-1 border border-gray-300 rounded-l-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={chatLoading || !!chatError}
              />
              <button
                type="submit"
                disabled={!messageInput.trim() || chatLoading || !!chatError}
                className="bg-blue-600 text-white px-4 py-2 rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </form>
        </div>
      </div>
    </div>
  );
} 