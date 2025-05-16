// Función para escapar caracteres HTML especiales
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

const chatForm = document.getElementById('chat-form');
const chatMessages = document.querySelector('.chat-messages');
const usernameDisplay = document.getElementById('username-display');
const usersList = document.getElementById('users');
const mediaUpload = document.getElementById('media-upload');
const dropZone = document.getElementById('drop-zone');
const imgModal = document.getElementById('img-modal');
const modalContent = document.querySelector('.modal-content');
const closeBtn = document.querySelector('.close-btn');
const messageInput = document.getElementById('msg');
const logoutBtn = document.getElementById('logout-btn');
const currentRoomDisplay = document.getElementById('current-room');
const roomButtons = document.querySelectorAll('.room-btn');

// Variable para almacenar la sala actual
let currentRoom = 'general';

// Función para unirse a una sala
function joinRoom(room) {
    // Limpiar mensajes anteriores
    chatMessages.innerHTML = '';
    
    // Actualizar variable global de sala actual
    currentRoom = room;
    
    // Actualizar interfaz
    if (currentRoomDisplay) {
        currentRoomDisplay.textContent = room;
    }
    
    // Actualizar botones de sala
    if (roomButtons) {
        roomButtons.forEach(button => {
            if (button.dataset.room === room) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }
    
    // Destacar sala en la UI
    const roomSelector = document.querySelector('.rooms-selector');
    if (roomSelector) {
        // Agregar una animación sutil al cambiar de sala
        roomSelector.style.transition = 'all 0.3s ease';
        roomSelector.style.transform = 'scale(1.05)';
        setTimeout(() => {
            roomSelector.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Mostrar notificación del cambio de sala
    showTransferNotification(`Has cambiado a la sala: ${room}`, 'info');
    
    // Informar al servidor sobre el cambio de sala
    socket.emit('joinRoom', { room });
    
    // Solicitar mensajes de la sala
    socket.emit('getMessages', { room });
    
    console.log(`Unido a la sala: ${room}`);
}

// Configurar controladores de eventos para botones de sala
document.addEventListener('DOMContentLoaded', () => {
    const roomBtns = document.querySelectorAll('.room-btn');
    if (roomBtns) {
        roomBtns.forEach(button => {
            button.addEventListener('click', () => {
                const room = button.dataset.room;
                if (room !== currentRoom) {
                    joinRoom(room);
                }
            });
        });
    }
});

// Tamaño máximo para archivos multimedia (200 MB)
const MAX_FILE_SIZE = 200 * 1024 * 1024;
// Límite de caracteres para mensajes de texto
const MAX_MESSAGE_LENGTH = 200;

// Obtener el nombre de usuario de la variable global
let localUsername = window.username;

// Variables para controlar la frecuencia de envío de mensajes
let lastMessageTime = 0;
let messageQueue = [];
let messageProcessing = false;
let messageQueueTimerId = null; // <--- NUEVA VARIABLE GLOBAL
const MESSAGE_RATE_LIMIT = 500; // 500ms = 2 mensajes por segundo máximo
const MAX_QUEUE_SIZE = 10; // Máximo de mensajes en cola (aumentado a 10)
const COOLDOWN_TIME = 2000; // 2 segundos de cooldown
const BURST_MESSAGES_LIMIT = 6; // Número de mensajes rápidos antes de activar cooldown (CAMBIADO DE 10 a 6)

// Variables para control de ráfaga de mensajes
let messagesSentInBurst = 0;
let lastBurstResetTime = 0;
const BURST_RESET_TIME = 10000; // Tiempo para resetear el contador de ráfaga (10 segundos)

// Variable para el estado de cooldown
let isCooldown = false;
let cooldownTimer = null;
let sendButton = null;

// Variable para controlar las alertas de límite
let rateLimitAlertDisplayed = false;

// Cola de subida de archivos multimedia
let mediaUploadQueue = [];
let mediaUploadProcessing = false;

// Mostrar el nombre de usuario en la interfaz
if (usernameDisplay) {
    usernameDisplay.innerText = localUsername;
}

// Inicializar contador de caracteres
const setupCharacterCounter = () => {
    if (messageInput) {
        // Crear y añadir el contador de caracteres
        const counterContainer = document.createElement('div');
        counterContainer.className = 'char-counter';
        counterContainer.innerHTML = `<span>0</span>/${MAX_MESSAGE_LENGTH}`;
        
        // Insertar después del input
        messageInput.parentNode.appendChild(counterContainer);
        
        // Actualizar contador cuando se escribe
        messageInput.addEventListener('input', () => {
            const charCount = messageInput.value.length;
            const counter = counterContainer.querySelector('span');
            counter.textContent = charCount;
            
            // Cambiar color cuando se acerca al límite
            if (charCount > MAX_MESSAGE_LENGTH * 0.8) {
                counter.classList.add('warning');
            } else {
                counter.classList.remove('warning');
            }
            
            // Advertir cuando se alcanza el límite
            if (charCount > MAX_MESSAGE_LENGTH) {
                counter.classList.add('limit-exceeded');
                messageInput.classList.add('limit-exceeded');
            } else {
                counter.classList.remove('limit-exceeded');
                messageInput.classList.remove('limit-exceeded');
            }
        });
        
        // Limitar caracteres mientras se escribe
        messageInput.setAttribute('maxlength', MAX_MESSAGE_LENGTH);
    }
};

// Conectar al Socket.io con opciones
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
});

// Variables para el control de la carga
let messagesLoaded = false;
let usersLoaded = false;
let connectionEstablished = false;
let loadingTimeout = null;
let connectionTimeout = null;

// Avanzar en el progreso de carga
function updateLoadingProgress(percent, message) {
    // No llamamos a window.updateLoadingProgress para evitar recursión infinita
    console.log(`Actualizando progreso local: ${percent}% - ${message}`);
    
    // Accedemos directamente a los elementos DOM
    const progressBarElement = document.getElementById('progress-bar');
    const loadingStatusElement = document.getElementById('loading-status');
    const loadingScreenElement = document.getElementById('loading-screen');
    const chatContainerElement = document.getElementById('chat-container');
    
    if (progressBarElement) {
        progressBarElement.style.width = `${percent}%`;
    }
    
    if (loadingStatusElement && message) {
        loadingStatusElement.textContent = message;
    }
    
    // Si llega al 100%, después de un breve retraso, ocultar la pantalla de carga
    if (percent >= 100 && loadingScreenElement && chatContainerElement) {
        setTimeout(() => {
            console.log('Carga completada, mostrando interfaz...');
            loadingScreenElement.classList.add('hidden');
            chatContainerElement.classList.add('loaded');
        }, 500);
    }
}

// Comprobar si todo está cargado y mostrar el chat
function checkAllLoaded() {
    if (messagesLoaded && usersLoaded) {
        console.log('Carga completa: mensajes y usuarios cargados');
        updateLoadingProgress(100, '¡Listo! Entrando al chat...');
        
        // Si existe un timeout pendiente, lo cancelamos
        if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            loadingTimeout = null;
        }
    }
}

// Función para forzar la carga completa después de un tiempo máximo
function setupLoadingTimeout() {
    console.log('Configurando timeout de carga...');
    // Establecer un tiempo máximo de espera para la carga (10 segundos)
    loadingTimeout = setTimeout(() => {
        console.log('Tiempo máximo de carga alcanzado, mostrando interfaz...');
        console.log('Estado de carga - Mensajes cargados:', messagesLoaded, 'Usuarios cargados:', usersLoaded);
        
        if (!messagesLoaded) {
            console.warn('La carga de mensajes no completó, continuando de todos modos');
            messagesLoaded = true;
        }
        
        if (!usersLoaded) {
            console.warn('La carga de usuarios no completó, continuando de todos modos');
            usersLoaded = true;
            
            // Intentar mostrar al menos el usuario actual
            const defaultUserList = [{
                username: localUsername,
                id: socket.id
            }];
            displayUsers(defaultUserList);
        }
        
        // Mostrar la interfaz
        updateLoadingProgress(100, 'Tiempo de espera excedido, continuando...');
    }, 10000); // 10 segundos
}

// Control de sesión para mensajes de bienvenida
let isFirstVisit = false;
if (!localStorage.getItem('hasVisitedBefore')) {
    // Primera visita, guardar en localStorage
    localStorage.setItem('hasVisitedBefore', 'true');
    localStorage.setItem('username', localUsername);
    isFirstVisit = true;
} else if (localStorage.getItem('username') !== localUsername) {
    // Si el usuario cambió de nombre, considerarlo como nueva visita
    localStorage.setItem('username', localUsername);
    isFirstVisit = true;
}

// Actualizar progreso de carga
updateLoadingProgress(20, 'Conectando al servidor...');

// Configurar el timeout de carga
setupLoadingTimeout();

// Configurar un timeout para la conexión inicial
connectionTimeout = setTimeout(() => {
    console.error('No se pudo establecer conexión con el servidor en el tiempo esperado');
    updateLoadingProgress(100, 'Error de conexión, intentando continuar...');
}, 15000); // 15 segundos max para conectar

// Evento cuando se establece la conexión (nuevo)
socket.on('connectionEstablished', (data) => {
    console.log('Conexión inicial establecida:', data);
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    updateLoadingProgress(25, 'Conexión establecida, esperando datos...');
});

// Evento de confirmación de conexión exitosa completa
socket.on('connectionSuccess', (data) => {
    console.log('Conexión establecida correctamente:', data);
    connectionEstablished = true;
    updateLoadingProgress(35, 'Conexión establecida, cargando datos...');
    
    // Actualizar el nombre de usuario si es diferente
    if (data.username !== localUsername) {
        localUsername = data.username;
        usernameDisplay.innerText = localUsername;
    }
    
    // Mostrar imagen de perfil si está disponible
    if (data.userImage) {
        const userProfileIcon = document.querySelector('.user-profile i');
        if (userProfileIcon) {
            // Reemplazar el icono con la imagen de perfil
            const profileContainer = userProfileIcon.parentElement;
            userProfileIcon.remove();
            
            const profileImg = document.createElement('img');
            profileImg.src = data.userImage;
            profileImg.alt = 'Perfil';
            profileImg.className = 'profile-image';
            profileImg.style.width = '40px';
            profileImg.style.height = '40px';
            profileImg.style.borderRadius = '50%';
            profileImg.style.marginRight = '10px';
            
            profileContainer.prepend(profileImg);
        }
    }
});

// Unirse al chat (ahora con una secuencia específica y más logs)
setTimeout(() => {
    console.log('Enviando evento joinChat al servidor...');
    updateLoadingProgress(30, 'Solicitando datos del chat...');
    
    // Obtener token usando la función centralizada
    const tokenToSend = checkAuthToken();
    
    // Verificar el formato del token - debe ser una cadena JWT válida
    // Un JWT tiene la estructura: xxxx.yyyy.zzzz (tres partes separadas por puntos)
    if (tokenToSend) {
        const tokenParts = tokenToSend.split('.');
        if (tokenParts.length !== 3) {
            console.error('Error: El token no tiene un formato JWT válido (debe tener 3 partes)');
            alert('Error: El token de sesión no tiene un formato válido. Por favor, inicie sesión nuevamente.');
            window.location.href = '/login'; // Modificado
            return;
        } else {
            console.log('Token con formato JWT válido encontrado');
        }
        
        console.log('Intentando conectar con token JWT válido');
        
        // Enviar evento con token validado
        socket.emit('joinChat', { 
            token: tokenToSend,
            isFirstVisit: isFirstVisit
        });
        
        console.log('Evento joinChat enviado con token');
    } else {
        console.error('Error: No se encontró un token JWT válido para la autenticación');
        alert('No se encontró un token válido o el formato es incorrecto. Por favor, inicie sesión nuevamente.');
        window.location.href = '/login'; // Modificado
        return;
    }
}, 1000); // Pequeño retraso para mostrar la animación

// Obtener usuarios
socket.on('usersList', (users) => {
    console.log('Evento usersList recibido del servidor:', users);
    updateLoadingProgress(60, 'Recibiendo lista de usuarios...');
    
    // Verificar si los datos son válidos
    if (Array.isArray(users) && users.length > 0) {
        displayUsers(users);
        usersLoaded = true;
        checkAllLoaded();
    } else {
        console.error('Datos de usuarios inválidos:', users);
        // Crear una lista predeterminada solo con el usuario actual
        const defaultUserList = [{
            username: localUsername,
            id: socket.id
        }];
        displayUsers(defaultUserList);
        usersLoaded = true;
        checkAllLoaded();
    }
});

// Comprobar el token cada vez que se recarga la página
function checkAuthToken() {
    // Comprobar si hay un token en la URL (viene de autenticación con Google)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    let isNewTokenFromUrl = false; // Flag to indicate if we got a new token

    if (urlToken) {
        console.log('Token nuevo encontrado en la URL, guardando y limpiando URL.');
        localStorage.setItem('token', urlToken);
        
        // Actualizar la variable global
        window.token = urlToken;
        isNewTokenFromUrl = true; // Mark that we got a new token
        
        // Limpiar la URL (opcional) - FORZAR a /chat
        const targetPath = '/chat'; // <<-- Ruta explícita
        console.log(`Limpiando URL: Reemplazando por "${targetPath}"`);
        window.history.replaceState({}, document.title, targetPath); // <<-- Usar ruta explícita
    }
    
    // Devolver el token existente (ya sea de la URL o de localStorage)
    const currentToken = window.token || localStorage.getItem('token');

    // *** NUEVO: Si acabamos de obtener un token de la URL, iniciar conexión ***
    if (isNewTokenFromUrl && currentToken) {
        console.log('Iniciando conexión de chat con el nuevo token de la URL...');
        // Asegurarse de que el socket esté conectado o intentando conectar
        if (socket.disconnected) {
            socket.connect();
        }
        // Emitir joinChat una vez conectado (o si ya lo estaba)
        // Es importante esperar a la conexión si estaba desconectado
        if (socket.connected) {
             socket.emit('joinChat', { token: currentToken, isFirstVisit: true });
             console.log('Evento joinChat enviado inmediatamente con token de URL.');
        } else {
            socket.once('connect', () => {
                socket.emit('joinChat', { token: currentToken, isFirstVisit: true });
                console.log('Evento joinChat enviado tras conexión con token de URL.');
            });
        }
    }

    return currentToken;
}

// Al inicio, obtener el token y si no existe, redirigir a login
const initialToken = checkAuthToken();
if (!initialToken) {
    console.log('No se encontró token inicial, redirigiendo a login.');
    console.log('URL de redirección: /login');
    window.location.href = '/login'; // Modificado: asegurarse de no tener .html
} else {
    // Si ya hay un token (de localStorage, no de URL), emitir joinChat aquí
    // Esto cubre el caso de recargar la página cuando ya estabas logueado
    // Asegurarse de no emitir dos veces si ya se hizo por token de URL
    if (!new URLSearchParams(window.location.search).has('token') && socket.connected) {
         console.log('Token encontrado en localStorage, iniciando conexión de chat...');
         socket.emit('joinChat', { token: initialToken, isFirstVisit: false });
         console.log('Evento joinChat enviado con token de localStorage.');
    } else if (!new URLSearchParams(window.location.search).has('token') && socket.disconnected) {
        socket.once('connect', () => {
            console.log('Token encontrado en localStorage, iniciando conexión de chat tras conexión de socket...');
            socket.emit('joinChat', { token: initialToken, isFirstVisit: false });
            console.log('Evento joinChat enviado tras conexión con token de localStorage.');
        });
        socket.connect(); // Asegurarse de conectar si estaba desconectado
    }
}

// Añadir un evento para reconexiones por si se pierde la conexión
socket.on('reconnect', () => {
    console.log('Reconectado al servidor, solicitando datos actualizados...');
    
    // Comprobar si hay un nuevo token
    const tokenToSend = checkAuthToken();
    
    if (tokenToSend) {
        socket.emit('joinChat', { 
            token: tokenToSend,
            isFirstVisit: false 
        });
        console.log('Evento joinChat enviado para reconexión con token');
    } else {
        console.error('No se encontró token para la reconexión');
        // Intentar reconectar con solo el nombre de usuario como último recurso
        socket.emit('joinChat', { 
            username: localUsername, 
            isFirstVisit: false 
        });
        console.log('Evento joinChat enviado para reconexión sin token (solo username)');
    }
});

// Escuchar por desconexión forzada (admin eliminó la cuenta)
socket.on('forceDisconnect', (data) => {
    console.log('Desconexión forzada recibida:', data);
    // Mostrar alerta antes de redireccionar
    alert(data.message || 'Tu cuenta ha sido eliminada por el administrador');
    // Redireccionar a la página de inicio
    console.log('URL de redirección: /login');
    window.location.href = '/login'; // Modificado: asegurarse de no tener .html
});

// Escuchar por errores de inicio de sesión
socket.on('joinError', (data) => {
    console.log('Error al unirse al chat:', data);
    // Mostrar alerta antes de redireccionar
    alert(data.message || 'Error al unirse al chat. Por favor, inténtalo de nuevo.');
    // Redireccionar a la página de inicio
    console.log('URL de redirección: /login');
    window.location.href = '/login'; // Modificado: asegurarse de no tener .html
});

// Escuchar por mensajes de texto del servidor
socket.on('message', message => {
    console.log(message);
        outputMessage(message);
        scrollToBottom();
});

// Escuchar por mensajes con archivos multimedia
socket.on('mediaMessage', message => {
    console.log('Archivo multimedia recibido:', message);
        outputMediaMessage(message);
        scrollToBottom();
});

// Escuchar mensajes históricos (cargados desde la base de datos)
socket.on('historicalMessages', messages => {
    console.log('Evento historicalMessages recibido del servidor. Cantidad:', messages ? messages.length : 'undefined');
    updateLoadingProgress(40, `Cargando ${messages.length} mensajes...`);
    
    // Limpiar los mensajes existentes para evitar duplicados
    chatMessages.innerHTML = '';
    
    // Mostrar cada mensaje en la interfaz con un progreso
    let processedCount = 0;
    const batchSize = 10; // Procesar mensajes en lotes para mejorar rendimiento
    const totalMessages = messages.length;
    
    function processBatch(startIdx) {
        const endIdx = Math.min(startIdx + batchSize, totalMessages);
        
        for (let i = startIdx; i < endIdx; i++) {
            const message = messages[i];
            
            // Para los mensajes históricos, comparamos el nombre de usuario en lugar del socket.id
            // para determinar si el mensaje fue enviado por el usuario actual
            if (message.username === localUsername) {
                // Si el mensaje es del usuario actual, forzamos el userId a ser el socket.id actual
                // para que se aplique el estilo "self"
                message.userId = socket.id;
            }
            
            // Añadir mensaje al DOM sin mostrar todavía
            if (message.mediaId) { // <-- Usar mediaId para identificar mensajes multimedia
                outputMediaMessage(message, false); // Pasar false para no hacer scroll todavía
    } else {
                outputMessage(message, false); // Pasar false para no hacer scroll todavía
            }
            
            processedCount++;
            
            // Actualizar progreso
            const percent = 40 + Math.floor((processedCount / totalMessages) * 40); // 40%-80%
            updateLoadingProgress(percent, `Procesando mensajes... (${processedCount}/${totalMessages})`);
        }
        
        // Si aún hay mensajes por procesar, programar el siguiente lote
        if (endIdx < totalMessages) {
            setTimeout(() => processBatch(endIdx), 0);
        } else {
            // Todos los mensajes han sido procesados
            updateLoadingProgress(80, 'Finalizando carga de mensajes...');
            messagesLoaded = true;
            
            // Hacer scroll hasta el final ahora que todos los mensajes están cargados
            setTimeout(() => {
                scrollToBottom();
                checkAllLoaded();
            }, 100);
        }
    }
    
    // Comenzar a procesar el primer lote
    if (totalMessages > 0) {
        setTimeout(() => processBatch(0), 0);
    } else {
        // No hay mensajes que cargar
        updateLoadingProgress(80, 'No hay mensajes previos.');
        messagesLoaded = true;
        checkAllLoaded();
    }
});

// Escuchar evento de eliminación de mensajes (desde el panel de administrador)
socket.on('messagesDeleted', data => {
    console.log('📢 Evento messagesDeleted recibido:', data);
    
    if (data.type === 'all') {
        console.log('🔄 Recargando página debido a eliminación de mensajes...');
        
        // Mostrar una breve notificación antes de recargar
        const notificacion = document.createElement('div');
        notificacion.style.position = 'fixed';
        notificacion.style.top = '50%';
        notificacion.style.left = '50%';
        notificacion.style.transform = 'translate(-50%, -50%)';
        notificacion.style.background = 'rgba(0, 0, 0, 0.8)';
        notificacion.style.color = 'white';
        notificacion.style.padding = '20px';
        notificacion.style.borderRadius = '5px';
        notificacion.style.zIndex = '9999';
        notificacion.style.textAlign = 'center';
        notificacion.innerHTML = `
            <p style="margin: 0; font-size: 18px;">Los mensajes han sido eliminados por el administrador</p>
            <p style="margin: 10px 0 0 0; font-size: 14px;">Recargando la página...</p>
        `;
        document.body.appendChild(notificacion);
        
        // Forzar la recarga de la página después de un breve retraso
        setTimeout(() => {
            console.log('🔁 Forzando recarga de página...');
            window.location.href = window.location.href;
        }, 1000);
    }
});

// Función para mostrar alerta de límite de mensajes
function showRateLimitAlert() {
    if (!rateLimitAlertDisplayed) {
        rateLimitAlertDisplayed = true;
        // Usar notificación no bloqueante en lugar de alert()
        showTransferNotification(
            'Estás enviando mensajes demasiado rápido. Por favor, espera un momento.',
            'warning' // Usar tipo 'warning' para un estilo adecuado
        );
        
        // Resetear el estado de la alerta después de un tiempo
        setTimeout(() => {
            rateLimitAlertDisplayed = false;
        }, 3000); // Mantener el mismo timeout para evitar spam de notificaciones
    }
}

// Función para verificar si se puede añadir un mensaje a la cola
function canAddToQueue() {
    // Si la cola está llena, no permitir más mensajes
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
        showRateLimitAlert();
        return false;
    }
    
    return true;
}

// Función para procesar la cola de mensajes
function processMessageQueue() {
    if (messageQueue.length === 0) {
        messageProcessing = false;
        messageQueueTimerId = null; // Limpiar ID del temporizador
        return;
    }
    
    messageProcessing = true;
    
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    // Si no ha pasado suficiente tiempo desde el último mensaje, esperar
    if (timeSinceLastMessage < MESSAGE_RATE_LIMIT) {
        messageQueueTimerId = setTimeout(processMessageQueue, MESSAGE_RATE_LIMIT - timeSinceLastMessage); // Asignar ID
        return;
    }
    
    // Procesar el siguiente mensaje en la cola
    const message = messageQueue.shift();
    
    // Crear un mensaje local para mostrar feedback inmediato al usuario (¡SIN RELOJ!)
    const tempMsgDiv = addTempMessage(message);
    
    // Emitir mensaje al servidor con callback para confirmar recepción
    // CORREGIDO: Enviamos texto y sala como propiedades separadas, no como un objeto anidado
    socket.emit('chatMessage', { text: message, room: currentRoom }, (response) => {
        if (response && response.success) {
            // Mensaje guardado correctamente.
            // El mensaje temporal ya fue añadido como 'confirmed' y sin reloj.
            // No necesitamos hacer nada más aquí visualmente para el remitente.
            // El mensaje real llegará a través del evento 'message' si es necesario actualizar algo.
            console.log(`Mensaje confirmado por el servidor: ${response.messageId}`);
            if (tempMsgDiv) {
                // Opcional: añadir un ID al div temporal si queremos referenciarlo luego
                tempMsgDiv.dataset.messageId = response.messageId;
            }
        } else {
            // Error al guardar mensaje
            console.error('Error al guardar mensaje:', response ? response.error : 'No response');
            if (tempMsgDiv) {
                // Indicar visualmente el error en el mensaje temporal
                tempMsgDiv.classList.remove('confirmed');
                tempMsgDiv.classList.add('error');
                tempMsgDiv.title = response?.error || 'Error al enviar';
            }
        }
    });
    
    console.log(`Mensaje enviado en sala ${currentRoom}: ${message.substring(0, 20)}${message.length > 20 ? '...' : ''}`);
    
    // Actualizar tiempo del último mensaje
    lastMessageTime = Date.now();
    
    // Si quedan mensajes en la cola, programar el siguiente procesamiento
    if (messageQueue.length > 0) {
        messageQueueTimerId = setTimeout(processMessageQueue, MESSAGE_RATE_LIMIT); // Asignar ID
    } else {
        messageProcessing = false;
        messageQueueTimerId = null; // Limpiar ID del temporizador
    }
}

// Función para añadir mensaje (simplificada para NUNCA mostrar reloj)
function addTempMessage(message) {
    const div = document.createElement('div');
    // Añadir solo las clases esenciales. 'confirmed' se añade de inmediato.
    div.classList.add('message', 'self', 'fade-in', 'confirmed'); 
    
    // HTML mínimo sin posibilidad de reloj o indicador
    const innerHtml = `
        <p class="meta">${escapeHTML(localUsername)} <span>${moment().format('HH:mm')}</span></p>
        <div class="content">
            <p class="text-content">${escapeHTML(message)}</p>
        </div>
    `;
    
    div.innerHTML = innerHtml;
    
    document.querySelector('.chat-messages').appendChild(div);
    
    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 1); // Reducido de 10ms
    
    scrollToBottom();
    return div; // Devolvemos el div por si el callback de error necesita marcarlo
}

