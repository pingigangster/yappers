import { NextResponse } from 'next/server';
import { testDBConnection, checkCollection } from '@/lib/dbTest';

export async function GET() {
  try {
    // Probar la conexión a MongoDB
    const dbResult = await testDBConnection();
    
    // Verificar las colecciones
    const messageCollectionResult = await checkCollection('messages');
    const userCollectionResult = await checkCollection('users');
    
    return NextResponse.json({
      status: 'success',
      database: dbResult,
      collections: {
        messages: messageCollectionResult,
        users: userCollectionResult
      }
    });
  } catch (error) {
    console.error('Error en la prueba de base de datos:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Error al probar la conexión a la base de datos',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 