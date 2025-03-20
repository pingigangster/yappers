'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { initializeSocket, subscribeToMessages, sendMessage as socketSendMessage, disconnectSocket } from '@/lib/socketClient';

interface Message {
  _id: string;
  content: string;
  sender: {
    _id: string;
    name: string;
    email: string;
    image: string;
  };
  room: string;
  createdAt: string;
}

interface ChatContextType {
  messages: Message[];
  loading: boolean;
  error: string | null;
  currentRoom: string;
  sendMessage: (content: string) => void;
  changeRoom: (room: string) => void;
  fetchMessages: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string>('general');
  const [socketInitialized, setSocketInitialized] = useState(false);

  // Inicializar Socket.io cuando el usuario está autenticado
  useEffect(() => {
    if (user?.id && !socketInitialized) {
      try {
        const socket = initializeSocket(user.id);
        if (socket) {
          setSocketInitialized(true);
        }
      } catch (error) {
        console.error('Error al inicializar socket:', error);
        setError('Error al conectar con el chat. Por favor recarga la página.');
      }

      // Limpiar al desmontar
      return () => {
        try {
          disconnectSocket();
          setSocketInitialized(false);
        } catch (error) {
          console.error('Error al desconectar socket:', error);
        }
      };
    }
  }, [user?.id, socketInitialized]);

  // Suscribirse a nuevos mensajes
  useEffect(() => {
    if (user?.id && socketInitialized) {
      try {
        const unsubscribe = subscribeToMessages((newMessage: Message) => {
          setMessages((prevMessages) => [...prevMessages, newMessage]);
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error al suscribirse a mensajes:', error);
        setError('Error al recibir mensajes nuevos.');
      }
    }
  }, [user?.id, socketInitialized]);

  // Cargar mensajes iniciales
  useEffect(() => {
    if (user?.id) {
      fetchMessages();
    }
  }, [user?.id, currentRoom]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/messages?room=${currentRoom}`);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Error al cargar mensajes:', error);
      setError('Error al cargar mensajes. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (content: string) => {
    if (!user?.id || !content.trim() || !socketInitialized) {
      if (!socketInitialized) {
        setError('No se pudo conectar al chat. Por favor recarga la página.');
      }
      return;
    }
    
    try {
      // Optimistic update - añadir mensaje localmente antes de la confirmación
      const optimisticMessage: Message = {
        _id: Date.now().toString(),
        content,
        sender: {
          _id: user.id,
          name: user.name,
          email: user.email,
          image: user.image
        },
        room: currentRoom,
        createdAt: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Enviar mensaje a través de Socket.io
      socketSendMessage(content, currentRoom, user.id);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      setError('Error al enviar mensaje. Por favor intenta de nuevo.');
    }
  };

  const changeRoom = (room: string) => {
    if (room !== currentRoom) {
      setCurrentRoom(room);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        loading,
        error,
        currentRoom,
        sendMessage: handleSendMessage,
        changeRoom,
        fetchMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat debe ser usado dentro de un ChatProvider');
  }
  return context;
}; 