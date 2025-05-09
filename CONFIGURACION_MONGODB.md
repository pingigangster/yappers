# Configuración de MongoDB para la Aplicación de Chat

## Resumen del problema
Se ha detectado que el servidor MongoDB en `pingadominga.es:27017` requiere autenticación, lo que impide que la aplicación se conecte correctamente para cargar los mensajes.

## Pasos para solucionar

### 1. Actualiza las credenciales en el archivo .env.local
Edita el archivo `.env.local` en la raíz del proyecto y actualiza la URL de MongoDB con el siguiente formato:

```
MONGODB_URI=mongodb://usuario:contraseña@pingadominga.es:27017/chatapp
```

Reemplaza `usuario` y `contraseña` con las credenciales correctas para tu servidor MongoDB.

### 2. Verifica la conexión
Una vez configuradas las credenciales, ejecuta el script de verificación:

```
node verificar-mongodb.js
```

Si la conexión es exitosa, deberías poder ver las colecciones e insertar mensajes de prueba.

### 3. Reinicia la aplicación
Después de actualizar las credenciales, reinicia el servidor Next.js:

```
npm run dev
```

## Diagnóstico de problemas

Si continúas experimentando problemas, puedes obtener más información accediendo a los endpoints de diagnóstico:

- `/api/debug`: Muestra información sobre el estado de la conexión y las colecciones
- `/api/seed`: Inicializa datos de prueba en la base de datos

## Estructura de la base de datos

La aplicación utiliza dos colecciones principales:
- `messages`: Almacena los mensajes del chat
- `users`: Almacena la información de los usuarios

Si necesitas más ayuda, contacta con el administrador del servidor MongoDB para obtener las credenciales correctas y los permisos necesarios. 