// Función para iniciar el cooldown
function startCooldown() {
    if (cooldownTimer) {
        clearTimeout(cooldownTimer);
    }
    
    isCooldown = true;
    
    // Deshabilitar botón de envío
    if (!sendButton) {
        sendButton = document.querySelector('#chat-form button[type="submit"]');
    }
    
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.classList.add('cooldown');
        sendButton.innerHTML = '<i class="fas fa-hourglass-half"></i> Espera...';
    }
    
    // Establecer temporizador para finalizar el cooldown
    cooldownTimer = setTimeout(() => {
        endCooldown();
    }, COOLDOWN_TIME);
}

// Función para finalizar el cooldown
function endCooldown() {
    isCooldown = false;
    
    // Rehabilitar botón de envío
    if (sendButton) {
        sendButton.disabled = false;
        sendButton.classList.remove('cooldown');
        sendButton.innerHTML = 'Enviar';
    }
    
    // Resetear contador de mensajes en ráfaga después del cooldown
    messagesSentInBurst = 0;
    lastBurstResetTime = Date.now();
    
    cooldownTimer = null;
}

// Función para verificar si se debe activar el cooldown
function shouldActivateCooldown() {
    const now = Date.now();
    
    // Si ha pasado mucho tiempo desde el último mensaje,
    // resetear el contador de ráfaga
    if (now - lastBurstResetTime > BURST_RESET_TIME) {
        messagesSentInBurst = 0;
        lastBurstResetTime = now;
        return false;
    }
    
    // Incrementar contador de mensajes en ráfaga
    messagesSentInBurst++;
    
    // Verificar si se ha alcanzado el límite de mensajes en ráfaga
    if (messagesSentInBurst >= BURST_MESSAGES_LIMIT) {
        console.log(`Límite de ráfaga alcanzado (${BURST_MESSAGES_LIMIT} mensajes). Activando cooldown.`);
        return true;
    }
    
    return false;
}

