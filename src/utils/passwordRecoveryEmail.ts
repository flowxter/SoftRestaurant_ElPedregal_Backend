import { emailTransport } from '../config/nodemailer'
import { env } from '../config/env'

async function sendViaResend(options: { from: string; to: string; subject: string; html: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Resend error ${response.status}: ${text}`)
  }
}

async function sendEmail(options: { from: string; to: string; subject: string; html: string }) {
  if (env.NODE_ENV === 'production' && env.RESEND_API_KEY) {
    return sendViaResend(options)
  }

  return emailTransport.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  })
}

export class PasswordRecoveryEmail {
  /**
   * Sends a password recovery email with a link containing the reset token
   */
  static async sendRecoveryEmail(email: string, resetToken: string): Promise<void> {
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, var(--primary-600), var(--primary-800)); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; margin: 20px 0; padding: 12px 30px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .warning { color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Recuperación de Contraseña</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Recibimos una solicitud para restablecer tu contraseña en <strong>El Pedregal</strong>.</p>
              <p>Haz clic en el siguiente botón para restablecer tu contraseña:</p>
              <a href="${resetLink}" class="button">Restablecer Contraseña</a>
              <p>O copia y pega este enlace en tu navegador:</p>
              <p><small>${resetLink}</small></p>
              <p class="warning">
                Este enlace expirará en 1 hora. Si no solicitaste restablecer tu contraseña, ignora este correo.
              </p>
            </div>
          </div>
        </body>
      </html>
    `

    await sendEmail({
      from: env.RESEND_FROM,
      to: email,
      subject: 'Recuperar contraseña - El Pedregal',
      html: htmlContent,
    })
  }

  /**
   * Sends a password change confirmation email
   */
  static async sendPasswordChangedEmail(email: string, name: string): Promise<void> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, var(--primary-600), var(--primary-800)); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px; }
            .success { color: #10b981; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Contraseña Actualizada</h1>
            </div>
            <div class="content">
              <p>Hola ${name},</p>
              <p>Tu contraseña ha sido <span class="success">actualizada exitosamente</span>.</p>
              <p>Si no realizaste este cambio, por favor contacta con el equipo de soporte inmediatamente.</p>
              <p>
                Saludos,<br>
                El equipo de <strong>El Pedregal</strong>
              </p>
            </div>
          </div>
        </body>
      </html>
    `

    await sendEmail({
      from: env.RESEND_FROM,
      to: email,
      subject: 'Tu contraseña ha sido actualizada - El Pedregal',
      html: htmlContent,
    })
  }
}
