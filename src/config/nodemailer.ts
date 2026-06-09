import nodemailer, { Transporter } from 'nodemailer'
import { env } from './env'

/**
 * Nodemailer transport instance configured for Gmail in development.
 * In other environments it can fallback to the generic SMTP transport.
 */
const transportOptions =
  env.NODE_ENV === 'development'
    ? {
        service: 'gmail',
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_APP_PASSWORD,
        },
      }
    : {
        host: env.EMAIL_HOST,
        port: env.EMAIL_PORT,
        secure: env.EMAIL_PORT === 465,
        auth: {
          user: env.EMAIL_USER,
          pass: env.EMAIL_PASS,
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
