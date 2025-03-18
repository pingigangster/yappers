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

// Tamaño máximo para archivos multimedia (200 MB)
const MAX_FILE_SIZE = 200 * 1024 * 1024;
// Límite de caracteres para mensajes de texto
const MAX_MESSAGE_LENGTH = 200;

// Procesar el nombre de usuario para remover timestamp si existe
let username = window.username;
// Verificar si el nombre tiene un timestamp (es una reconexión)
if (username && username.includes('_')) {
    const parts = username.split('_');
    const lastPart = parts[parts.length - 1];
    
    // Si la última parte es un número (timestamp), usar solo el nombre original
    if (!isNaN(lastPart) && lastPart.length > 5) {
        const originalUsername = parts.slice(0, -1).join('_');
        // Usar el nombre original sin el timestamp
        console.log(`Detectado nombre con timestamp: ${username}, usando nombre original: ${originalUsername}`);
        username = originalUsername;
        
        // Actualizar el nombre en localStorage pero no en la URL
        localStorage.setItem('chatUsername', username);
    }
}

// Mostrar el nombre de usuario en la interfaz
if (usernameDisplay) {
    usernameDisplay.innerText = username;
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

// Conectar al Socket.io
const socket = io();

// Variables para el control de la carga
let messagesLoaded = false;
let usersLoaded = false;
let connectionEstablished = false;
let loadingTimeout = null;

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
    // Establecer un tiempo máximo de espera para la carga (5 segundos)
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
                username: username,
                id: socket.id
            }];
            displayUsers(defaultUserList);
        }
        
        // Mostrar la interfaz
        updateLoadingProgress(100, 'Tiempo de espera excedido, continuando...');
    }, 5000); // Reducir a 5 segundos
}

// Control de sesión para mensajes de bienvenida
let isFirstVisit = false;
if (!localStorage.getItem('hasVisitedBefore')) {
    // Primera visita, guardar en localStorage
    localStorage.setItem('hasVisitedBefore', 'true');
    localStorage.setItem('username', username);
    isFirstVisit = true;
} else if (localStorage.getItem('username') !== username) {
    // Si el usuario cambió de nombre, considerarlo como nueva visita
    localStorage.setItem('username', username);
    isFirstVisit = true;
}

// Actualizar progreso de carga
updateLoadingProgress(20, 'Conectando al servidor...');

// Configurar el timeout de carga
setupLoadingTimeout();

// Evento de confirmación de conexión exitosa
socket.on('connectionSuccess', (data) => {
    console.log('Conexión establecida correctamente:', data);
    connectionEstablished = true;
    updateLoadingProgress(35, 'Conexión establecida, cargando datos...');
    
    // Si no recibimos datos en 5 segundos después de la conexión,
    // asumimos que hay algún problema con la base de datos
    setTimeout(() => {
        if (!messagesLoaded || !usersLoaded) {
            console.warn('La conexión se estableció pero los datos no han llegado en 5 segundos');
            
            // Forzar la carga
            if (!messagesLoaded) {
                messagesLoaded = true;
                console.log('Forzando carga de mensajes');
            }
            
            if (!usersLoaded) {
                usersLoaded = true;
                displayUsers([{
                    username: username,
                    id: socket.id
                }]);
                console.log('Forzando carga de usuarios');
            }
            
            // Completar la carga
            updateLoadingProgress(100, 'Carga forzada por timeout de datos');
        }
    }, 5000);
});

