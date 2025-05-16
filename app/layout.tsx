import { AuthProvider } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import type { Metadata } from 'next';
import './globals.css'; // Asumiendo que existe este archivo de estilos

export const metadata: Metadata = {
  title: 'Chat App',
  description: 'Una aplicación de chat en tiempo real',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <ChatProvider>
            {children}
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
} 