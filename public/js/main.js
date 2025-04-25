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
const MESSAGE_RATE_LIMIT = 500; // 500ms = 2 mensajes por segundo máximo
const MAX_QUEUE_SIZE = 10; // Máximo de mensajes en cola (aumentado a 10)
const COOLDOWN_TIME = 2000; // 2 segundos de cooldown
const BURST_MESSAGES_LIMIT = 10; // Número de mensajes rápidos antes de activar cooldown (aumentado a 10)

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
    
    // Mostrar indicador si es un usuario autenticado
    if (data.isAuthenticated) {
        if (usernameDisplay) {
            // Añadir un icono de verificación junto al nombre
            usernameDisplay.innerHTML += ' <i class="fas fa-check-circle" style="color: #2ecc71; font-size: 14px;" title="Usuario verificado"></i>';
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
            window.location.href = 'login.html';
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
        window.location.href = 'login.html';
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
    
    if (urlToken) {
        console.log('Token nuevo encontrado en la URL');
        localStorage.setItem('token', urlToken);
        
        // Actualizar la variable global
        window.token = urlToken;
        
        // Limpiar la URL (opcional)
        window.history.replaceState({}, document.title, '/chat.html');
        
        return urlToken;
    }
    
    // Devolver el token existente
    return window.token || localStorage.getItem('token');
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
    window.location.href = 'index.html';
});