// Enviar mensaje
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // No hacer nada si estamos en cooldown
    if (isCooldown) {
        showRateLimitAlert(); // Esta alerta es por cooldown, no por cola llena.
        return;
    }

    // Obtener texto del mensaje
    const msg = e.target.elements.msg.value.trim();

    if (msg !== '') {
        // Verificar si podemos añadir el mensaje a la cola
        // canAddToQueue() llamará a showRateLimitAlert() si la cola está llena.
        if (!canAddToQueue()) {
            // Si la cola está llena (MAX_QUEUE_SIZE alcanzado), 
            // canAddToQueue ya mostró la alerta. 
            // Simplemente no añadimos este mensaje, pero la cola existente y su 
            // procesamiento continúan después de cerrar la alerta.
            console.log('Message queue (text) is full. Current message not added. Queue processing continues.');
            return; 
        }
        
        // Verificar si el mensaje excede el límite de caracteres
        const finalMsg = msg.length > MAX_MESSAGE_LENGTH 
            ? msg.substring(0, MAX_MESSAGE_LENGTH) 
            : msg;
        
        if (msg.length > MAX_MESSAGE_LENGTH) {
            // Opcional: Mostrar una notificación
            alert(`El mensaje excede el límite de ${MAX_MESSAGE_LENGTH} caracteres. Se enviará truncado.`);
        }
        
        // Añadir mensaje a la cola
        messageQueue.push(finalMsg);
        
        // Iniciar procesamiento si no está en curso
        if (!messageProcessing) {
            processMessageQueue();
        }

        // Limpiar input
        e.target.elements.msg.value = '';
        e.target.elements.msg.focus();
        
        // Actualizar el contador a 0
        const counter = document.querySelector('.char-counter span');
        if (counter) counter.textContent = '0';
        
        // Verificar si se debe activar el cooldown
        if (shouldActivateCooldown()) {
            startCooldown();
        }
    }
});

// Manejar la tecla Enter para evitar enviar mensajes durante el cooldown
messageInput.addEventListener('keydown', (e) => {
    // Si es Enter y estamos en cooldown, prevenir la acción predeterminada
    if (e.key === 'Enter' && !e.shiftKey && isCooldown) {
        e.preventDefault();
        showRateLimitAlert();
    }
});

// Manejar subida de archivos multimedia mediante botón
mediaUpload.addEventListener('change', (e) => {
    console.log('Evento change en input de archivo detectado');
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        console.log('Archivo seleccionado:', file.name, file.size, file.type);
        // Usar un timeout para asegurar que no se bloquee la UI
        setTimeout(() => {
            handleMediaUpload(file);
        }, 100);
    }
});

// Manejar arrastrar y soltar archivos
chatMessages.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
});

chatMessages.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!e.relatedTarget || !chatMessages.contains(e.relatedTarget)) {
        dropZone.classList.remove('active');
    }
});

// Mover el evento 'drop' al contenedor de mensajes en lugar del dropZone
chatMessages.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    
    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        handleMediaUpload(file);
    }
});

// Eliminar el evento drop del dropZone que causa conflicto
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
});

// Manejar pegar imágenes (Ctrl+V)
document.addEventListener('paste', (e) => {
    // Verificar si estamos en el campo de texto o si está enfocado
    if (document.activeElement === messageInput || e.target === messageInput) {
        const items = e.clipboardData.items;
        
        if (!items) return;
        
        // Buscar una imagen en el portapapeles
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                // Encontramos una imagen
                const file = items[i].getAsFile();
                
                // Mostrar indicador visual de que se detectó una imagen
                messageInput.style.boxShadow = "0 0 0 2px var(--secondary-color)";
                
                // Después de un breve retraso, restaurar el estilo
                setTimeout(() => {
                    messageInput.style.boxShadow = "";
                }, 500);
                
                // Procesar la imagen
                handleMediaUpload(file);
                
                // Prevenir comportamiento por defecto (como pegar texto)
                e.preventDefault();
                break;
            }
        }
    }
});

// Modal para ver archivos multimedia ampliados
document.addEventListener('click', (e) => {
    // Verificar si es una imagen o video
    if (e.target.classList.contains('media-content')) {
        const mediaElement = e.target.cloneNode(true);
        
        // Limpiar el contenido anterior
        modalContent.innerHTML = '';
        
        // Añadir el elemento al modal
        modalContent.appendChild(mediaElement);
        
        // Si es un video, configurarlo para reproducirse
        if (mediaElement.tagName === 'VIDEO') {
            mediaElement.controls = true;
            mediaElement.autoplay = true;
            mediaElement.classList.add('modal-video');
        }
        
        imgModal.classList.add('active');
    }
    
    // Verificar si es un botón de descarga para evitar conflictos
    if (e.target.closest('.download-btn') || e.target.classList.contains('download-btn')) {
        e.stopPropagation();
    }
});

closeBtn.addEventListener('click', () => {
    imgModal.classList.remove('active');
    
    // Detener videos si están reproduciéndose
    const videoElements = modalContent.querySelectorAll('video');
    videoElements.forEach(video => {
        video.pause();
    });
    
    // Limpiar el contenido
    setTimeout(() => {
        modalContent.innerHTML = '';
    }, 300);
});

// Añadir HTML para la barra de progreso
function setupProgressBar() {
    // Crear contenedor para la barra de progreso (ahora solo como referencia, no se mostrará)
    const progressContainer = document.createElement('div');
    progressContainer.className = 'upload-progress-container';
    progressContainer.style.display = 'none'; // Siempre oculto
    
    // Crear la barra de progreso (ya no se usará)
    progressContainer.innerHTML = `
        <div class="upload-progress">
            <div class="upload-progress-bar" style="width: 0%"></div>
        </div>
        <div class="upload-progress-text">Preparando archivo...</div>
    `;
    
    // Añadir al cuerpo del documento
    document.body.appendChild(progressContainer);
    
    return progressContainer;
}

// Variable global para el contenedor de progreso
const progressContainer = setupProgressBar();
// Cambiamos el nombre para evitar conflicto con la variable global progressBar
const uploadProgressBar = progressContainer.querySelector('.upload-progress-bar');
const progressText = progressContainer.querySelector('.upload-progress-text');

// Función para procesar la cola de mensajes multimedia
function processMediaUploadQueue() {
    if (mediaUploadQueue.length === 0) {
        mediaUploadProcessing = false;
        return;
    }
    
    mediaUploadProcessing = true;
    
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    // Si no ha pasado suficiente tiempo desde el último mensaje, esperar
    if (timeSinceLastMessage < MESSAGE_RATE_LIMIT) {
        setTimeout(processMediaUploadQueue, MESSAGE_RATE_LIMIT - timeSinceLastMessage);
        return;
    }
    
    // Procesar el siguiente archivo en la cola
    const nextUpload = mediaUploadQueue.shift();
    
    // Procesar el archivo
    handleMediaUploadInternal(nextUpload.file, nextUpload.text);
    
    // Actualizar tiempo del último mensaje
    lastMessageTime = Date.now();
    
    // Si quedan archivos en la cola, programar el siguiente procesamiento
    if (mediaUploadQueue.length > 0) {
        setTimeout(processMediaUploadQueue, MESSAGE_RATE_LIMIT);
    } else {
        mediaUploadProcessing = false;
    }
}

