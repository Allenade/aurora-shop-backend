import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: Resend | null;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {
    const apiKey = this.config.get('email.apiKey', { infer: true });
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendSignupOtp(email: string, code: string) {
    const fromName = this.config.get('email.fromName', { infer: true });
    const fromEmail = this.config.get('email.fromEmail', { infer: true });
    const subject = 'Your Aurora Stores verification code';
    const text = `Your verification code is ${code}. It expires in ${this.config.get('otp.expiryMinutes', { infer: true })} minutes. If you did not request this, you can ignore this email.`;
    const html = `
      <p>Your Aurora Stores verification code is:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>
      <p>This code expires in ${this.config.get('otp.expiryMinutes', { infer: true })} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    if (!this.client) {
      const nodeEnv = this.config.get('nodeEnv', { infer: true });
      this.logger.warn(`RESEND_API_KEY missing — OTP for ${email} not emailed`);
      this.logger.log(`[aurora-otp] ${email} → ${code}`);
      if (nodeEnv === 'production') {
        throw new Error(
          'Email delivery is not configured. Set RESEND_API_KEY on the server.',
        );
      }
      return { emailed: false };
    }

    const { error } = await this.client.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [email],
      subject,
      text,
      html,
    });

    if (error) {
      this.logger.error(`Resend failed for ${email}: ${error.message}`);
      throw new Error(error.message);
    }

    const nodeEnv = this.config.get('nodeEnv', { infer: true });
    if (nodeEnv !== 'production') {
      this.logger.log(`[aurora-otp] emailed ${email} → ${code}`);
    }
    return { emailed: true };
  }

  /**
   * Legacy single-course confirmation. Paid enrollments use the queued
   * combined after-payment email instead, so this is not called on success.
   */
  async sendEnterFirstConfirmation(input: {
    email: string;
    firstName: string;
    lastName: string;
    program?: string;
    tracks: string[];
    amount: number;
    currency: string;
    reference: string;
  }) {
    const fromName = this.config.get('email.fromName', { infer: true });
    const fromEmail = this.config.get('email.fromEmail', { infer: true });
    const program = input.program?.trim() || 'Core 3.0';
    const tracks = input.tracks.length
      ? input.tracks.join(', ')
      : 'your selected track(s)';
    const amountLabel =
      input.amount > 0
        ? `${input.currency} ${input.amount.toLocaleString('en-NG')}`
        : 'Free';
    const subject = `${program} enrollment confirmed`;
    const text = `Hi ${input.firstName},

Your ${program} enrollment is confirmed.

Program: ${program}
Tracks: ${tracks}
Amount: ${amountLabel}
Reference: ${input.reference}

We'll follow up with next steps shortly.

— Aurora Robotics`;
    const html = `
      <p>Hi ${input.firstName},</p>
      <p>Your <strong>${program}</strong> enrollment is confirmed.</p>
      <ul>
        <li><strong>Program:</strong> ${program}</li>
        <li><strong>Tracks:</strong> ${tracks}</li>
        <li><strong>Amount:</strong> ${amountLabel}</li>
        <li><strong>Reference:</strong> ${input.reference}</li>
      </ul>
      <p>We'll follow up with next steps shortly.</p>
      <p>— Aurora Robotics</p>
    `;

    if (!this.client) {
      this.logger.warn(
        `RESEND_API_KEY missing — Enter First confirmation for ${input.email} not emailed`,
      );
      this.logger.log(
        `[enter-first] ${input.email} tracks=${tracks} ref=${input.reference}`,
      );
      return { emailed: false };
    }

    const { error } = await this.client.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [input.email],
      subject,
      text,
      html,
    });

    if (error) {
      this.logger.error(
        `Resend failed for Enter First ${input.email}: ${error.message}`,
      );
      throw new Error(error.message);
    }

    return { emailed: true };
  }
}
