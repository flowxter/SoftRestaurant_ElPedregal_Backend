import nodemailer, { Transporter } from 'nodemailer'
import { env } from './env'

/**
 * Nodemailer transport instance configured for Gmail when credentials are available.
 * If they are not configured, the transport falls back to a local SMTP stub.
 */
const transportOptions =
  env.NODE_ENV === 'development' || env.GMAIL_USER
    ? {
        service: 'gmail',
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_APP_PASSWORD,
        },
      }
    : {
        host: 'localhost',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: '',
        },
      }

export const emailTransport: Transporter = nodemailer.createTransport(transportOptions)

/**
 * Verify email configuration is working
 */
emailTransport.verify((error, success) => {
  if (error) {
    console.error('[Nodemailer] Email configuration error:', error)
  } else if (success) {
    console.log('[Nodemailer] Email service ready')
  }
})