// Función principal de manejo de medios (control de cola)
function handleMediaUpload(file) {
    console.log('Iniciando handleMediaUpload con archivo:', file ? file.name : 'ninguno');
    
    if (!file) {
        console.error('No se proporcionó un archivo válido');
        return;
    }
    
    // No hacer nada si estamos en cooldown
    if (isCooldown) {
        showRateLimitAlert();
        return;
    }
    
    if (file.size > MAX_FILE_SIZE) {
        alert(`El archivo es demasiado grande. El tamaño máximo es ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
        return;
    }
    
    // Verificar si podemos añadir el archivo a la cola
    if (mediaUploadQueue.length >= MAX_QUEUE_SIZE) {
        showRateLimitAlert();
        return; // No seguir si no podemos añadir más archivos
    }
    
    // Obtener texto del campo de mensaje
    const text = document.getElementById('msg').value.trim();
    
    // Añadir a la cola de carga de medios
    mediaUploadQueue.push({ file, text });
    console.log(`Archivo añadido a la cola: ${file.name}, ${formatFileSize(file.size)}`);
    
    // Limpiar el campo de mensaje
    document.getElementById('msg').value = '';
    
    // Actualizar el contador si existe
    const counter = document.querySelector('.char-counter span');
    if (counter) counter.textContent = '0';
    
    // Iniciar procesamiento si no está en curso
    if (!mediaUploadProcessing) {
        processMediaUploadQueue();
    }
    
    // Verificar si se debe activar el cooldown
    if (shouldActivateCooldown()) {
        startCooldown();
    }
}

// Función interna que realmente procesa el archivo (MODIFICADA)
function handleMediaUploadInternal(file, text) {
    try {
        console.log('Procesando archivo de tamaño:', formatFileSize(file.size));
        
        const fileType = getFileType(file);
        console.log('Tipo de archivo detectado:', fileType);
        
        // Crear el mensaje temporal inmediatamente
        const tempDiv = document.createElement('div');
        tempDiv.classList.add('message', 'self', 'fade-in', 'uploading-message');
        
        // HTML simplificado para el estado de subida
        tempDiv.innerHTML = `
            <p class="meta">${escapeHTML(localUsername)} <span>${moment().format('HH:mm')}</span></p>
            <div class="content">
                ${text ? `<p class="text-content">${escapeHTML(text)}</p>` : ''}
                <div class="media-container">
                    <div class="file-container">
                        <div class="file-upload-info">
                            <div class="file-upload-header">
                                <i class="fas fa-spinner fa-spin"></i> <!-- Icono de carga -->
                                <strong>Subiendo archivo</strong>
                            </div>
                            <div class="file-details">
                                <span class="file-name">${escapeHTML(file.name)}</span>
                                <span class="file-size">${formatFileSize(file.size)}</span>
                            </div>
                            <div class="upload-status">Procesando...</div> <!-- Estado simple -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.querySelector('.chat-messages').appendChild(tempDiv);
        tempDiv.classList.add('active');
        scrollToBottom();
        
        const uploadStatus = tempDiv.querySelector('.upload-status');
        const uploadIcon = tempDiv.querySelector('.file-upload-header i');
        
        function handleUploadError(errorMessage) {
            console.error('Error en la carga:', errorMessage);
            if (tempDiv) {
            tempDiv.classList.add('error');
                if (uploadStatus) uploadStatus.textContent = `Error: ${errorMessage}`;
                if (uploadIcon) {
                    uploadIcon.classList.remove('fa-spinner', 'fa-spin');
                    uploadIcon.classList.add('fa-exclamation-triangle');
                }
                 setTimeout(() => {
                     if (tempDiv && tempDiv.parentNode) {
                         tempDiv.remove();
                     }
                 }, 5000);
            }
        }
        
        function completeUpload() {
            console.log('Carga completada en el cliente (mensaje temporal eliminado)');
            if (tempDiv) {
                tempDiv.remove();
            }
            showTransferNotification(`Archivo "${file.name}" subido correctamente`, 'success');
        }
        
            const reader = new FileReader();
            
            reader.onload = function(e) {
             console.log('Archivo leído como ArrayBuffer, enviando al servidor...');
             if (uploadStatus) uploadStatus.textContent = 'Enviando...';
                
             const fileBuffer = e.target.result; 

                const messageData = {
                 fileBuffer: fileBuffer,
                    text: text,
                    fileType: fileType,
                    fileName: file.name,
                    fileSize: file.size
                };
                
                const uploadTimeout = setTimeout(() => {
                    handleUploadError('No se recibió respuesta del servidor. Inténtelo de nuevo.');
             }, 120000);
                
                socket.emit('mediaMessage', messageData, (response) => {
                    clearTimeout(uploadTimeout);
                 console.log('Respuesta del servidor (mediaMessage - simple upload):', response);

                 if (response && response.success && response.confirmedMessage) {
                     completeUpload();
                            console.log('Renderizando mensaje multimedia confirmado para el remitente');
                            outputMediaMessage(response.confirmedMessage);
                     scrollToBottom();
                        } else {
                     handleUploadError(response?.error || 'Error al procesar archivo en el servidor');
                    }
                });
            };
            
            reader.onerror = function(error) {
            console.error('Error al leer archivo como ArrayBuffer:', error);
            handleUploadError('Error al leer el archivo localmente');
            };
            
            try {
             reader.readAsArrayBuffer(file);
            } catch (error) {
                console.error('Error al iniciar la lectura del archivo:', error);
                handleUploadError('Error al iniciar la lectura del archivo');
        }

        // // Función para cargar archivos pequeños (ELIMINADA)
        // function uploadRegularFile() { /* ... REMOVE ENTIRE FUNCTION ... */ }

        // // IMPLEMENTACIÓN REDISEÑADA para cargar archivos grandes (ELIMINADA)
        // function uploadLargeFile() {
        //    /* ... REMOVE ENTIRE FUNCTION and its helpers like:
        //       generateUniqueId, initializeUploadSession, uploadNextChunks, uploadChunk,
        //       handleChunkError, canContinueWithoutChunk, finalizeUpload, scheduleStatusCheck,
        //       getCompletedCount, getCompletedChunks, calculateProgress, isUploadComplete,
        //       checkCompletion, calculateChecksum
        //    */
        //}
        
    } catch (generalError) {
        console.error('Error general en handleMediaUploadInternal:', generalError);
        alert('Ha ocurrido un error inesperado al intentar subir el archivo.');
    }
}

// Función para detectar el tipo de archivo
function getFileType(file) {
    // Obtener la extensión del archivo
    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();
    
    // Logging para debug
    console.log('Archivo a procesar:', {
        nombre: fileName,
        extension: fileExt,
        tipo: file.type,
        tamaño: formatFileSize(file.size)
    });
    
    // Determinar el tipo de archivo
    if (file.type.startsWith('image/')) {
        return fileName.endsWith('.gif') ? 'gif' : 'image';
    } else if (file.type.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'flv', 'mkv', '3gp'].includes(fileExt)) {
        console.log('Video detectado por tipo MIME o extensión');
        return 'video';
    } else if (file.type.startsWith('audio/')) {
        return 'audio';
    } else if (fileExt === 'pdf') {
        return 'pdf';
    } else if (['doc', 'docx'].includes(fileExt)) {
        return 'word';
    } else if (['xls', 'xlsx'].includes(fileExt)) {
        return 'excel';
    } else if (['ppt', 'pptx'].includes(fileExt)) {
        return 'powerpoint';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExt)) {
        return 'archive';
    } else if (['txt', 'rtf', 'md', 'log', 'json', 'xml', 'csv'].includes(fileExt)) {
        return 'text';
    } else if (['html', 'htm', 'css', 'js', 'ts', 'jsx', 'php', 'py', 'java', 'c', 'cpp', 'cs'].includes(fileExt)) {
        return 'code';
    } else {
        // Intentar determinar el tipo por MIME si está disponible
        if (file.type && file.type !== 'application/octet-stream') {
            const mimeType = file.type.split('/')[0];
            if (['image', 'video', 'audio'].includes(mimeType)) {
                return mimeType;
            }
        }
        
        // Verificar extensiones adicionales para videos pequeños
        if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'flv', 'mkv', '3gp'].includes(fileExt)) {
            console.log('Video detectado por segunda verificación de extensión');
            return 'video';
        }
        
        // Si no se puede determinar, usar "file" como fallback
        return 'file';
    }
}

// Mostrar usuarios en el DOM
function displayUsers(users) {
    console.log('Mostrando usuarios en el DOM:', users);
    
    // Verificar que tenemos el elemento de la lista
    if (!usersList) {
        console.error('Elemento usersList no encontrado en el DOM');
        return;
    }
    
    usersList.innerHTML = '';
    
    try {
        users.forEach(user => {
            const li = document.createElement('li');
            li.innerHTML = `${user.username}`;
            
            // Resaltar el usuario actual
            if (user.id === socket.id) {
                li.classList.add('current-user');
            }
            
            usersList.appendChild(li);
        });
        
        // Añadir contador de usuarios conectados
        const usersCount = document.querySelector('.sidebar h3');
        if (usersCount) {
            usersCount.textContent = `Usuarios Conectados (${users.length})`;
        }
    } catch (error) {
        console.error('Error al mostrar usuarios:', error);
    }
}

// Mostrar mensaje de texto en el DOM (modificado para marcar sala actual)
function outputMessage(message, doScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', 'fade-in');
    
    // Comprobar si el mensaje es del usuario actual
    if (message.userId === socket.id || message.username === localUsername) {
        div.classList.add('self');
    }
    
    // Marcar mensajes de la sala actual
    if (message.room === currentRoom) {
        div.classList.add('current-room-message');
    }
    
    const safeUsername = escapeHTML(message.username);
    const safeTime = escapeHTML(message.time);
    const safeText = escapeHTML(message.text);
    const safeRoom = message.room ? `<span class="message-room">${escapeHTML(message.room)}</span>` : '';

    // Formatear el mensaje con datos sanitizados
    div.innerHTML = `
        <p class="meta">${safeUsername} ${safeRoom} <span>${safeTime}</span></p>
        <p class="text">${safeText}</p>
    `;
    
    // Añadir el mensaje al contenedor
    document.querySelector('.chat-messages').appendChild(div);
    
    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 1); // Reducido de 10ms
    
    if (doScroll) {
        scrollToBottom();
    }
}

