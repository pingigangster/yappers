const chatForm = document.getElementById('chat-form');
const chatMessages = document.getElementById('chat-messages');
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
const MAX_QUEUE_SIZE = 3; // Máximo de mensajes en cola
const COOLDOWN_TIME = 2000; // 2 segundos de cooldown entre mensajes

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
    
    // Emitir mensaje al servidor
    socket.emit('chatMessage', message);
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
    
    cooldownTimer = null;
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
        
        // Iniciar cooldown
        startCooldown();
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
    
    // Iniciar cooldown
    startCooldown();
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
        
        // Ya no mostramos la barra de progreso global
        // progressContainer.style.display = 'none';
        
        // Crear el mensaje temporal inmediatamente
        const tempDiv = document.createElement('div');
        tempDiv.classList.add('message', 'self', 'fade-in', 'uploading-message');
        
        // Agregar el contenido del mensaje temporal
        tempDiv.innerHTML = `
            <p class="meta">${localUsername} <span>${moment().format('HH:mm')}</span></p>
            <div class="content">
                ${text ? `<p class="text-content">${text}</p>` : ''}
                <div class="media-container">
                    <div class="file-container">
                        <div class="file-upload-info">
                            <i class="fas fa-file-upload"></i>
                            <p>Enviando "${file.name}" (${formatFileSize(file.size)})...</p>
                            <div class="upload-progress-small">
                                <div class="upload-progress-bar-small" style="width: 5%"></div>
                            </div>
                            <div class="upload-status">Iniciando carga...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar al DOM inmediatamente
        document.querySelector('.chat-messages').appendChild(tempDiv);
        
        // Animar y hacer scroll inmediatamente (no esperar)
        tempDiv.classList.add('active');
        scrollToBottom();
        
        // Referencias a elementos de progreso
        const smallProgressBar = tempDiv.querySelector('.upload-progress-bar-small');
        const uploadStatus = tempDiv.querySelector('.upload-status');
        
        console.log('Interfaz de carga preparada');
        
        // Función para manejar errores durante la carga
        function handleUploadError(errorMessage) {
            console.error('Error en la carga:', errorMessage);
            // Ya no necesitamos ocultar la barra global
            // progressContainer.style.display = 'none';
            tempDiv.classList.add('error');
            
            // Actualizar mensaje de estado directamente
            uploadStatus.textContent = errorMessage;
            uploadStatus.classList.add('error-message');
        }
        
        // Función para actualizar el progreso (usada por ambos métodos)
        function updateProgress(percent, statusText) {
            console.log(`Progreso: ${percent}% - ${statusText}`);
            // Ya no actualizamos la barra global
            // uploadProgressBar.style.width = `${percent}%`;
            // progressText.textContent = statusText;
            
            // Actualizar barra en mensaje temporal
            smallProgressBar.style.width = `${percent}%`;
            uploadStatus.textContent = statusText;
        }
        
        // Limpiar cuando se completa la carga
        function completeUpload() {
            console.log('Carga completada');
            // Ya no necesitamos ocultar la barra global
            // setTimeout(() => {
            //     progressContainer.style.display = 'none';
            // }, 1000);
            
            // Quitar mensaje temporal
            setTimeout(() => {
                tempDiv.remove();
            }, 1000);
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
                    console.log('Respuesta del servidor:', response);
                    clearTimeout(uploadTimeout);
                    
                    if (response && response.success) {
                        updateProgress(100, '¡Archivo subido con éxito!');
                        completeUpload();
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
            
            // Manejar el progreso de la lectura
            reader.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    console.log(`Progreso de lectura: ${percent}%`);
                }
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
        
        // Función para cargar archivos grandes en fragmentos
        function uploadLargeFile() {
            const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB por fragmento
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            let currentChunk = 0;
            let fileId = null;
            
            console.log(`Preparando carga fragmentada: ${totalChunks} fragmentos de ${formatFileSize(CHUNK_SIZE)}`);
            updateProgress(10, `Preparando carga fragmentada (${totalChunks} fragmentos)...`);
            
            // Función para subir un fragmento a la vez
            function uploadNextChunk() {
                // Calcular el progreso general
                const overallProgress = Math.round(((currentChunk + 0.5) / totalChunks) * 90) + 10; // 10-100%
                updateProgress(
                    overallProgress,
                    `Subiendo fragmento ${currentChunk + 1} de ${totalChunks}...`
                );
                
                // Cortar el fragmento del archivo
                const start = currentChunk * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                const chunk = file.slice(start, end);
                
                console.log(`Procesando fragmento ${currentChunk + 1}/${totalChunks}, tamaño: ${formatFileSize(chunk.size)}`);
                
                // Leer el fragmento
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    console.log(`Fragmento ${currentChunk + 1} leído, enviando al servidor`);
                    
                    // Datos para enviar este fragmento
                    const chunkData = {
                        fileName: file.name,
                        fileType: fileType,
                        fileSize: file.size,
                        text: currentChunk === 0 ? text : '', // Texto solo con el primer fragmento
                        chunkData: e.target.result,
                        currentChunk: currentChunk,
                        totalChunks: totalChunks,
                        isLastChunk: currentChunk === totalChunks - 1,
                        fileId: fileId // null para el primer fragmento
                    };
                    
                    // Set timeout para detectar problemas del servidor
                    const chunkTimeout = setTimeout(() => {
                        handleUploadError(`No se recibió respuesta del servidor para el fragmento ${currentChunk + 1}`);
                    }, 60000);
                    
                    // Enviar el fragmento
                    socket.emit('chunkUpload', chunkData, (response) => {
                        console.log(`Respuesta del servidor para fragmento ${currentChunk + 1}:`, response);
                        clearTimeout(chunkTimeout);
                        
                        if (response && response.success) {
                            // Guardar el ID del archivo del primer fragmento
                            if (response.fileId) {
                                fileId = response.fileId;
                                console.log('ID de archivo asignado:', fileId);
                            }
                            
                            // Avanzar al siguiente fragmento
                            currentChunk++;
                            
                            if (currentChunk < totalChunks) {
                                // Continuar con el siguiente fragmento
                                uploadNextChunk();
                            } else {
                                // Todos los fragmentos enviados
                                console.log('Todos los fragmentos enviados correctamente');
                                updateProgress(100, '¡Archivo subido con éxito!');
                                completeUpload();
                            }
                        } else {
                            console.error('Error en la respuesta del servidor:', response);
                            handleUploadError(response?.error || `Error al subir fragmento ${currentChunk + 1}`);
                        }
                    });
                };
                
                reader.onerror = function(error) {
                    console.error(`Error al leer fragmento ${currentChunk + 1}:`, error);
                    handleUploadError(`Error al leer fragmento ${currentChunk + 1}`);
                };
                
                // Leer el fragmento como data URL
                try {
                    reader.readAsDataURL(chunk);
                } catch (error) {
                    console.error(`Error al iniciar lectura del fragmento ${currentChunk + 1}:`, error);
                    handleUploadError(`Error al iniciar lectura del fragmento ${currentChunk + 1}`);
                }
            }
            
            // Iniciar el proceso de carga fragmentada
            uploadNextChunk();
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
    
    // Añadir clase 'self' si el mensaje es del usuario actual
    if (message.userId === socket.id) {
        div.classList.add('self');
    }
    
    div.innerHTML = `
        <p class="meta">${message.username} <span>${message.time}</span></p>
        <div class="content">
            <p class="text-content">${message.text}</p>
        </div>
    `;
    document.querySelector('.chat-messages').appendChild(div);
    
    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 10);
    
    // Solo hacer scroll si se solicita (para cargas iniciales diferimos el scroll)
    if (doScroll) {
        scrollToBottom();
    }
}

// Mostrar mensaje con archivo multimedia en el DOM
function outputMediaMessage(message, doScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', 'fade-in');
    
    // Determinar si el mensaje es propio
    if (message.username === localUsername) {
        div.classList.add('self');
    }
    
    // Crear el contenido multimedia en función del tipo
    let mediaContent = '';
    
    if (message.fileType === 'image') {
        mediaContent = `
            <div class="image-container">
                <img src="${message.media}" alt="Imagen compartida" class="media-content">
                <a href="${message.media}" class="download-btn" download="${message.fileName}" title="Descargar imagen">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    } else if (message.fileType === 'gif') {
        mediaContent = `
            <div class="image-container">
                <img src="${message.media}" alt="GIF compartido" class="media-content">
                <a href="${message.media}" class="download-btn" download="${message.fileName}" title="Descargar GIF">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    } else if (message.fileType === 'video') {
        // Siempre tratar los videos como archivos almacenados en GridFS
        // independientemente de su tamaño
        const videoSrc = message.media;
        
        mediaContent = `
            <div class="video-container">
                <div class="video-wrapper">
                    <video src="${videoSrc}" class="media-content" preload="metadata" controls></video>
                    <div class="video-play-icon">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
                <a href="${message.media}" class="download-btn" download="${message.fileName || 'video'}" title="Descargar video">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    } else if (message.fileType === 'audio') {
        mediaContent = `
            <div class="audio-container">
                <audio controls src="${message.media}"></audio>
                <a href="${message.media}" class="download-btn" download="${message.fileName}" title="Descargar audio">
                    <i class="fas fa-download"></i>
                </a>
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
                <a href="${message.media}" class="download-btn" download="${message.fileName}" title="Descargar archivo">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    }
    
    div.innerHTML = `
        <p class="meta">${message.username} <span>${message.time}</span></p>
        <div class="content">
            ${message.text ? `<p class="text-content">${message.text}</p>` : ''}
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
        
        // Mostrar el icono cuando el video se pausa
        video.addEventListener('pause', function() {
            playIcon.style.opacity = '0.8';
        });
        
        // También ocultar el icono al hacer clic en él
        playIcon.addEventListener('click', function(e) {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
            e.stopPropagation();
        });
    }
    
    // Activar animación de entrada
    setTimeout(() => {
        div.classList.add('active');
    }, 10);
    
    // Solo hacer scroll si se solicita (para cargas iniciales diferimos el scroll)
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
                            <div class="download-status">Iniciando descarga...</div>
                        `;
                        
                        // Encontrar el contenedor de archivo para insertar el indicador
                        const fileContainer = messageElement.querySelector('.file-container');
                        if (fileContainer) {
                            fileContainer.appendChild(downloadIndicator);
                        }
                    }
                    
                    const progressBar = downloadIndicator.querySelector('.download-progress-bar');
                    const statusText = downloadIndicator.querySelector('.download-status');
                    
                    // Cambiar estilo del botón
                    downloadLink.classList.add('downloading');
                    
                    // Iniciar descarga con XMLHttpRequest para poder mostrar el progreso
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', downloadUrl, true);
                    xhr.responseType = 'blob';
                    
                    // Inicializar progreso
                    progressBar.style.width = '0%';
                    statusText.textContent = 'Preparando descarga...';
                    
                    // Mostrar progreso de carga, aun si no hay progreso real
                    let fakeProgress = 0;
                    const progressInterval = setInterval(() => {
                        if (fakeProgress < 90) {
                            fakeProgress += 5;
                            progressBar.style.width = fakeProgress + '%';
                            statusText.textContent = `Descargando... ${fakeProgress}%`;
                        }
                    }, 500);
                    
                    // Actualizar progreso durante la descarga
                    xhr.onprogress = function(event) {
                        // Detener el intervalo de progreso falso
                        clearInterval(progressInterval);
                        
                        if (event.lengthComputable) {
                            const percentComplete = Math.round((event.loaded / event.total) * 100);
                            progressBar.style.width = percentComplete + '%';
                            statusText.textContent = `Descargando... ${percentComplete}%`;
                            console.log('Progreso de descarga:', percentComplete + '%', event.loaded, 'de', event.total, 'bytes');
                        } else {
                            // Si no podemos calcular el progreso, mostrar mensaje genérico
                            progressBar.style.width = '50%';
                            statusText.textContent = `Descargando... (tamaño desconocido)`;
                            console.log('Progreso de descarga no disponible, bytes descargados:', event.loaded);
                        }
                    };
                    
                    // Cuando la descarga se completa
                    xhr.onload = function() {
                        // Detener el intervalo de progreso falso
                        clearInterval(progressInterval);
                        
                        if (xhr.status === 200) {
                            // Descargar el archivo usando el objeto URL
                            const blob = xhr.response;
                            const url = window.URL.createObjectURL(blob);
                            
                            // Crear elemento de enlace temporal para forzar la descarga
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            
                            // Obtener el nombre del archivo del atributo download del enlace original
                            a.download = downloadLink.getAttribute('download') || 'archivo_descargado';
                            
                            // Añadir al DOM, hacer clic y luego eliminar
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            
                            // Actualizar UI
                            progressBar.style.width = '100%';
                            statusText.textContent = '¡Descarga completada!';
                            downloadLink.classList.remove('downloading');
                            
                            // Limpiar el indicador después de un tiempo
                            setTimeout(() => {
                                if (downloadIndicator && downloadIndicator.parentNode) {
                                    downloadIndicator.parentNode.removeChild(downloadIndicator);
                                }
                            }, 3000);
                        } else {
                            statusText.textContent = `Error: ${xhr.status}`;
                            downloadLink.classList.remove('downloading');
                        }
                    };
                    
                    // En caso de error
                    xhr.onerror = function(e) {
                        clearInterval(progressInterval);
                        console.error('Error en la descarga:', e);
                        statusText.textContent = 'Error en la descarga';
                        downloadLink.classList.remove('downloading');
                    };
                    
                    // En caso de abortar
                    xhr.onabort = function() {
                        clearInterval(progressInterval);
                        statusText.textContent = 'Descarga cancelada';
                        downloadLink.classList.remove('downloading');
                    };
                    
                    // Iniciar la descarga
                    xhr.send();
                }
            }
        }
    });
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