'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Interfaz para el usuario
interface User {
  id: string;
  name: string;
  email: string;
  image: string;
}

// Interfaz para el contexto
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

// Crear el contexto
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Proveedor del contexto
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simular carga inicial de usuario
  useEffect(() => {
    // Aquí normalmente verificaríamos una sesión o token
    // Para esta demostración, usaremos un usuario de ejemplo
    const mockUser: User = {
      id: '123456',
      name: 'Usuario Demo',
      email: 'demo@ejemplo.com',
      image: 'https://via.placeholder.com/150',
    };

    setUser(mockUser);
    setLoading(false);
  }, []);

  // Función de inicio de sesión simulada
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Simular una verificación de credenciales
      if (email && password) {
        setUser({
          id: '123456',
          name: 'Usuario Demo',
          email: email,
          image: 'https://via.placeholder.com/150',
        });
        return true;
      } else {
        setError('Credenciales inválidas');
        return false;
      }
    } catch (error) {
      setError('Error al iniciar sesión');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Función de cierre de sesión
  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Hook personalizado para acceder al contexto
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}; 