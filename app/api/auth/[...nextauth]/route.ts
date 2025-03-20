import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Contraseña', type: 'password' }
      },
      async authorize(credentials) {
        try {
          await connectDB();

          if (!credentials?.email || !credentials?.password) {
            throw new Error('Por favor ingresa email y contraseña');
          }

          const user = await User.findOne({ email: credentials.email }).select('+password');

          if (!user) {
            throw new Error('Email o contraseña incorrectos');
          }

          const isMatch = await bcrypt.compare(credentials.password, user.password);

          if (!isMatch) {
            throw new Error('Email o contraseña incorrectos');
          }

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            image: user.image
          };
        } catch (error) {
          console.error('Error en autenticación:', error);
          throw new Error(error instanceof Error ? error.message : 'Error en la autenticación');
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || 'tu-secreto-aqui',
  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST }; 