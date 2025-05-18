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
  const subject = '¡Bienvenido a Yappers!';
  const html = `
    <body style="margin: 0; padding: 0; background-color: #2C2F33; font-family: Arial, Helvetica, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding: 20px 0;">
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
              <tr>
                <td align="center" style="padding: 40px 30px; border-bottom: 1px solid #eeeeee;">
                  <h1 style="color: #4a6ee0; font-size: 28px; margin: 0 0 20px 0; font-weight: 700;">¡Bienvenido, ${user.username}!</h1>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Gracias por registrarte en Yappers.
                  </p>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    Estamos emocionados de tenerte con nosotros. Ya puedes comenzar a chatear y conectar con otros usuarios.
                  </p>
                  <a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="background-color: #4a6ee0; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                    Ir a la Aplicación
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px; text-align: center;">
                  <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 0;">
                    Si tienes alguna pregunta, no dudes en contactarnos.
                  </p>
                  <p style="color: #888888; font-size: 12px; line-height: 1.5; margin: 15px 0 0 0;">
                    Este es un correo automático, por favor no respondas a este mensaje.<br>
                    &copy; ${new Date().getFullYear()} Yappers. Todos los derechos reservados.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
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
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const subject = 'Restablecimiento de Contraseña Solicitado';
  const html = `
    <body style="margin: 0; padding: 0; background-color: #2C2F33; font-family: Arial, Helvetica, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding: 20px 0;">
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
              <tr>
                <td align="center" style="padding: 40px 30px; border-bottom: 1px solid #eeeeee;">
                  <h1 style="color: #4a6ee0; font-size: 28px; margin: 0 0 20px 0; font-weight: 700;">Hola, ${user.username}</h1>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.
                  </p>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace es válido por 1 hora.
                  </p>
                  <a href="${resetUrl}" style="background-color: #4a6ee0; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                    Restablecer Contraseña
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px; text-align: center;">
                  <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 0;">
                    Si no solicitaste un restablecimiento de contraseña, puedes ignorar este correo de forma segura. Tu contraseña no cambiará.
                  </p>
                  <p style="color: #888888; font-size: 12px; line-height: 1.5; margin: 15px 0 0 0;">
                    Este es un correo automático, por favor no respondas a este mensaje.<br>
                    &copy; ${new Date().getFullYear()} Yappers. Todos los derechos reservados.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
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