// Mostrar mensaje con archivo multimedia en el DOM (también modificado para marcar sala actual)
function outputMediaMessage(message, doScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', 'fade-in');

    // Determinar si el mensaje es propio
    const isSelf = message.username === localUsername;
    if (isSelf) {
        div.classList.add('self');
    }
    
    // Marcar mensajes de la sala actual
    if (message.room === currentRoom) {
        div.classList.add('current-room-message');
    }

    // Crear el contenido multimedia en función del tipo
    let mediaContent = '';
    let mediaUrl = ''; // URL para visualización/reproducción
    let downloadUrl = ''; // URL específica para descarga

    // Construir la URL base usando mediaId
    if (message.mediaId) {
         // Usar /api/stream para reproducción y /api/download para descarga
         mediaUrl = `/api/stream/${message.mediaId}`;
         downloadUrl = `/api/download/${message.mediaId}`;
    } else {
         console.error("Error: Mensaje multimedia sin mediaId:", message);
    }

    // Preparar datos del botón de descarga (usa downloadUrl)
    const getDownloadButton = (effectiveDownloadUrl, fileName, title) => {
        // <<< SIMPLIFICAR: Siempre usar la URL de descarga pasada si existe >>>
        // const finalDownloadUrl = (isVideo || message.fileType === 'audio') && mediaId ? `/api/download/${mediaId}` : url;
        return `<a href="${effectiveDownloadUrl || '#'}" class="download-btn" download="${fileName || 'archivo'}"
                 title="${title}">
                <i class="fas fa-cloud-download-alt"></i>
               </a>`;
    };

    // Renderizar contenido multimedia según el tipo (usa mediaUrl)
    if (message.fileType === 'image' || message.fileType === 'gif') {
        mediaContent = `
            <div class="image-container">
                <img src="${mediaUrl}" alt="${message.fileType === 'image' ? 'Imagen' : 'GIF'} compartida" class="media-content">
            </div>
        `;
    } else if (message.fileType === 'video') {
        // Usar siempre la ruta de streaming con el mediaId para videos
        const preloadAttr = message.isSmallVideo ? 'preload="auto"' : 'preload="metadata"';

        mediaContent = `
            <div class="video-container">
                <div class="video-wrapper">
                    <video src="${mediaUrl}" class="media-content" ${preloadAttr} controls></video>
                    <div class="video-play-icon">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            </div>
        `;
    } else if (message.fileType === 'audio') {
        // Similar para audio, usar /api/stream si es de GridFS
        const audioSrc = message.mediaId ? `/api/stream/${message.mediaId}` : message.media;
        mediaContent = `
            <div class="audio-container">
                <audio controls src="${audioSrc}" preload="metadata"></audio>
            </div>
        `;
    } else {
        // Archivos genéricos (PDF, DOC, etc.)
        let fileIcon = 'fa-file';

        // Seleccionar icono según el tipo de archivo
        switch (message.fileType) {
            case 'pdf': fileIcon = 'fa-file-pdf'; break;
            case 'word': fileIcon = 'fa-file-word'; break;
            case 'excel': fileIcon = 'fa-file-excel'; break;
            case 'powerpoint': fileIcon = 'fa-file-powerpoint'; break;
            case 'archive': fileIcon = 'fa-file-archive'; break;
            case 'text': fileIcon = 'fa-file-alt'; break;
            case 'code': fileIcon = 'fa-file-code'; break;
        }

        const fileSize = message.fileSize ? formatFileSize(message.fileSize) : 'Desconocido';

        // Crear contenedor de archivo
            mediaContent = `
            <div class="file-container">
                        <div class="file-info">
                            <i class="fas ${fileIcon} file-icon"></i>
                            <div class="file-details">
                        <span class="file-name">${message.fileName || 'Archivo'}</span>
                        <span class="file-size">${fileSize}</span>
                        </div>
                    </div>
                </div>
            `;
    }

    // Título del botón de descarga
    const downloadTitle = `Descargar ${message.fileType === 'image' ? 'imagen' :
                          message.fileType === 'gif' ? 'GIF' :
                          message.fileType === 'video' ? 'video' :
                          message.fileType === 'audio' ? 'audio' : 'archivo'}`;

    // Construir el botón de descarga (la URL de descarga se gestiona en getDownloadButton)
    const downloadButton = getDownloadButton(
        downloadUrl, // <-- Pasar la URL /api/download/:id 
        message.fileName,
        downloadTitle
        // Ya no se necesitan los argumentos isVideo ni mediaId aquí
    );

    const safeRoom = message.room ? `<span class="message-room">${escapeHTML(message.room)}</span>` : '';

    div.innerHTML = `
        <div class="message-header">
            <p class="meta">${message.username} ${safeRoom} <span>${message.time}</span></p>
            <div class="download-btn-container">
                ${downloadButton}
            </div>
        </div>
        <div class="content">
            ${message.text ? `<p class="text-content">${escapeHTML(message.text)}</p>` : ''}
            <div class="media-container">
                ${mediaContent}
            </div>
        </div>
    `;

    document.querySelector('.chat-messages').appendChild(div);

    // Si es un video, manejar eventos de reproducción
    const video = div.querySelector('video');
    const playIcon = div.querySelector('.video-play-icon');

    if (video && playIcon) {
        // Ocultar el icono cuando se inicia la reproducción
        video.addEventListener('play', function() {
            playIcon.style.opacity = '0';
        });

        // Mostrar el icono cuando el video se pausa o termina
        video.addEventListener('pause', function() {
            playIcon.style.opacity = '0.8';
        });
         video.addEventListener('ended', function() {
            playIcon.style.opacity = '0.8';
        });
        
        // Manejo especial para videos pequeños
        if (message.isSmallVideo) {
            // Para videos pequeños forzar carga completa antes de reproducir
            video.addEventListener('canplaythrough', function onCanPlayThrough() {
                console.log('Video pequeño listo para reproducción continua');
                // Agregar clase para indicar que está completamente cargado
                video.classList.add('small-video-loaded');
                // Eliminar este listener después de la primera ejecución
                video.removeEventListener('canplaythrough', onCanPlayThrough);
            });
            
            // Contador de intentos de reproducción fallidos
            let playbackFailCount = 0;
            const maxPlaybackAttempts = 2;
            
            // Detectar errores de reproducción
            video.addEventListener('error', function(e) {
                console.error('Error al cargar video pequeño:', e);
                playbackFailCount++;
                
                if (playbackFailCount <= maxPlaybackAttempts) {
                    console.log(`Intento ${playbackFailCount}/${maxPlaybackAttempts} para reproducir video`);
                    
                    if (message.mediaId) {
                        // Primero intentar con la ruta especial para videos pequeños
                        if (playbackFailCount === 1) {
                            console.log('Intentando con ruta de video pequeño optimizada');
                            video.src = `/api/stream-small/${message.mediaId}`;
                        } 
                        // Si todavía falla, intentar con manejo especial
                        else if (playbackFailCount === 2) {
                            console.log('Intentando con manejo especial para videos problemáticos');
                            video.src = `/api/stream-small/${message.mediaId}?forceFull=true`;
                            
                            // Añadir un indicador visual de carga
                            const videoContainer = video.closest('.video-container');
                            if (videoContainer && !videoContainer.querySelector('.special-loading')) {
                                const loadingIndicator = document.createElement('div');
                                loadingIndicator.className = 'special-loading';
                                loadingIndicator.innerHTML = `
                                    <div class="special-loading-spinner"></div>
                                    <div class="special-loading-text">Cargando video en modo alternativo...</div>
                                `;
                                videoContainer.appendChild(loadingIndicator);
                                
                                // Eliminar indicador cuando el video pueda reproducirse
                                video.addEventListener('canplay', function removeLoadingOnce() {
                                    if (loadingIndicator) {
                                        loadingIndicator.remove();
                                    }
                                    video.removeEventListener('canplay', removeLoadingOnce);
                                });
                            }
                        }
                    }
                } else {
                    // Si se excede el número de intentos, mostrar mensaje de error
                    const videoContainer = video.closest('.video-container');
                    if (videoContainer) {
                        videoContainer.innerHTML = `
                            <div class="video-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>No se pudo reproducir este video</p>
                                <button class="retry-video-btn" data-media-id="${message.mediaId}">
                                    <i class="fas fa-sync-alt"></i> Reintentar
                                </button>
                                <a href="/api/download/${message.mediaId}" class="download-video-btn" download target="_blank">
                                    <i class="fas fa-download"></i> Descargar video
                                </a>
                            </div>
                        `;
                        
                        // Agregar listener para el botón de reintento
                        const retryBtn = videoContainer.querySelector('.retry-video-btn');
                        if (retryBtn) {
                            retryBtn.addEventListener('click', function() {
                                const mediaId = this.getAttribute('data-media-id');
                                if (mediaId) {
                                    // Reemplazar el contenedor con un nuevo video
                                    videoContainer.innerHTML = `
                                        <div class="video-wrapper">
                                            <video src="/api/stream-small/${mediaId}?forceFull=true&t=${Date.now()}" 
                                                class="media-content" preload="auto" controls></video>
                                            <div class="video-play-icon">
                                                <i class="fas fa-play"></i>
                                            </div>
                                            <div class="special-loading">
                                                <div class="special-loading-spinner"></div>
                                                <div class="special-loading-text">Cargando video en modo alternativo...</div>
                                            </div>
                                        </div>
                                    `;
                                    
                                    // Recuperar la nueva referencia al video
                                    const newVideo = videoContainer.querySelector('video');
                                    const newLoadingIndicator = videoContainer.querySelector('.special-loading');
                                    
                                    // Configurar nuevos event listeners
                                    if (newVideo) {
                                        newVideo.addEventListener('canplay', function() {
                                            if (newLoadingIndicator) {
                                                newLoadingIndicator.remove();
                                            }
                                        });
                                        
                                        newVideo.addEventListener('play', function() {
                                            const newPlayIcon = videoContainer.querySelector('.video-play-icon');
                                            if (newPlayIcon) {
                                                newPlayIcon.style.opacity = '0';
                                            }
                                        });
                                        
                                        const newPlayIcon = videoContainer.querySelector('.video-play-icon');
                                        if (newPlayIcon) {
                                            newPlayIcon.addEventListener('click', function(e) {
                                                if (newVideo.paused) {
                                                    newVideo.play().catch(err => console.error("Error al reproducir video:", err));
                                                } else {
                                                    newVideo.pause();
                                                }
                                                e.stopPropagation();
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            });
        }

        // También controlar la reproducción al hacer clic en el icono
        playIcon.addEventListener('click', function(e) {
            if (video.paused) {
                video.play().catch(err => console.error("Error al reproducir video:", err)); // Añadir catch
            } else {
                video.pause();
            }
            e.stopPropagation(); // Evitar que el clic se propague
        });
    }
    
    // Asegurarse de que los enlaces en el texto se abran en una nueva pestaña
    const textLinks = div.querySelectorAll('.text-content a');
    textLinks.forEach(link => {
        if (link.href && !link.href.startsWith('javascript:')) { // Evitar modificar javascript:void(0) u otros
             link.target = '_blank';
             link.rel = 'noopener noreferrer';
        }
    });


    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 1); // Reducido de 10ms

    // Solo hacer scroll si se solicita
    if (doScroll) {
        scrollToBottom();
    }
}

// Formatear tamaño de archivo para mostrar
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Añadir manejador de eventos para descargas de archivos grandes
function setupDownloadHandlers() {
    // Delegación de eventos para los clics en botones de descarga
    document.addEventListener('click', function(e) {
        // Verificar si se hizo clic en un botón de descarga
        if (e.target.closest('.download-btn') || e.target.closest('.external-download-btn')) {
            const downloadLink = e.target.closest('.download-btn') || e.target.closest('.external-download-btn');
            const downloadUrl = downloadLink.getAttribute('href');
            const isVideo = downloadLink.getAttribute('data-is-video') === 'true';
            const mediaId = downloadLink.getAttribute('data-media-id');
            
            // Verificar si es una descarga de archivo grande desde GridFS
            if (downloadUrl && (downloadUrl.startsWith('/api/download/') || downloadUrl.startsWith('/api/files/'))) {
                e.preventDefault();
                
                // Mostrar indicador de progreso de descarga
                const messageElement = downloadLink.closest('.message');
                
                // Solo proceder si encontramos el elemento del mensaje
                if (messageElement) {
                    // Crear o actualizar indicador de descarga
                    let downloadIndicator = messageElement.querySelector('.download-indicator');
                    
                    if (!downloadIndicator) {
                        downloadIndicator = document.createElement('div');
                        downloadIndicator.className = 'download-indicator';
                        downloadIndicator.innerHTML = `
                            <div class="download-progress">
                                <div class="download-progress-bar" style="width: 0%"></div>
                            </div>
                            <div class="download-status">Iniciando descarga optimizada...</div>
                        `;
                        
                        // Encontrar el contenedor para insertar el indicador
                        const container = isVideo ? 
                            messageElement.querySelector('.video-container') : 
                            messageElement.querySelector('.file-container, .audio-container');
                            
                        if (container) {
                            container.appendChild(downloadIndicator);
                        }
                    }
                    
                    const progressBar = downloadIndicator.querySelector('.download-progress-bar');
                    const statusText = downloadIndicator.querySelector('.download-status');
                    
                    // Cambiar estilo del botón
                    downloadLink.classList.add('downloading');
                    
                    // Determinar la URL adecuada para la descarga
                    // Para videos, usar la ruta de descarga especial para evitar problemas de streaming
                    const effectiveUrl = isVideo && mediaId ? 
                        `/api/download/${mediaId}?optimized=true` : 
                        `${downloadUrl}?optimized=true`;
                    
                    // Iniciar descarga con Fetch API para mejor rendimiento y soporte de streaming
                    statusText.textContent = 'Iniciando descarga optimizada...';
                    progressBar.style.width = '5%';
                    
                    fetch(effectiveUrl, {
                        method: 'GET',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': '*/*'
                        }
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Error HTTP: ${response.status}`);
                        }
                        
                        // Obtener el tamaño total del archivo
                        const contentLength = response.headers.get('Content-Length');
                        const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
                        const fileName = getFileNameFromResponse(response) || 
                                        downloadLink.getAttribute('download') || 
                                        'archivo_descargado';
                        
                        // Actualizar interfaz
                        progressBar.style.width = '10%';
                        statusText.textContent = `Descargando ${fileName}...`;
                        
                        // Crear un lector de la respuesta para manejar streaming
                        const reader = response.body.getReader();
                        let receivedLength = 0;
                        const chunks = [];
                        
                        // Función para procesar los chunks a medida que llegan
                        return new Promise((resolve, reject) => {
                            function processChunk({ done, value }) {
                                if (done) {
                                    return resolve(new Blob(chunks));
                                }
                                
                                // Agregar el fragmento recibido al array
                                chunks.push(value);
                                receivedLength += value.length;
                                
                                // Calcular y mostrar el progreso
                                let percent = totalSize ? 
                                    Math.min(99, 10 + Math.round((receivedLength / totalSize) * 89)) : // Ajustar para llegar casi a 100%
                                    // Si no sabemos el tamaño total, estimar un progreso más suave
                                    Math.min(99, 10 + Math.round(((chunks.length / 100) % 1) * 89)); // Progreso más lineal si no hay tamaño
                                
                                // Asegurarse de que percent sea un número válido
                                percent = Math.max(0, Math.min(99, Math.round(Number(percent) || 0)));

                                // Actualizar la barra visual
                                progressBar.style.width = `${percent}%`; 
                                
                                // Formatear tamaños y actualizar el texto del estado
                                const formattedReceived = formatFileSize(receivedLength);
                                if (totalSize > 0) {
                                    const formattedTotal = formatFileSize(totalSize);
                                    statusText.textContent = `${formattedReceived} / ${formattedTotal} (${percent}%)`; 
                                } else {
                                    statusText.textContent = `${formattedReceived}... (${percent}%)`; 
                                }
                                
                                // Continuar leyendo
                                return reader.read().then(processChunk);
                            }
                            
                            // Iniciar la lectura
                            reader.read().then(processChunk).catch(reject);
                        });
                    })
                    .then(blob => {
                        // Descarga completada, actualizar UI
                        progressBar.style.width = '100%';
                        statusText.textContent = '¡Descarga completada! Guardando archivo...';
                        
                        // Crear URL para el blob
                            const url = window.URL.createObjectURL(blob);
                            
                            // Crear elemento de enlace temporal para forzar la descarga
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            
                        // Obtener el nombre del archivo
                            a.download = downloadLink.getAttribute('download') || 'archivo_descargado';
                            
                            // Añadir al DOM, hacer clic y luego eliminar
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            
                        // Actualizar UI final
                            statusText.textContent = '¡Descarga completada!';
                        statusText.classList.add('success-message');
                            downloadLink.classList.remove('downloading');
                        
                        // Mostrar notificación de descarga completada
                        showTransferNotification(`Archivo "${a.download}" descargado correctamente`, 'success');
                            
                            // Limpiar el indicador después de un tiempo
                            setTimeout(() => {
                                if (downloadIndicator && downloadIndicator.parentNode) {
                                    downloadIndicator.parentNode.removeChild(downloadIndicator);
                                }
                            }, 3000);
                    })
                    .catch(error => {
                        console.error('Error en la descarga:', error);
                        statusText.textContent = `Error: ${error.message}`;
                            downloadLink.classList.remove('downloading');
                    });
                }
            }
        }
    });
}

// Función auxiliar para obtener el nombre de archivo de la respuesta HTTP
function getFileNameFromResponse(response) {
    // Intentar obtener el nombre del archivo del encabezado Content-Disposition
    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition) {
        // Buscar filename= o filename*= en el encabezado Content-Disposition
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);
        if (matches && matches[1]) {
            // Limpiar comillas si existen
            return matches[1].replace(/['"]/g, '');
        }
    }
    
    // Si no encontramos el nombre en headers, intentar extraerlo de la URL
    const url = new URL(response.url);
    const pathSegments = url.pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];
    
    // Eliminar parámetros de consulta si existen
    return lastSegment.split('?')[0] || null;
}

// Llamar a la función setupDownloadHandlers cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', setupDownloadHandlers);

// Función para hacer scroll al final del chat
function scrollToBottom() {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
}

// Inicializar el contador de caracteres
setupCharacterCounter();

// Función para cerrar sesión
function logout() {
    console.log('Cerrando sesión...');
    
    // Llamar a la API de logout
    fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        console.log('Respuesta de logout:', data);
        
        // Limpiar datos de sesión en localStorage
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        
        // Si hay socket activo, desconectar
        if (socket && socket.connected) {
            socket.disconnect();
        }
        
        // Redirigir a la página de inicio
        console.log('URL de redirección tras logout exitoso: /login');
        window.location.href = '/login'; // Modificado: asegurarse de no tener .html
    })
    .catch(error => {
        console.error('Error al cerrar sesión:', error);
        // Incluso si hay error, limpiar localStorage y redirigir
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        console.log('URL de redirección tras error en logout: /login');
        window.location.href = '/login'; // Modificado: asegurarse de no tener .html
    });
}

// Agregar evento de clic al botón de logout
    if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
        logout();
    });
}

// Modificar el servidor para añadir callback en chatMessage
// En server.js, modificar el evento 'chatMessage' para incluir callback
// Agregar estilo para mensajes pendientes y confirmados
document.head.insertAdjacentHTML('beforeend', `
<style>
    /* REGLA CONTUNDENTE: Ocultar CUALQUIER icono de reloj en mensajes propios */
    .message.self .fa-clock {
        display: none !important;
    }

    .message.pending {
        opacity: 1; /* Mostrar siempre con opacidad completa */
    }
    .message.pending .status-indicator,
    .message.confirmed .status-indicator,
    .message.error .status-indicator {
        display: none !important; /* Ocultar siempre todos los indicadores de estado */
    }
    
    /* Estilos mejorados para indicadores de transferencia */
    .upload-progress, .download-progress {
        height: 8px;
        background-color: rgba(0,0,0,0.1);
        border-radius: 4px;
        overflow: hidden;
        margin: 5px 0;
        transition: height 0.3s ease;
    }
    
    .upload-progress-bar, .download-progress-bar, .upload-progress-bar-small {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
        width: 0%;
        transition: width 0.3s ease;
        background-size: 15px 15px;
        background-image: linear-gradient(
            45deg, 
            rgba(255, 255, 255, 0.15) 25%, 
            transparent 25%, 
            transparent 50%, 
            rgba(255, 255, 255, 0.15) 50%, 
            rgba(255, 255, 255, 0.15) 75%, 
            transparent 75%, 
            transparent
        );
        animation: progress-bar-stripes 1s linear infinite;
    }
    
    @keyframes progress-bar-stripes {
        from { background-position: 0 0; }
        to { background-position: 15px 0; }
    }
    
    .upload-status, .download-status {
        font-size: 12px;
        color: var(--text-color);
        margin-top: 3px;
        transition: color 0.3s ease;
    }
    
    .error-message {
        color: var(--danger-color) !important;
    }
    
    .success-message {
        color: var(--success-color) !important;
    }
    
    .downloading .fas, .uploading-message .fas {
        animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.6; }
        100% { opacity: 1; }
    }
    
    /* Tooltip para información de transferencia */
    .transfer-info-tooltip {
        position: absolute;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        max-width: 200px;
        z-index: 100;
        visibility: hidden;
        opacity: 0;
        transition: opacity 0.3s;
    }
    
    .file-info:hover .transfer-info-tooltip,
    .download-btn:hover .transfer-info-tooltip {
        visibility: visible;
        opacity: 1;
    }
    
    /* Añadir min-width al estado de descarga */
    .download-status {
        min-width: 40px; /* Ajusta este valor si es necesario */
        display: inline-block; /* Para que min-width tenga efecto */
        text-align: right; /* Opcional: alinear el texto a la derecha */
    }

    /* --- NUEVO --- Estilos para el nombre de archivo */
    .file-details .file-name {
        display: block; /* Asegurar que ocupa su propia línea si es necesario */
        max-width: 100%; /* No exceder el ancho del contenedor */
        overflow: hidden; /* Ocultar el texto que desborda */
        white-space: nowrap; /* Evitar que el texto pase a la siguiente línea */
        text-overflow: ellipsis; /* Mostrar '...' al final del texto cortado */
        vertical-align: middle; /* Alinear verticalmente con el icono si es necesario */
    }
    /* --- FIN NUEVO --- */

    /* --- NUEVO --- Estilos para el párrafo del nombre de archivo DURANTE LA SUBIDA */
    .file-upload-info {
        width: 100%; /* Usar todo el ancho disponible */
        display: flex;
        flex-direction: column; /* Apilar elementos verticalmente */
        align-items: flex-start; /* Alinear a la izquierda */
    }
    
    .file-upload-info i {
        margin-right: 8px;
    }
    
    .file-upload-info p {
        margin: 5px 0;
        width: 100%; /* Usar todo el ancho del contenedor */
        white-space: normal; /* Permitir saltos de línea */
        word-break: break-word; /* Romper palabras largas si es necesario */
        overflow-wrap: break-word; /* Asegurar que las palabras largas se ajusten */
    }
    
    /* Contenedor especial para archivos subiendo */
    .uploading-message .file-container {
        min-width: 200px; /* Ancho mínimo garantizado */
        max-width: 100%; /* No exceder el contenedor */
        margin: 5px 0;
        padding: 8px 10px;
        background-color: rgba(0, 0, 0, 0.05); /* Fondo sutil */
        border-radius: 8px;
    }
    
    /* Asegurar que el ícono y el texto estén en la misma línea */
    .file-upload-header {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
    }
    
    /* Ya no necesitamos estos estilos que podrían interferir */
    .filename-base, .filename-ext {
        display: inline;
        max-width: none;
        overflow: visible;
        white-space: normal;
    }
    
    /* Contenedor de barra de progreso */
    .upload-status {
        width: 100%;
        margin-top: 8px;
        text-align: right;
        font-weight: bold;
    }
    /* --- FIN NUEVO --- */

    /* --- NUEVA ANIMACIÓN DE SUBIDA --- */
    @keyframes pulse-background {
      0% { background-color: rgba(0, 0, 0, 0.05); }
      50% { background-color: rgba(0, 0, 0, 0.08); }
      100% { background-color: rgba(0, 0, 0, 0.05); }
    }

    .uploading-message .file-upload-info {
      /* Aplicar la animación de pulso al fondo */
      animation: pulse-background 2s infinite ease-in-out;
      padding: 8px; /* Añadir algo de padding para que se vea mejor el fondo */
      border-radius: 5px;
    }

    /* Detener animación y cambiar fondo en caso de error */
    .uploading-message.error .file-upload-info {
      animation: none;
      background-color: rgba(231, 76, 60, 0.1); /* Fondo rojo sutil para error */
    }
    /* --- FIN NUEVA ANIMACIÓN DE SUBIDA --- */

    /* --- DEFINICIÓN DE ANIMACIÓN FA-SPIN (Fallback) --- */
    /* Aumentar especificidad */
    .uploading-message .fa-spin {
      animation: fa-spin 1s infinite linear;
    }

    @keyframes fa-spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
    /* --- FIN DEFINICIÓN FA-SPIN --- */

</style>
`);

// Función para mostrar notificaciones de transferencia mejoradas
function showTransferNotification(message, type = 'info') {
    // Crear elemento de notificación si no existe
    let transferNotif = document.getElementById('transfer-notification');
    
    if (!transferNotif) {
        transferNotif = document.createElement('div');
        transferNotif.id = 'transfer-notification';
        transferNotif.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 9999;
            max-width: 350px;
            transform: translateY(100px);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(transferNotif);
    }
    
    // Establecer ícono según el tipo
    let icon = '';
    switch(type) {
        case 'success': 
            icon = '<i class="fas fa-check-circle" style="color: #2ecc71; margin-right: 8px;"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle" style="color: #e74c3c; margin-right: 8px;"></i>';
            break;
        case 'warning':
            icon = '<i class="fas fa-exclamation-triangle" style="color: #f39c12; margin-right: 8px;"></i>';
            break;
        default:
            icon = '<i class="fas fa-info-circle" style="color: #3498db; margin-right: 8px;"></i>';
    }
    
    // Actualizar contenido
    transferNotif.innerHTML = `${icon}${message}`;
    
    // Mostrar notificación
    setTimeout(() => {
        transferNotif.style.transform = 'translateY(0)';
        transferNotif.style.opacity = '1';
    }, 10);
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        transferNotif.style.transform = 'translateY(100px)';
        transferNotif.style.opacity = '0';
        
        // Remover elemento después de la animación
        setTimeout(() => {
            if (transferNotif && transferNotif.parentNode) {
                transferNotif.parentNode.removeChild(transferNotif);
            }
        }, 300);
    }, 5000);
}

// Añadir estilos para el nuevo selector de emojis
document.head.insertAdjacentHTML('beforeend', `
<style>
  /* Estilos para Emoji Picker Button */
  /* .emoji-picker-container eliminado */
  
  #emoji-btn { /* MODIFICADO: Antes .emoji-picker-button */
    background-color: var(--primary-color); /* NUEVO: Fondo como antes */
    color: #fff; /* NUEVO: Color de icono/texto */
    border: none;
    font-size: 1.2rem; /* MODIFICADO: Tamaño como antes */
    cursor: pointer;
    padding: 5px 12px; /* MODIFICADO: Padding como antes */
    border-radius: 5px; /* MODIFICADO: Bordes como antes */
    transition: background-color 0.2s; /* Mantenemos transición suave */
    margin: 0 5px; /* NUEVO: Margen como antes */
    display: flex; /* NUEVO: Para centrar icono */
    align-items: center; /* NUEVO: Para centrar icono */
    justify-content: center; /* NUEVO: Para centrar icono */
  }
  
  #emoji-btn:hover { /* MODIFICADO: Antes .emoji-picker-button:hover */
    background-color: #4a47a3; /* NUEVO: Hover como antes */
  }

  #emoji-btn i { /* NUEVO: Estilos para el icono dentro del botón */
    color: #fff; /* Asegurar color del icono */
  }
  
  #emoji-picker { /* MODIFICADO: Antes .emoji-picker-popup */
    position: absolute;
    /* bottom, left, right, top son manejados por JS o media query específica */
    max-width: 300px; /* MODIFICADO */
    width: auto; /* AÑADIDO: permite encogerse, limitado por max-width */
    background-color: #fff; /* MODIFICADO: Fondo blanco estándar */
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    padding: 10px;
    display: none; /* Se cambia a 'grid' o 'block' con .active */
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  #emoji-picker.active { /* MODIFICADO: Antes .emoji-picker-popup.active */
    display: block; /* MODIFICADO: De grid a block */
  }
  
  .emoji-categories {
    display: flex;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  
  .emoji-category {
    font-size: 1.5rem;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 4px;
  }
  
  .emoji-category:hover,
  .emoji-category.active {
    background-color: #f0f0f0;
  }
  
  .emoji-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    width: 100%; /* AÑADIDO */
    box-sizing: border-box; /* AÑADIDO */
  }
  
  .emoji-item {
    font-size: 1.5rem;
    cursor: pointer;
    padding: 3px; /* MODIFICADO: Reducido de 5px */
    border-radius: 4px;
    margin: 2px;
    transition: background-color 0.2s;
    box-sizing: border-box; /* AÑADIDO */
    text-align: center; /* AÑADIDO */
  }
  
  .emoji-item:hover {
    background-color: #f0f0f0;
  }
  
  /* Ajuste para móviles */
  @media (max-width: 768px) {
    #emoji-picker {
      max-width: 270px; /* MODIFICADO: Sin !important */
      width: calc(100vw - 40px); /* MODIFICADO: Sin !important, 20px margen total a cada lado */
      /* left, right, top, bottom serán manejados por JS para consistencia */
    }
    
    .emoji-item {
      font-size: 1.3rem;
      padding: 2px; /* MODIFICADO: Reducido */
    }
  }
</style>
`);

// Función para inicializar el selector de emojis
function initEmojiPicker() {
    // Comprobar si el formulario de chat existe
    const chatForm = document.getElementById('chat-form');
    if (!chatForm) return;
    
    // Buscar el campo de entrada de mensajes
    const messageInput = document.getElementById('msg');
    if (!messageInput) return;
    
    // Buscar el botón de emojis existente
    const emojiBtn = document.getElementById('emoji-btn');
    if (!emojiBtn) {
        console.log('No se encontró el botón de emojis existente (#emoji-btn)');
        return;
    }
    
    // Obtener el contenedor de emojis existente o crear uno nuevo
    let emojiPicker = document.getElementById('emoji-picker');
    if (!emojiPicker) {
        // Si no existe, lo creamos
        emojiPicker = document.createElement('div');
        emojiPicker.id = 'emoji-picker';
        emojiPicker.className = 'emoji-picker';
        document.body.appendChild(emojiPicker);
    }
    
    // Limpiar el contenedor de emojis existente
    emojiPicker.innerHTML = '';
    
    // Añadir estructura de categorías y rejilla de emojis
    emojiPicker.innerHTML = `
        <div class="emoji-categories">
            <span class="emoji-category active" data-category="smileys">😀</span>
            <span class="emoji-category" data-category="people">👋</span>
            <span class="emoji-category" data-category="animals">🐶</span>
            <span class="emoji-category" data-category="food">🍎</span>
            <span class="emoji-category" data-category="travel">🚗</span>
            <span class="emoji-category" data-category="activities">⚽</span>
            <span class="emoji-category" data-category="objects">💡</span>
            <span class="emoji-category" data-category="symbols">❤️</span>
            <span class="emoji-category" data-category="flags">🏁</span>
        </div>
        <div class="emoji-grid" id="emoji-grid"></div>
    `;
    
    // Definir grupos de emojis
    const emojiGroups = {
        smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
        people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👨‍🦰', '👨‍🦱', '👨‍🦳', '👨‍🦲', '👩', '👩‍🦰', '🧑‍🦰', '👩‍🦱', '🧑‍🦱', '👩‍🦳', '🧑‍🦳', '👩‍🦲', '🧑‍🦲', '👱‍♀️', '👱‍♂️', '🧓', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️'],
        animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜'],
        food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜'],
        travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏛️', '⛪', '🕌', '🕍', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁'],
        activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🏋️‍♂️', '🏋️‍♀️', '🤼', '🤼‍♂️', '🤼‍♀️', '🤸', '🤸‍♂️', '🤸‍♀️', '⛹️', '⛹️‍♂️', '⛹️‍♀️', '🤺', '🤾', '🤾‍♂️', '🤾‍♀️', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏇', '🧘', '🧘‍♂️', '🧘‍♀️', '🏄', '🏄‍♂️', '🏄‍♀️', '🏊', '🏊‍♂️', '🏊‍♀️', '🤽', '🤽‍♂️', '🤽‍♀️', '🚣', '🚣‍♂️', '🚣‍♀️', '🧗', '🧗‍♂️', '🧗‍♀️', '🚵', '🚵‍♂️', '🚵‍♀️', '🚴', '🚴‍♂️', '🚴‍♀️', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🤹‍♂️', '🤹‍♀️', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'],
        objects: ['💡', '🔦', '🪔', '🗑️', '🎌', '🚩', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '🧲', '🪝', '🪓', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔪', '🪒', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪣', '🧺', '🧻', '🚽', '🪠', '🧸', '🪆', '🪄', '🧴', '🪥', '🧽', '🪣', '🧯', '🛌', '🔑', '🗝️', '🪑', '🛋️', '🪞', '🪟', '🛏️', '🛌', '🚪', '🪜'],
        symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀'],
        flags: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇫', '🇦🇽', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴', '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇨', '🇨🇻', '🇧🇶', '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽', '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇪🇹', '🇪🇺', '🇫🇰', '🇫🇴', '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫', '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭', '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵', '🇬🇺', '🇬🇹', '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺', '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇲', '🇮🇱', '🇮🇹', '🇯🇲', '🇯🇵', '🎌', '🇯🇪', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼', '🇰🇬', '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮', '🇱🇹', '🇱🇺', '🇲🇴', '🇲🇰', '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺', '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨', '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿', '🇲🇲', '🇳🇦', '🇳🇷', '🇳🇵', '🇳🇱']
    };
    
    // Inicializar con la primera categoría
    const emojiGrid = document.getElementById('emoji-grid');
    if (emojiGrid) {
        populateEmojiGrid(emojiGrid, emojiGroups.smileys);
    }
    
    // Manejador para el clic en las categorías
    const emojiCategories = document.querySelectorAll('.emoji-category');
    emojiCategories.forEach(category => {
        category.addEventListener('click', function() {
            // Remover la clase 'active' de todas las categorías
            emojiCategories.forEach(cat => cat.classList.remove('active'));
            
            // Añadir la clase 'active' a la categoría actual
            this.classList.add('active');
            
            // Obtener la categoría seleccionada
            const categoryName = this.getAttribute('data-category');
            
            // Poblar la rejilla con los emojis de esa categoría
            populateEmojiGrid(emojiGrid, emojiGroups[categoryName]);
        });
    });
    
    // Función para llenar la rejilla con los emojis
    function populateEmojiGrid(grid, emojis) {
        if (!grid) return;
        
        // Limpiar la rejilla
        grid.innerHTML = '';
        
        // Añadir cada emoji a la rejilla
        emojis.forEach(emoji => {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'emoji-item';
            emojiSpan.textContent = emoji;
            emojiSpan.title = emoji;
            
            // Añadir manejador de clic para insertar el emoji
            emojiSpan.addEventListener('click', function() {
                insertEmojiAtCursor(messageInput, emoji);
            });
            
            grid.appendChild(emojiSpan);
        });
    }
    
    // Función para posicionar el popup correctamente
    function positionEmojiPicker() {
        const btnRect = emojiBtn.getBoundingClientRect();
        const pickerElement = emojiPicker;
        const margin = 5; // Pequeño margen para que no esté pegado al botón o borde

        // Obtener dimensiones actuales del picker (debe estar visible o tener dimensiones intrínsecas)
        const pickerWidth = pickerElement.offsetWidth;
        const pickerHeight = pickerElement.offsetHeight;

        // Posición deseada: arriba y a la izquierda del botón
        // El punto de anclaje es la esquina superior izquierda del picker
        let desiredTop = btnRect.top - pickerHeight - margin;
        let desiredLeft = btnRect.left - pickerWidth - margin;

        // Ajustar si se sale por el borde superior de la ventana
        if (desiredTop < margin) {
            desiredTop = margin;
        }

        // Ajustar si se sale por el borde izquierdo de la ventana
        if (desiredLeft < margin) {
            desiredLeft = margin;
        }
        
        // En pantallas muy pequeñas, si después de ajustar a la izquierda aún se sale por la derecha
        // (esto pasaría si el picker es más ancho que la pantalla menos los márgenes)
        // ajustamos el ancho del picker si es necesario, o lo pegamos también a la derecha.
        // Por ahora, nos enfocamos en el posicionamiento arriba-izquierda y los ajustes de borde.
        // La media query ya limita el width en móviles.

        pickerElement.style.top = desiredTop + 'px';
        pickerElement.style.left = desiredLeft + 'px';
        pickerElement.style.right = 'auto'; // Aseguramos que 'right' no interfiera
        pickerElement.style.bottom = 'auto'; // Aseguramos que 'bottom' no interfiera
    }
    
    // Manejador para abrir/cerrar el selector
    emojiBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Primero, cambia el estado de visibilidad del selector
        emojiPicker.classList.toggle('active');
        
        // Si el selector ahora está activo (visible), entonces calcula su posición
        if (emojiPicker.classList.contains('active')) {
          positionEmojiPicker();
        }
        
        // Cerrar cuando se hace clic fuera del selector
        function closePopup(event) {
            if (!emojiPicker.contains(event.target) && event.target !== emojiBtn) {
                emojiPicker.classList.remove('active');
                document.removeEventListener('click', closePopup);
            }
        }
        
        document.addEventListener('click', closePopup);
    });
    
    // Reposicionar cuando se redimensiona la ventana
    window.addEventListener('resize', function() {
        if (emojiPicker.classList.contains('active')) {
            positionEmojiPicker();
        }
    });
    
    // Función para insertar el emoji en la posición actual del cursor
    function insertEmojiAtCursor(input, emoji) {
        if (!input) return;
        
        // Obtener la posición actual del cursor
        const startPos = input.selectionStart;
        const endPos = input.selectionEnd;
        
        // Obtener el valor actual del campo de entrada
        const currentValue = input.value;
        
        // Insertar el emoji en la posición del cursor
        input.value = currentValue.substring(0, startPos) + emoji + currentValue.substring(endPos);
        
        // Mover el cursor después del emoji insertado
        const newCursorPos = startPos + emoji.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
        
        // Enfocar el campo de entrada
        input.focus();
        
        // Actualizar el contador de caracteres si existe
        const counter = document.querySelector('.char-counter span');
        if (counter) counter.textContent = input.value.length;
        
        // Cerrar el selector
        emojiPicker.classList.remove('active');
    }
}

// Inicializar el selector de emojis cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', initEmojiPicker);

// Escuchar mensajes específicos de la sala
socket.on('roomMessages', messages => {
    console.log('Evento roomMessages recibido del servidor. Cantidad:', messages ? messages.length : 'undefined');
    updateLoadingProgress(40, `Cargando ${messages.length} mensajes de sala ${currentRoom}...`);
    
    // Limpiar los mensajes existentes para evitar duplicados
    chatMessages.innerHTML = '';
    
    // Mostrar cada mensaje en la interfaz con un progreso
    let processedCount = 0;
    const batchSize = 10; // Procesar mensajes en lotes para mejorar rendimiento
    const totalMessages = messages.length;
    
    function processBatch(startIdx) {
        const endIdx = Math.min(startIdx + batchSize, totalMessages);
        
        for (let i = startIdx; i < endIdx; i++) {
            const message = messages[i];
            
            // Para los mensajes históricos, comparamos el nombre de usuario en lugar del socket.id
            // para determinar si el mensaje fue enviado por el usuario actual
            if (message.username === localUsername) {
                // Si el mensaje es del usuario actual, forzamos el userId a ser el socket.id actual
                // para que se aplique el estilo "self"
                message.userId = socket.id;
            }
            
            // Añadir mensaje al DOM sin mostrar todavía
            if (message.mediaId) { // <-- Usar mediaId para identificar mensajes multimedia
                outputMediaMessage(message, false); // Pasar false para no hacer scroll todavía
            } else {
                outputMessage(message, false); // Pasar false para no hacer scroll todavía
            }
            
            processedCount++;
            
            // Actualizar progreso
            const percent = 40 + Math.floor((processedCount / totalMessages) * 40); // 40%-80%
            updateLoadingProgress(percent, `Procesando mensajes... (${processedCount}/${totalMessages})`);
        }
        
        // Si aún hay mensajes por procesar, programar el siguiente lote
        if (endIdx < totalMessages) {
            setTimeout(() => processBatch(endIdx), 0);
        } else {
            // Todos los mensajes han sido procesados
            updateLoadingProgress(80, 'Finalizando carga de mensajes...');
            messagesLoaded = true;
            
            // Hacer scroll hasta el final ahora que todos los mensajes están cargados
            setTimeout(() => {
                scrollToBottom();
                checkAllLoaded();
            }, 100);
        }
    }
    
    // Iniciar procesamiento por lotes (o mostrar mensaje si no hay mensajes)
    if (totalMessages > 0) {
        processBatch(0);
    } else {
        // No hay mensajes, actualizar interfaz y continuar
        const emptyMessageDiv = document.createElement('div');
        emptyMessageDiv.classList.add('empty-room-message');
        emptyMessageDiv.innerHTML = `<p>No hay mensajes en la sala ${currentRoom}. ¡Sé el primero en escribir!</p>`;
        chatMessages.appendChild(emptyMessageDiv);
        
        messagesLoaded = true;
        checkAllLoaded();
    }
});

// Asegurar que los botones de sala se muestren y funcionen correctamente
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando selectores de sala');
    
    // Verificar si los elementos de sala existen
    const roomSelector = document.querySelector('.rooms-selector');
    const currentRoomDisplay = document.getElementById('current-room');
    const roomButtons = document.querySelectorAll('.room-btn');
    
    if (!roomSelector) {
        console.error('No se encontró el selector de salas en el DOM');
    } else {
        console.log('Selector de salas encontrado');
        
        // Asegurar que sea visible
        roomSelector.style.display = 'flex';
        roomSelector.style.visibility = 'visible';
        roomSelector.style.opacity = '1';
    }
    
    if (!currentRoomDisplay) {
        console.error('No se encontró el indicador de sala actual');
    } else {
        console.log('Indicador de sala actual encontrado');
        // Establecer la sala general por defecto
        currentRoomDisplay.textContent = currentRoom;
    }
    
    if (!roomButtons || roomButtons.length === 0) {
        console.error('No se encontraron botones de sala');
    } else {
        console.log(`Se encontraron ${roomButtons.length} botones de sala`);
        
        // Configurar los botones de sala
        roomButtons.forEach(button => {
            // Asegurar que el estilo sea correcto
            button.style.display = 'inline-block';
            
            // Establecer el botón de la sala actual como activo
            if (button.dataset.room === currentRoom) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            
            // Añadir o reforzar el event listener
            button.addEventListener('click', function() {
                const room = this.dataset.room;
                console.log(`Click en botón de sala: ${room}`);
                
                if (room && room !== currentRoom) {
                    joinRoom(room);
                }
            });
        });
    }
    
    // Solicitar mensajes de la sala inicial al cargar
    if (socket && socket.connected) {
        socket.emit('getMessages', { room: currentRoom });
        console.log(`Solicitando mensajes de sala inicial: ${currentRoom}`);
    }
});

// Escuchar actualizaciones de salas desde el servidor
socket.on('roomsUpdated', (rooms) => {
    console.log('Evento roomsUpdated recibido del servidor:', rooms);
    
    if (!Array.isArray(rooms) || rooms.length === 0) {
        console.error('Se recibió un array de salas vacío o inválido');
        return;
    }
    
    // Obtener el contenedor de botones de sala
    const roomButtons = document.querySelector('.room-buttons');
    if (!roomButtons) {
        console.error('No se encontró el contenedor de botones de sala');
        return;
    }
    
    // Guardar la sala actual seleccionada
    const activeRoom = currentRoom;
    
    // Vaciar el contenedor de botones (pero mantener los predeterminados)
    const predefinedRooms = ['general']; // Ahora solo 'general' es predefinida
    const customButtons = Array.from(roomButtons.querySelectorAll('.room-btn')).filter(
        btn => !predefinedRooms.includes(btn.dataset.room) && btn.classList.contains('custom-room')
    );
    customButtons.forEach(btn => btn.remove());
    
    // Añadir los botones para las nuevas salas
    rooms.forEach(room => {
        // Si no es una sala predefinida, agregar un nuevo botón
        if (!predefinedRooms.includes(room.slug)) {
            // Verificar si el botón ya existe
            const existingButton = roomButtons.querySelector(`.room-btn[data-room="${room.slug}"]`);
            if (!existingButton) {
                const button = document.createElement('button');
                button.classList.add('room-btn', 'custom-room');
                button.dataset.room = room.slug;
                button.textContent = room.name;
                
                // Si es la sala activa, marcarla como activa
                if (room.slug === activeRoom) {
                    button.classList.add('active');
                }
                
                // Agregar evento de clic
                button.addEventListener('click', function() {
                    if (room.slug !== currentRoom) {
                        joinRoom(room.slug);
                    }
                });
                
                roomButtons.appendChild(button);
            }
        }
    });
    
    showTransferNotification('Lista de salas actualizada', 'info');
});

// Solicitar salas disponibles al iniciar
function loadAvailableRooms() {
    fetch('/api/rooms')
        .then(response => {
            if (!response.ok) {
                throw new Error('Error al obtener salas');
            }
            return response.json();
        })
        .then(data => {
            if (data.success && Array.isArray(data.rooms)) {
                console.log('Salas obtenidas de la API:', data.rooms);
                
                // Procesar salas directamente
                const rooms = data.rooms;
                
                // Obtener el contenedor de botones de sala
                const roomButtons = document.querySelector('.room-buttons');
                if (!roomButtons) {
                    console.error('No se encontró el contenedor de botones de sala');
                    return;
                }
                
                // Guardar la sala actual seleccionada
                const activeRoom = currentRoom;
                
                // Vaciar el contenedor de botones (pero mantener los predeterminados)
                const predefinedRooms = ['general']; // Ahora solo 'general' es predefinida
                const customButtons = Array.from(roomButtons.querySelectorAll('.room-btn')).filter(
                    btn => !predefinedRooms.includes(btn.dataset.room) && btn.classList.contains('custom-room')
                );
                customButtons.forEach(btn => btn.remove());
                
                // Añadir los botones para las nuevas salas
                rooms.forEach(room => {
                    // Si no es una sala predefinida, agregar un nuevo botón
                    if (!predefinedRooms.includes(room.slug)) {
                        // Verificar si el botón ya existe
                        const existingButton = roomButtons.querySelector(`.room-btn[data-room="${room.slug}"]`);
                        if (!existingButton) {
                            const button = document.createElement('button');
                            button.classList.add('room-btn', 'custom-room');
                            button.dataset.room = room.slug;
                            button.textContent = room.name;
                            
                            // Si es la sala activa, marcarla como activa
                            if (room.slug === activeRoom) {
                                button.classList.add('active');
                            }
                            
                            // Agregar evento de clic
                            button.addEventListener('click', function() {
                                if (room.slug !== currentRoom) {
                                    joinRoom(room.slug);
                                }
                            });
                            
                            roomButtons.appendChild(button);
                        }
                    }
                });
                
                showTransferNotification('Lista de salas actualizada', 'info');
            }
        })
        .catch(error => {
            console.error('Error al cargar salas:', error);
        });
}

// Agregar llamada a cargar salas disponibles al inicio
document.addEventListener('DOMContentLoaded', function() {
    // Código existente...
    
    // Cargar salas disponibles
    loadAvailableRooms();
    
    // ... código existente
});

// Función para forzar la sincronización de salas desde la consola del navegador
window.forceSyncRooms = function() {
    console.log('Forzando sincronización de salas...');
    
    // Obtener el contenedor de botones de sala
    const roomButtons = document.querySelector('.room-buttons');
    if (!roomButtons) {
        console.error('No se encontró el contenedor de botones de sala');
        return false;
    }
    
    // Eliminar todos los botones excepto 'general'
    const allRoomButtons = Array.from(roomButtons.querySelectorAll('.room-btn'));
    allRoomButtons.forEach(btn => {
        if (btn.dataset.room !== 'general') {
            console.log(`Eliminando botón de sala: ${btn.dataset.room}`);
            btn.remove();
        }
    });
    
    // Asegurar que 'general' está seleccionada
    const generalButton = roomButtons.querySelector('.room-btn[data-room="general"]');
    if (generalButton) {
        generalButton.classList.add('active');
        
        // Cambiar a la sala general si no estamos en ella
        if (currentRoom !== 'general') {
            joinRoom('general');
        }
    }
    
    // Solicitar la lista de salas al servidor para mantener sincronización
    fetch('/api/rooms')
        .then(response => response.json())
        .then(data => {
            if (data.success && Array.isArray(data.rooms)) {
                console.log('Salas actualizadas desde el servidor:', data.rooms);
            }
        })
        .catch(error => {
            console.error('Error al obtener salas:', error);
        });
    
    showTransferNotification('Salas sincronizadas correctamente', 'success');
    return true;
};