// Unirse al chat (ahora con una secuencia específica y más logs)
setTimeout(() => {
    console.log('Enviando evento joinChat al servidor...');
    updateLoadingProgress(30, 'Solicitando datos del chat...');
    socket.emit('joinChat', { 
        username: username, 
        isFirstVisit: isFirstVisit 
    });
    
    // Añadir un timeout adicional de seguridad solo para este evento
    setTimeout(() => {
        if (!connectionEstablished) {
            console.warn('No se ha recibido confirmación de conexión después de 3 segundos');
        }
        
        if (!messagesLoaded || !usersLoaded) {
            console.warn('No se ha recibido respuesta completa de joinChat después de 3 segundos');
            console.log('Estado actual - Conexión:', connectionEstablished, 'Mensajes:', messagesLoaded, 'Usuarios:', usersLoaded);
        }
    }, 3000);
}, 500); // Pequeño retraso para mostrar la animación

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
            username: username,
            id: socket.id
        }];
        displayUsers(defaultUserList);
        usersLoaded = true;
        checkAllLoaded();
    }
});

// Agregar un evento para reconexiones por si se pierde la conexión
socket.on('reconnect', () => {
    console.log('Reconectado al servidor, solicitando datos actualizados...');
    socket.emit('joinChat', { 
        username: username, 
        isFirstVisit: false 
    });
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
            if (message.username === username) {
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

// Enviar mensaje
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Obtener texto del mensaje
    const msg = e.target.elements.msg.value;

    if (msg.trim() !== '') {
        // Verificar si el mensaje excede el límite de caracteres
        if (msg.length > MAX_MESSAGE_LENGTH) {
            // Truncar el mensaje si es demasiado largo
            const truncatedMsg = msg.substring(0, MAX_MESSAGE_LENGTH);
            
            // Opcional: Mostrar una notificación
            alert(`El mensaje excede el límite de ${MAX_MESSAGE_LENGTH} caracteres. Se enviará truncado.`);
            
            // Emitir mensaje truncado al servidor
            socket.emit('chatMessage', truncatedMsg);
        } else {
            // Emitir mensaje normal al servidor
            socket.emit('chatMessage', msg);
        }

        // Limpiar input
        e.target.elements.msg.value = '';
        e.target.elements.msg.focus();
        
        // Actualizar el contador a 0
        const counter = document.querySelector('.char-counter span');
        if (counter) counter.textContent = '0';
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

// Función para manejar la subida de archivos multimedia
function handleMediaUpload(file) {
    console.log('Iniciando handleMediaUpload con archivo:', file ? file.name : 'ninguno');
    
    if (!file) {
        console.error('No se proporcionó un archivo válido');
        return;
    }
    
    if (file.size > MAX_FILE_SIZE) {
        alert(`El archivo es demasiado grande. El tamaño máximo es ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
        return;
    }
    
    try {
        console.log('Procesando archivo de tamaño:', formatFileSize(file.size));
        
        // Determinar tipo de archivo inmediatamente (sin esperar)
        const fileType = getFileType(file);
        console.log('Tipo de archivo detectado:', fileType);
        
        const isLargeFile = file.size > 15 * 1024 * 1024;
        const text = document.getElementById('msg').value;
        
        // Ya no mostramos la barra de progreso global
        // progressContainer.style.display = 'none';
        
        // Crear el mensaje temporal inmediatamente
        const tempDiv = document.createElement('div');
        tempDiv.classList.add('message', 'self', 'fade-in', 'uploading-message');
        
        // Agregar el contenido del mensaje temporal
        tempDiv.innerHTML = `
            <p class="meta">${username} <span>${moment().format('HH:mm')}</span></p>
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
            
            // Limpiar input de texto
            document.getElementById('msg').value = '';
            
            // Actualizar contador
            const counter = document.querySelector('.char-counter span');
            if (counter) counter.textContent = '0';
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
        tipo: file.type
    });
    
    // Determinar el tipo de archivo
    if (file.type.startsWith('image/')) {
        return fileName.endsWith('.gif') ? 'gif' : 'image';
    } else if (file.type.startsWith('video/')) {
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
    
    // Añadir clase 'self' si el mensaje es del usuario actual
    if (message.userId === socket.id) {
        div.classList.add('self');
    }
    
    // Añadir clase para mensajes con archivo
    if (message.fileType) {
        div.classList.add('with-file');
    }
    
    let mediaContent = '';
    let fileName = '';
    let fileSize = '';
    
    // Extraer información del archivo
    if (message.fileName) {
        fileName = message.fileName;
    }
    
    if (message.fileSize) {
        fileSize = formatFileSize(message.fileSize);
    }
    
    // URL del archivo - puede ser un data URL o una URL a GridFS
    const mediaUrl = message.media;
    
    // Determinar qué tipo de contenido multimedia mostrar
    switch (message.fileType) {
        case 'image':
            mediaContent = `
                <div class="file-container image-container">
                    <img class="media-content" src="${mediaUrl}" alt="Imagen compartida">
                    <a href="${mediaUrl}" download="${fileName || 'imagen_' + Date.now()}" class="download-btn" title="Descargar imagen">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
            break;
        case 'gif':
            mediaContent = `
                <div class="file-container image-container">
                    <img class="media-content" src="${mediaUrl}" alt="GIF compartido">
                    <a href="${mediaUrl}" download="${fileName || 'gif_' + Date.now()}" class="download-btn" title="Descargar GIF">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
            break;
        case 'video':
            mediaContent = `
                <div class="file-container video-container">
                    <div class="video-wrapper">
                        <video class="media-content" preload="metadata" controls>
                            <source src="${mediaUrl}" type="video/mp4">
                            Tu navegador no soporta videos.
                        </video>
                        <i class="fas fa-play-circle video-play-icon"></i>
                    </div>
                    <a href="${mediaUrl}" download="${fileName || 'video_' + Date.now()}" class="download-btn" title="Descargar video">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
            break;
        case 'audio':
            mediaContent = `
                <div class="file-container audio-container">
                    <audio class="media-content" controls>
                        <source src="${mediaUrl}" type="audio/mpeg">
                        Tu navegador no soporta audio.
                    </audio>
                    <a href="${mediaUrl}" download="${fileName || 'audio_' + Date.now()}" class="download-btn" title="Descargar audio">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
            break;
        case 'pdf':
        case 'word':
        case 'excel':
        case 'powerpoint':
        case 'archive':
        case 'text':
        case 'code':
        case 'file':
            const fileIcons = {
                pdf: 'fa-file-pdf',
                word: 'fa-file-word',
                excel: 'fa-file-excel',
                powerpoint: 'fa-file-powerpoint',
                archive: 'fa-file-archive',
                text: 'fa-file-alt',
                code: 'fa-file-code',
                file: 'fa-file'
            };
            
            const fileIcon = fileIcons[message.fileType] || 'fa-file';
            const fileExtension = fileName ? fileName.split('.').pop().toLowerCase() : '';
            
            // Nombre para mostrar: priorizar el nombre real del archivo
            let fileDisplayName = fileName || `Archivo ${message.fileType}`;
            
            mediaContent = `
                <div class="document-wrapper">
                    <div class="file-container document-container">
                        <a href="${mediaUrl}" download="${fileDisplayName}" class="external-download-btn" title="Descargar archivo">
                            <i class="fas fa-download"></i>
                        </a>
                        <div class="file-info">
                            <i class="fas ${fileIcon} file-icon"></i>
                            <div class="file-details">
                                <span class="file-name" title="${fileDisplayName}">${fileDisplayName}</span>
                                ${fileSize ? `<span class="file-size">${fileSize}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            break;
        default:
            mediaContent = '<p>Tipo de archivo no soportado</p>';
    }
    
    // Añadir indicador si es un archivo grande
    const isLargeFileIndicator = message.isLargeFile ? 
        `<span class="large-file-badge" title="Archivo grande almacenado en servidor"><i class="fas fa-server"></i></span>` : '';
    
    div.innerHTML = `
        <p class="meta">
            ${message.username} <span>${message.time}</span>
            ${isLargeFileIndicator}
        </p>
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

// Formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Hacer scroll hacia abajo
function scrollToBottom() {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
}

// Inicializar el contador de caracteres
setupCharacterCounter(); 