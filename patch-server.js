#!/usr/bin/env node

// Script para corregir automáticamente el error de sintaxis en server.js
const fs = require('fs');
const path = require('path');

console.log('Aplicando parche para corregir server.js...');

const serverFile = path.join(__dirname, 'server.js');

try {
    // Leer el archivo original
    let content = fs.readFileSync(serverFile, 'utf8');
    
    // Buscar la sección problemática (alrededor de la línea 42)
    // Utilizamos una expresión regular para encontrar la configuración de socketio
    const socketioConfigRegex = /const io = socketio\(server, \{[\s\S]*?}\);/m;
    
    if (socketioConfigRegex.test(content)) {
        console.log('Encontrada la sección problemática, aplicando corrección...');
        
        // Reemplazar con la versión corregida
        const correctedContent = content.replace(
            socketioConfigRegex,
            `// Opciones para Socket.io
const socketioOptions = {
    maxHttpBufferSize: 200e6, // Aumentar a 200 MB para permitir archivos multimedia más grandes
    pingTimeout: 60000, // Aumentar el tiempo de espera para detectar desconexiones (60 segundos)
    cors: {
        // Permitir conexiones desde la URL del túnel (obtenida de variable de entorno) o cualquier origen si no está definida.
        origin: process.env.CLOUDFLARE_TUNNEL_URL || "*",
        methods: ["GET", "POST"]
    }
};

// Inicializar Socket.io con las opciones
const io = socketio(server, socketioOptions);`
        );
        
        // Guardar el archivo corregido
        fs.writeFileSync(serverFile, correctedContent, 'utf8');
        console.log('¡Parche aplicado con éxito!');
    } else {
        console.log('No se encontró la sección problemática. El archivo podría estar ya corregido o tener un formato diferente.');
    }
} catch (error) {
    console.error('Error al aplicar el parche:', error);
    process.exit(1);
} 