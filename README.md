# Chat en Tiempo Real

Una aplicación web simple de chat en tiempo real creada con Node.js, Express y Socket.io.

## Características

- Mensajes en tiempo real
- Notificaciones de conexión/desconexión
- Interfaz de usuario responsiva y amigable

## Instalación

1. Clona este repositorio:
```
git clone <url-del-repositorio>
```

2. Instala las dependencias:
```
npm install
```

3. Inicia el servidor:
```
npm start
```

4. Abre tu navegador y visita:
```
http://localhost:3000
```

## Cómo funciona

- La aplicación utiliza Socket.io para manejar la comunicación en tiempo real entre los clientes y el servidor.
- Cuando un usuario envía un mensaje, este se transmite a todos los usuarios conectados.
- Los mensajes propios aparecen con un estilo diferente en el lado derecho.
- El sistema muestra notificaciones cuando los usuarios se conectan o desconectan.

## Tecnologías utilizadas

- Node.js
- Express
- Socket.io
- HTML/CSS/JavaScript
- Moment.js (para formateo de fechas) 