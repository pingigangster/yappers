const nodemailer = require('nodemailer');

// Configuración del transporte de correo
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false'
    }
  });
};

/**
 * Envía un correo electrónico
 * @param {Object} options - Opciones del correo
 * @param {string} options.to - Destinatario del correo
 * @param {string} options.subject - Asunto del correo
 * @param {string} options.html - Contenido HTML del correo
 * @returns {Promise} - Promesa con resultado del envío
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Correo enviado: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw error;
  }
};

/**
 * Envía un correo de bienvenida al usuario registrado
 * @param {Object} user - Usuario al que enviar el correo
 * @param {string} user.email - Email del usuario
 * @param {string} user.username - Nombre de usuario
 * @returns {Promise} - Promesa con resultado del envío
 */
const sendWelcomeEmail = async (user) => {
  const subject = '¡Bienvenido a nuestra aplicación!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4a6ee0;">¡Bienvenido, ${user.username}!</h2>
      <p>Gracias por registrarte en nuestra aplicación de chat en tiempo real.</p>
      <p>Ya puedes comenzar a chatear y conectar con otros usuarios.</p>
      <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          Este es un correo automático, por favor no respondas a este mensaje.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html
  });
};

/**
 * Envía un correo con enlace para restablecer contraseña
 * @param {Object} user - Usuario al que enviar el correo
 * @param {string} user.email - Email del usuario
 * @param {string} user.username - Nombre de usuario
 * @param {string} resetToken - Token para restablecer contraseña
 * @returns {Promise} - Promesa con resultado del envío
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  // Construir la URL para restablecer contraseña
  // En producción, debe ser la URL real de tu aplicación
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const subject = 'Restablecimiento de contraseña';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4a6ee0;">Hola, ${user.username}</h2>
      <p>Has solicitado restablecer tu contraseña.</p>
      <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
      <p>
        <a href="${resetUrl}" style="background-color: #4a6ee0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
          Restablecer contraseña
        </a>
      </p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo y tu contraseña seguirá siendo la misma.</p>
      <p>Este enlace expirará en 1 hora por seguridad.</p>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          Este es un correo automático, por favor no respondas a este mensaje.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail
}; 