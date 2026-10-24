import nodemailer from 'nodemailer';
import { env, isProd, isTest } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getIntegration } from './integrations';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tenantId?: string | null;
  campaignId?: string;
  contactId?: string;
  fromName?: string;
}

/** Test hook: every message is captured here when NODE_ENV=test */
export const testOutbox: EmailMessage[] = [];

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

async function smtpConfig(): Promise<SmtpConfig | null> {
  const stored = await getIntegration('platform', 'SMTP');
  if (stored?.enabled && stored.config.host) {
    return {
      host: String(stored.config.host),
      port: Number(stored.config.port ?? 587),
      secure: Boolean(stored.config.secure),
      user: stored.config.user ? String(stored.config.user) : undefined,
      password: stored.secrets.password,
      from: String(stored.config.from ?? env.EMAIL_FROM),
    };
  }
  if (env.SMTP_HOST) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    };
  }
  return null;
}

export async function emailConfigured() {
  return (await smtpConfig()) !== null;
}

export type SendResult = { status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string };

/**
 * Sends an email and records the outcome in MessageLog. When no provider is
 * configured the message is logged as SKIPPED (never reported as sent).
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  let result: SendResult;
  let providerMessageId: string | undefined;
  if (isTest) {
    testOutbox.push(msg);
    result = { status: 'SENT' };
  } else {
    const cfg = await smtpConfig();
    if (!cfg) {
      result = { status: 'SKIPPED', error: 'No email provider configured' };
      if (!isProd) logger.warn({ to: msg.to, subject: msg.subject, text: msg.text }, 'Email not sent (no provider) – content logged for development');
    } else {
      try {
        const transport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
        });
        const from = msg.fromName ? `${msg.fromName.replace(/[<>"]/g, '')} <${cfg.from.replace(/^.*<|>.*$/g, '')}>` : cfg.from;
        const info = await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
        providerMessageId = info.messageId;
        result = { status: 'SENT' };
      } catch (e) {
        result = { status: 'FAILED', error: e instanceof Error ? e.message : String(e) };
        logger.error({ err: e, to: msg.to }, 'email send failed');
      }
    }
  }
  await prisma.messageLog.create({
    data: {
      tenantId: msg.tenantId ?? null,
      campaignId: msg.campaignId,
      contactId: msg.contactId,
      channel: 'EMAIL',
      to: msg.to,
      subject: msg.subject,
      status: result.status,
      error: result.error,
      providerMessageId,
    },
  });
  return result;
}