// Escuchar por errores de inicio de sesión
socket.on('joinError', (data) => {
    console.log('Error al unirse al chat:', data);
    // Mostrar alerta antes de redireccionar
    alert(data.message || 'Error al unirse al chat. Por favor, inténtalo de nuevo.');
    // Redireccionar a la página de inicio
    window.location.href = 'index.html';
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
            if (message.media) {
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
        alert('Estás enviando mensajes demasiado rápido. Por favor, espera un momento antes de enviar más mensajes.');
        
        // Resetear el estado de la alerta después de un tiempo
        setTimeout(() => {
            rateLimitAlertDisplayed = false;
        }, 3000);
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
        return;
    }
    
    messageProcessing = true;
    
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    // Si no ha pasado suficiente tiempo desde el último mensaje, esperar
    if (timeSinceLastMessage < MESSAGE_RATE_LIMIT) {
        setTimeout(processMessageQueue, MESSAGE_RATE_LIMIT - timeSinceLastMessage);
        return;
    }
    
    // Procesar el siguiente mensaje en la cola
    const message = messageQueue.shift();
    
    // Crear un mensaje local para mostrar feedback inmediato al usuario (¡SIN RELOJ!)
    const tempMsgDiv = addTempMessage(message);
    
    // Emitir mensaje al servidor con callback para confirmar recepción
    socket.emit('chatMessage', message, (response) => {
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
    
    console.log(`Mensaje enviado: ${message.substring(0, 20)}${message.length > 20 ? '...' : ''}`);
    
    // Actualizar tiempo del último mensaje
    lastMessageTime = Date.now();
    
    // Si quedan mensajes en la cola, programar el siguiente procesamiento
    if (messageQueue.length > 0) {
        setTimeout(processMessageQueue, MESSAGE_RATE_LIMIT);
    } else {
        messageProcessing = false;
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
    }, 10);
    
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
        showRateLimitAlert();
        return;
    }

    // Obtener texto del mensaje
    const msg = e.target.elements.msg.value.trim();

    if (msg !== '') {
        // Verificar si podemos añadir el mensaje a la cola
        if (!canAddToQueue()) {
            return; // No seguir si no podemos añadir más mensajes
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

// Función interna que realmente procesa el archivo
function handleMediaUploadInternal(file, text) {
    try {
        console.log('Procesando archivo de tamaño:', formatFileSize(file.size));
        
        // Determinar tipo de archivo inmediatamente (sin esperar)
        const fileType = getFileType(file);
        console.log('Tipo de archivo detectado:', fileType);
        
        // Considerar todos los videos como archivos grandes para asegurar que se guarden en GridFS
        const isLargeFile = file.size > 15 * 1024 * 1024 || fileType === 'video';
        
        // Separar el nombre de archivo y su extensión
        const fileName = file.name;
        let fileNameBase = fileName;
        let fileExtension = '';
        
        // Buscar la última posición del punto para detectar la extensión
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex > 0) { // Asegurarse que hay una extensión y no es un archivo que comienza con punto
            fileNameBase = fileName.substring(0, lastDotIndex);
            fileExtension = fileName.substring(lastDotIndex); // Incluye el punto
        }
        
        // Crear el mensaje temporal inmediatamente
        const tempDiv = document.createElement('div');
        tempDiv.classList.add('message', 'self', 'fade-in', 'uploading-message');
        
        // Agregar el contenido del mensaje temporal
        tempDiv.innerHTML = `
            <p class="meta">${escapeHTML(localUsername)} <span>${moment().format('HH:mm')}</span></p>
            <div class="content">
                ${text ? `<p class="text-content">${escapeHTML(text)}</p>` : ''}
                <div class="media-container">
                    <div class="file-container">
                        <div class="file-upload-info">
                            <div class="file-upload-header">
                                <i class="fas fa-file-upload"></i>
                                <strong>Subiendo archivo</strong>
                            </div>
                            <div class="file-details" style="width: 100%; max-width: none; padding: 5px 0;">
                                <span class="file-name" style="max-width: none; width: auto; font-size: 13px; word-break: break-all; white-space: normal;">${escapeHTML(file.name)}</span>
                                <span class="file-size">${formatFileSize(file.size)}</span>
                            </div>
                            <div class="upload-status">0%</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar al DOM inmediatamente
        document.querySelector('.chat-messages').appendChild(tempDiv);
        
        // Animar y hacer scroll inmediatamente
        tempDiv.classList.add('active');
        scrollToBottom();
        
        // Referencias a elementos de progreso
        const uploadStatus = tempDiv.querySelector('.upload-status');
        
        console.log('Interfaz de carga preparada');
        
        // Función para manejar errores durante la carga
        function handleUploadError(errorMessage) {
            console.error('Error en la carga:', errorMessage);
            tempDiv.classList.add('error');
            
            // Actualizar mensaje de estado directamente
            uploadStatus.textContent = errorMessage;
            uploadStatus.classList.add('error-message');
        }
        
        // Función para actualizar el progreso
        function updateProgress(percent, statusText) {
            console.log(`Progreso: ${percent}% - ${statusText || ''}`);
            
            if (uploadStatus) {
                // Asegurarse de que percent es un número y redondearlo
                const displayPercent = Math.round(Number(percent) || 0);
                uploadStatus.textContent = `${displayPercent}%`;
                
                if (statusText) {
                    // También podríamos mostrar texto adicional
                    uploadStatus.setAttribute('title', statusText);
                }
            }
        }
        
        // Función para completar la carga
        function completeUpload() {
            console.log('Carga completada');
            if (tempDiv) {
                tempDiv.remove();
                console.log('Mensaje temporal de subida eliminado.');
            }
            
            showTransferNotification(`Archivo "${file.name}" subido correctamente`, 'success');
        }
        
        // Basado en el tamaño del archivo, elegir entre carga estándar o fragmentada
        if (isLargeFile) {
            console.log('Iniciando carga de archivo grande en fragmentos');
            uploadLargeFile();
        } else {
            console.log('Iniciando carga de archivo estándar');
            uploadRegularFile();
        }
        
        // Función para cargar archivos pequeños
        function uploadRegularFile() {
            updateProgress(10, 'Iniciando carga de archivo...');
            
            // Actualizar progreso periódicamente para mostrar actividad
            let fakePct = 10;
            const progressInterval = setInterval(() => {
                if (fakePct < 80) {
                    fakePct += 5;
                    updateProgress(fakePct, 'Procesando archivo...');
                }
            }, 250);
            
            // Verificar si es un video
            const isVideo = (fileType === 'video');
            
            // Si es un video, usar uploadLargeFile en su lugar
            if (isVideo) {
                console.log('Detectado video, usando uploadLargeFile para procesarlo correctamente');
                clearInterval(progressInterval);
                uploadLargeFile();
                return;
            }
            
            // Crear FileReader para leer el archivo
            const reader = new FileReader();
            
            // Manejar éxito en la lectura
            reader.onload = function(e) {
                console.log('Archivo leído correctamente, enviando al servidor');
                clearInterval(progressInterval);
                updateProgress(90, 'Enviando archivo al servidor...');
                
                // Preparar datos para enviar
                const messageData = {
                    media: e.target.result,
                    text: text,
                    fileType: fileType,
                    fileName: file.name,
                    fileSize: file.size
                };
                
                // Para videos, asegurarse de que el tipo sea correcto
                if (isVideo) {
                    messageData.fileType = 'video';
                    console.log('Configuración especial aplicada para video pequeño');
                }
                
                // Establecer timeout para detectar problemas con el servidor
                const uploadTimeout = setTimeout(() => {
                    handleUploadError('No se recibió respuesta del servidor. Inténtelo de nuevo.');
                }, 60000);
                
                // Enviar al servidor
                socket.emit('mediaMessage', messageData, (response) => {
                    console.log('Respuesta del servidor (mediaMessage):', response);
                    clearTimeout(uploadTimeout);
                    
                    if (response && response.success) {
                        updateProgress(100, '¡Archivo subido con éxito!');
                        completeUpload(); // Esto elimina el mensaje temporal "subiendo..."
                        
                        // Renderizar el mensaje final para el remitente usando la info confirmada
                        if (response.confirmedMessage) {
                            console.log('Renderizando mensaje multimedia confirmado para el remitente');
                            outputMediaMessage(response.confirmedMessage);
                        } else {
                            console.warn('Callback exitoso pero no se recibió confirmedMessage para renderizar');
                        }
                    } else {
                        handleUploadError(response?.error || 'Error al enviar archivo');
                    }
                });
            };
            
            // Manejar errores de lectura
            reader.onerror = function(error) {
                console.error('Error al leer archivo:', error);
                clearInterval(progressInterval);
                handleUploadError('Error al leer el archivo');
            };
            
            // Iniciar la lectura del archivo
            console.log('Iniciando lectura del archivo como data URL');
            try {
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error al iniciar la lectura del archivo:', error);
                clearInterval(progressInterval);
                handleUploadError('Error al iniciar la lectura del archivo');
            }
        }
        
        // IMPLEMENTACIÓN REDISEÑADA para cargar archivos grandes
        function uploadLargeFile() {
            // Configuración básica
            const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB por fragmento
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const MAX_PARALLEL_UPLOADS = 3; // Máximo de cargas paralelas
            const uploadedChunks = new Set();
            let currentChunk = 1; // Índice del siguiente chunk a procesar (empezamos desde 1 para la cola paralela)
            
            console.log(`Preparando carga fragmentada: ${totalChunks} fragmentos de ${formatFileSize(CHUNK_SIZE)}`);
            updateProgress(5, `Preparando carga optimizada (${totalChunks} fragmentos)...`);
            
            // Generar ID único para esta sesión de carga
            const sessionId = generateUniqueId();
            
            // Estructura de sesión de carga
            const uploadSession = {
                id: sessionId,
                fileId: null, // <<--- Será establecido por el servidor
                firstChunkConfirmed: false, // <<--- NUEVO FLAG
                isFinalizing: false, // <<--- ADD THIS LINE
                fileName: file.name,
                fileType: fileType,
                fileSize: file.size,
                chunks: new Map(), // Mapa de chunks {index: {status, attempts, checksum}}
                totalChunks: totalChunks,
                activeUploads: 0,
                lastActivity: Date.now()
            };
            
            // Inicializar estado de chunks
            for (let i = 0; i < totalChunks; i++) {
                uploadSession.chunks.set(i, {
                    status: 'pending',
                    attempts: 0,
                    checksum: null
                });
            }
            
            // Inicializar sesión en el servidor
            initializeUploadSession();
            
            // Función para generar ID único
            function generateUniqueId() {
                return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Función para inicializar sesión en el servidor
            function initializeUploadSession() {
                console.log(`Inicializando sesión para archivo ${file.name} (${formatFileSize(file.size)})`);
                updateProgress(5, 'Preparando sesión de carga...');
                
                // Timeout de seguridad para la inicialización - aumentado a 120 segundos para archivos grandes
                const initTimeout = setTimeout(() => {
                    console.log('Timeout al inicializar sesión después de 120 segundos');
                    handleUploadError('Tiempo de espera agotado al inicializar la sesión. Por favor, verifique su conexión e inténtelo de nuevo.');
                }, 120000); // 120 segundos (2 minutos) para archivos grandes
                
                // Agregar evento de confirmación para verificar que el socket está activo
                let pingInterval = setInterval(() => {
                    console.log("Verificando conexión con el servidor...");
                    socket.emit('ping', {}, (response) => {
                        if (response && response.success) {
                            console.log("Conexión con servidor activa, esperando respuesta de inicialización...");
                        } else {
                            console.warn("Sin respuesta del servidor en ping");
                        }
                    });
                }, 10000); // Cada 10 segundos
                
                socket.emit('initializeUpload', {
                    sessionId: uploadSession.id,
                    fileName: uploadSession.fileName,
                    fileType: uploadSession.fileType,
                    fileSize: uploadSession.fileSize,
                    totalChunks: uploadSession.totalChunks,
                    text: text // Texto asociado al archivo
                }, response => {
                    clearTimeout(initTimeout);
                    clearInterval(pingInterval);
                    
                    if (response && response.success) {
                        console.log(`Sesión de carga iniciada: ${response.sessionId}, fileId: ${response.fileId}`);
                        uploadSession.fileId = response.fileId;
                        
                        updateProgress(10, 'Sesión iniciada, comenzando carga...');
                        
                        // Si el servidor reporta chunks ya existentes, actualizamos nuestro estado
                        if (response.existingChunks && response.existingChunks.length > 0) {
                            response.existingChunks.forEach(index => {
                                const chunk = uploadSession.chunks.get(index);
                                if (chunk) {
                                    chunk.status = 'completed';
                                    console.log(`Chunk ${index} ya existía en el servidor`);
                                }
                            });
                            
                            // Actualizar progreso con chunks ya existentes
                            updateProgress(
                                calculateProgress(),
                                `Recuperados ${response.existingChunks.length} fragmentos previos`
                            );
                        }
                        
                        // Reiniciar currentChunk para asegurar que comienza desde el principio
                        // currentChunk = 0; // No es necesario con la nueva lógica de búsqueda
                        
                        // Comenzar carga de chunks (ahora enviará solo el primero)
                        uploadNextChunks();
                        
                        // Iniciar verificación periódica
                        scheduleStatusCheck();
                    } else {
                        console.error('Error al inicializar la sesión:', response?.error);
                        handleUploadError(`Error al inicializar sesión: ${response?.error || 'Error de conexión. Verifica tu conexión a internet y reintenta.'}`);
                    }
                });
            }
            
            // Función para subir chunks disponibles según capacidad
            function uploadNextChunks() {
                // Si hemos alcanzado la capacidad máxima, salir
                if (uploadSession.activeUploads >= MAX_PARALLEL_UPLOADS) return;
                
                // <<--- NUEVA LÓGICA --->>
                if (!uploadSession.firstChunkConfirmed) {
                    // Aún no hemos confirmado el primer chunk, solo intentarlo
                    const firstChunk = uploadSession.chunks.get(0);
                    if (firstChunk && firstChunk.status === 'pending' && uploadSession.activeUploads === 0) {
                        console.log('Intentando enviar el primer fragmento...');
                        uploadChunk(0);
                    }
                    // No enviar otros chunks hasta que el primero sea confirmado
                    return;
                }
                // <<--- FIN NUEVA LÓGICA --->>

                // Ya hemos confirmado el primer chunk, proceder con cargas paralelas
                let uploadsStarted = 0;
                
                // Intentar cargar chunks pendientes hasta alcanzar el máximo
                for (const [index, chunk] of uploadSession.chunks.entries()) {
                    if (index === 0) continue; // Ya gestionamos el primero

                    if (chunk && chunk.status === 'pending' && uploadSession.activeUploads < MAX_PARALLEL_UPLOADS) {
                        uploadChunk(index);
                        uploadsStarted++;
                    }
                    // Salir si alcanzamos el límite
                    if (uploadSession.activeUploads >= MAX_PARALLEL_UPLOADS) break;
                }
                
                // Verificar si hemos terminado (aunque improbable aquí si acabamos de iniciar cargas)
                checkCompletion();
            }
            
            // Función para subir un chunk específico
            function uploadChunk(index) {
                const chunkInfo = uploadSession.chunks.get(index);
                
                // Actualizar estado
                chunkInfo.status = 'uploading';
                chunkInfo.attempts++;
                uploadSession.activeUploads++;
                
                // Actualizar UI
                updateProgress(
                    calculateProgress(),
                    `Subiendo ${uploadSession.activeUploads} fragmentos en paralelo (${getCompletedCount()}/${totalChunks} completados)...`
                );
                
                // Preparar el chunk
                const start = index * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                const chunkBlob = file.slice(start, end); // Obtener el Blob directamente
                
                console.log(`Procesando fragmento ${index + 1}/${totalChunks}, tamaño: ${formatFileSize(chunkBlob.size)}, fileId: ${uploadSession.fileId || 'ninguno'}`);

                // Calcular checksum (para verificación de integridad)
                calculateChecksum(chunkBlob).then(checksum => {
                    chunkInfo.checksum = checksum;
                    
                    // Verificar que tenemos un fileId válido
                    if (!uploadSession.fileId) {
                        console.error(`Error: No hay fileId para enviar el fragmento ${index + 1}`);
                        handleChunkError(index, "Error: sesión no inicializada correctamente");
                        return;
                    }
                    
                    // Datos para enviar (sin chunkData como DataURL)
                    const chunkMetadata = {
                        sessionId: uploadSession.id,
                        fileId: uploadSession.fileId,
                        chunkIndex: index,
                        chunkTotal: uploadSession.totalChunks,
                        checksum: checksum,
                        isLastChunk: index === uploadSession.totalChunks - 1,
                        text: index === 0 ? text : '' // Texto solo con el primer fragmento
                    };
                    
                    // Timeout de seguridad
                    const timeout = setTimeout(() => {
                        console.log(`Timeout para fragmento ${index + 1}`);
                        handleChunkError(index, "Timeout en la respuesta del servidor");
                    }, 60000); // Aumentado a 60s
                    
                    try {
                        // Enviar metadatos y el Blob del fragmento directamente
                        // Socket.IO v3+ soporta enviar datos binarios directamente
                        // CORREGIDO: Usar el nombre de evento correcto 'chunkUpload'
                        socket.emit('chunkUpload', chunkMetadata, chunkBlob, (response) => {
                            // Actualizar timestamp de última actividad
                            uploadSession.lastActivity = Date.now();
                            uploadSession.activeUploads--;
                            
                            if (response && response.success) {
                                // Marcar chunk como completado
                                chunkInfo.status = 'completed';
                                uploadedChunks.add(index); // Añadir al set de completados
                                console.log(`Fragmento ${index + 1}/${totalChunks} confirmado.`);
                                
                                // Si fue el primer chunk, actualizar fileId si cambió y marcar como confirmado
                                if (index === 0) {
                                    if (response.fileId && response.fileId !== uploadSession.fileId) {
                                        console.log(`FileId actualizado por el servidor a: ${response.fileId}`);
                                        uploadSession.fileId = response.fileId;
                                    }
                                    if (!uploadSession.firstChunkConfirmed) {
                                        console.log('Primer fragmento confirmado. Iniciando carga del resto.');
                                        uploadSession.firstChunkConfirmed = true;
                                    }
                                }
                                
                                // Actualizar progreso
                                updateProgress(calculateProgress(), `Progreso: ${getCompletedCount()}/${totalChunks} fragmentos (${Math.round(calculateProgress())}%)`);
                                
                                // Verificar si hemos terminado
                                checkCompletion();
                                
                                // Intentar subir más chunks
                                uploadNextChunks();
                                
                            } else {
                                console.error(`Error en fragmento ${index + 1}:`, response?.error || 'Error desconocido');
                                handleChunkError(index, response?.error || 'Error desconocido');
                            }
                        });
                    } catch (socketError) {
                        clearTimeout(timeout);
                        console.error(`Error al enviar fragmento ${index + 1} al servidor:`, socketError);
                        handleChunkError(index, "Error al enviar datos");
                    }
                    
                }).catch(error => {
                    console.error(`Error al calcular checksum para fragmento ${index + 1}:`, error);
                    handleChunkError(index, "Error al verificar integridad");
                });
            }
            
            // Función para manejar errores de chunks
            function handleChunkError(index, error) {
                console.error(`Error en fragmento ${index + 1}: ${error}`);
                const chunkInfo = uploadSession.chunks.get(index);
                
                if (chunkInfo.attempts < 3) {
                    // Reintentar
                    chunkInfo.status = 'pending';
                    console.log(`Reintentando subida del fragmento ${index + 1} (intento ${chunkInfo.attempts + 1}/3)`);
                    setTimeout(() => {
                        uploadNextChunks();
                    }, 1000 * chunkInfo.attempts);
                } else {
                    // Marcar como fallido
                    chunkInfo.status = 'failed';
                    
                    // Verificar si podemos continuar sin este chunk
                    if (canContinueWithoutChunk(index)) {
                        console.log(`Continuando sin fragmento ${index + 1}`);
                        uploadNextChunks();
                    } else {
                        handleUploadError(`Error al subir fragmento ${index + 1} después de varios intentos`);
                    }
                }
            }
            
            // Verificar si podemos continuar sin un chunk específico
            function canContinueWithoutChunk(index) {
                // Si es el primer chunk, no podemos continuar
                if (index === 0) return false;
                
                // Si es uno de los primeros chunks (metadatos críticos), no podemos continuar
                if (index < 3) return false;
                
                // Calcular porcentaje de chunks completados
                const completedPercent = (getCompletedCount() / uploadSession.totalChunks) * 100;
                
                // Si tenemos al menos 95% y es un chunk del final, podemos continuar
                return completedPercent >= 95 && index > uploadSession.totalChunks * 0.75;
            }
            
            // Finalizar la carga cuando todos los chunks están completos (o suficientes)
            function finalizeUpload() {
                console.log('Finalizando carga...');
                
                // Obtener lista de chunks completados
                const completedChunks = getCompletedChunks();
                
                socket.emit('finalizeUpload', {
                    sessionId: uploadSession.id,
                    fileId: uploadSession.fileId,
                    fileName: uploadSession.fileName,
                    completedChunks: completedChunks,
                    text: text
                }, response => {
                    // --- START ADDITION ---
                    // If finalization fails, allow retrying later
                    if (!(response && response.success)) {
                        console.log('Finalization failed, allowing potential retry.');
                        uploadSession.isFinalizing = false; 
                    }
                    // --- END ADDITION ---

                    if (response && response.success) {
                        console.log(`Archivo finalizado correctamente: ${response.mediaId || uploadSession.fileId}`);
                        
                        // Actualizar UI
                        updateProgress(100, '¡Archivo subido completamente!');
                        
                        // Mostrar mensaje de éxito
                        completeUpload();
                        
                        // Crear mensaje en el chat a partir de lo que nos devuelve el servidor
                        if (response.confirmedMessage) {
                            outputMediaMessage(response.confirmedMessage);
                        } else {
                            // Construir mensaje con la información disponible
                            const message = {
                                username: localUsername,
                                userId: socket.id,
                                time: moment().format('HH:mm'),
                                text: text,
                                media: `/api/stream/${response.mediaId || uploadSession.fileId}`,
                                fileType: fileType,
                                fileName: file.name,
                                fileSize: file.size,
                                isLargeFile: true,
                                mediaId: response.mediaId || uploadSession.fileId
                            };
                            
                            outputMediaMessage(message);
                        }
                        
                        // Mostrar notificación si fue una carga parcial
                        const isPartial = completedChunks.length < totalChunks;
                        if (isPartial) {
                            showTransferNotification(
                                `Archivo "${file.name}" subido con ${completedChunks.length}/${totalChunks} fragmentos`,
                                'warning'
                            );
                        }
                    } else {
                        handleUploadError(`Error al finalizar: ${response?.error || 'Error de conexión'}`);
                    }
                });
            }
            
            // Verificar estado periódicamente con el servidor
            function scheduleStatusCheck() {
                setTimeout(() => {
                    // Solo verificar si la carga aún está en progreso
                    if (!isUploadComplete()) {
                        console.log('Verificando estado con el servidor...');
                        
                        socket.emit('checkUploadStatus', {
                            sessionId: uploadSession.id,
                            fileId: uploadSession.fileId
                        }, response => {
                            if (response && response.success) {
                                console.log('Estado recibido del servidor:', response);
                                
                                // Actualizar estado local según lo que reporta el servidor
                                if (response.chunks && response.chunks.length > 0) {
                                    response.chunks.forEach(serverChunk => {
                                        const localChunk = uploadSession.chunks.get(serverChunk.index);
                                        
                                        if (serverChunk.status === 'completed' && 
                                            localChunk && localChunk.status !== 'completed') {
                                            console.log(`Fragmento ${serverChunk.index + 1} ya estaba completo en el servidor`);
                                            localChunk.status = 'completed';
                                        }
                                    });
                                    
                                    // Actualizar UI con el progreso sincronizado
                                    updateProgress(
                                        calculateProgress(),
                                        `Progreso sincronizado: ${getCompletedCount()}/${totalChunks}`
                                    );
                                    
                                    // Verificar finalización
                                    checkCompletion();
                                }
                                
                                // Si aún no hemos terminado, programar otra verificación
                                if (!isUploadComplete()) {
                                    scheduleStatusCheck();
                                }
                            } else {
                                console.warn('Error al verificar estado:', response?.error);
                                
                                // Seguir programando verificaciones aunque haya un error
                                scheduleStatusCheck();
                            }
                        });
                    }
                }, 10000); // Verificar cada 10 segundos
            }
            
            // Obtener conteo de chunks completados
            function getCompletedCount() {
                return [...uploadSession.chunks.values()]
                    .filter(c => c.status === 'completed').length;
            }
            
            // Obtener lista de índices de chunks completados
            function getCompletedChunks() {
                return [...uploadSession.chunks.entries()]
                    .filter(([_, chunk]) => chunk.status === 'completed')
                    .map(([index, _]) => index);
            }
            
            // Calcular el progreso general
            function calculateProgress() {
                const completed = getCompletedCount();
                const inProgress = uploadSession.activeUploads;
                
                // Dar algo de peso visual a los chunks en proceso (0.3 de avance)
                return Math.min(99, Math.round(
                    ((completed + (inProgress * 0.3)) / uploadSession.totalChunks) * 100)
                );
            }
            
            // Verificar si la carga está completa
            function isUploadComplete() {
                // Verificar si todos los chunks están completados
                const completedCount = getCompletedCount();
                
                // CORREGIDO: Solo considerar completo si TODOS los chunks están listos.
                // Eliminar la lógica de completitud parcial (>= 95% y chunks faltantes al final).
                if (completedCount === totalChunks) {
                    console.log(`Carga completa verificada: ${completedCount}/${totalChunks} chunks completados.`);
                    return true;
                }
                
                return false;
            }
            
            // Verificar y gestionar la finalización
            function checkCompletion() {
                // Contador para verificar el estado de cada chunk
                const counts = {
                    completed: 0,
                    pending: 0,
                    uploading: 0,
                    failed: 0
                };
                
                // Contar el estado de cada chunk
                for (const chunk of uploadSession.chunks.values()) {
                    counts[chunk.status]++;
                }
                
                console.log(`Estado de carga: ${counts.completed}/${totalChunks} completados, ${counts.uploading} en progreso, ${counts.pending} pendientes, ${counts.failed} fallidos`);
                
                if (isUploadComplete()) {
                    // --- START REPLACEMENT ---
                    if (!uploadSession.isFinalizing) {
                        console.log('Carga completa detectada, iniciando finalización...');
                        uploadSession.isFinalizing = true; // Mark as finalizing
                        finalizeUpload();
                    } else {
                        console.log('Carga completa detectada, pero ya está en proceso de finalización.');
                    }
                    // --- END REPLACEMENT ---
                } else if (counts.uploading === 0 && uploadSession.activeUploads < MAX_PARALLEL_UPLOADS && counts.pending > 0) {
                    // Si no hay uploads activos, tenemos capacidad y hay chunks pendientes
                    console.log('No hay uploads activos, continuando con más chunks...');
                    uploadNextChunks();
                } else if (counts.uploading === 0 && counts.pending === 0 && counts.failed > 0) {
                    // Si no hay uploads activos, no hay pendientes, pero hay fallidos
                    console.log(`Finalización fallida: ${counts.failed} chunks fallidos no pueden ser recuperados`);
                    // Intentar recuperar los fallidos una última vez
                    for (const [index, chunk] of uploadSession.chunks.entries()) {
                        if (chunk.status === 'failed') {
                            // Reintentar una última vez
                            console.log(`Último intento para el chunk ${index}...`);
                            chunk.status = 'pending';
                            chunk.attempts = 0; // Reiniciar intentos
                        }
                    }
                    uploadNextChunks();
                }
            }
            
            // Función para calcular checksum (para verificación de integridad)
            function calculateChecksum(blob) {
                return new Promise((resolve) => {
                    // Implementación simplificada - en producción usar algo como SHA-256
                    const reader = new FileReader();
                    reader.onload = function() {
                        // Usar los primeros bytes para un checksum rápido
                        const array = new Uint8Array(reader.result.slice(0, 1024));
                        let hash = 0;
                        for (let i = 0; i < array.length; i++) {
                            hash = ((hash << 5) - hash) + array[i];
                            hash |= 0; // Convertir a entero de 32 bits
                        }
                        resolve(hash.toString(16));
                    };
                    reader.readAsArrayBuffer(blob);
                });
            }
        }
        
    } catch (generalError) {
        console.error('Error general en handleMediaUpload:', generalError);
        alert('Ha ocurrido un error al procesar el archivo. Por favor, inténtelo de nuevo.');
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

// Mostrar mensaje de texto en el DOM
function outputMessage(message, doScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', 'fade-in');
    
    // Comprobar si el mensaje es del usuario actual
    if (message.userId === socket.id || message.username === localUsername) {
        div.classList.add('self');
    }
    
    const safeUsername = escapeHTML(message.username);
    const safeTime = escapeHTML(message.time);
    const safeText = escapeHTML(message.text);

    // Formatear el mensaje con datos sanitizados
    div.innerHTML = `
        <p class="meta">${safeUsername} <span>${safeTime}</span></p>
        <p class="text">${safeText}</p>
    `;
    
    // Añadir el mensaje al contenedor
    document.querySelector('.chat-messages').appendChild(div);
    
    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 10);
    
    if (doScroll) {
        scrollToBottom();
    }
}

// Mostrar mensaje con archivo multimedia en el DOM
function outputMediaMessage(message, doScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', 'fade-in');

    // Determinar si el mensaje es propio
    const isSelf = message.username === localUsername;
    if (isSelf) {
        div.classList.add('self');
    }

    // Crear el contenido multimedia en función del tipo
    let mediaContent = '';

    // Preparar datos del botón de descarga
    const getDownloadButton = (url, fileName, title, isVideo = false, mediaId = '') => {
        // Usar la URL de descarga específica para el botón
        const finalDownloadUrl = (isVideo || message.fileType === 'audio') && mediaId ? `/api/download/${mediaId}` : url;
        return `<a href="${finalDownloadUrl}" class="download-btn" download="${fileName || 'archivo'}"
                 title="${title}" ${isVideo ? `data-is-video="true" data-media-id="${mediaId}"` : ''}>
                <i class="fas fa-cloud-download-alt"></i>
               </a>`;
    };

    if (message.fileType === 'image' || message.fileType === 'gif') {
        mediaContent = `
            <div class="image-container">
                <img src="${message.media}" alt="${message.fileType === 'image' ? 'Imagen' : 'GIF'} compartida" class="media-content">
            </div>
        `;
    } else if (message.fileType === 'video') {
        // Usar una URL específica para streaming si existe mediaId (GridFS)
        // Si no, usar la URL directa (para archivos pequeños o externos)
        const videoSrc = message.mediaId ? `/api/stream/${message.mediaId}` : message.media;

        mediaContent = `
            <div class="video-container">
                <div class="video-wrapper">
                    <video src="${videoSrc}" class="media-content" preload="metadata" controls></video>
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
        message.media, // URL original o base
        message.fileName,
        downloadTitle,
        message.fileType === 'video',
        message.mediaId || ''
    );

    div.innerHTML = `
        <div class="message-header">
            <p class="meta">${message.username} <span>${message.time}</span></p>
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
    }, 10);

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
        window.location.href = 'index.html';
    })
    .catch(error => {
        console.error('Error al cerrar sesión:', error);
        // Incluso si hay error, limpiar localStorage y redirigir
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = 'index.html';
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