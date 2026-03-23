import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import nodemailer from "nodemailer";
import { Resend } from "resend";

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  timestamp: string;
}

class EmailMockService {
  private logsDir: string;
  private transporter: any | null = null;
  private fromAddress: string | null = null;
  private resend: Resend | null = null;
  private resendFrom: string | null = null;

  constructor() {
    this.logsDir = join(process.cwd(), "logs");
    this.ensureLogsDir();
    this.initResend();
    this.initTransporter();
  }

  private ensureLogsDir() {
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return join(this.logsDir, `email-log-${timestamp}.log`);
  }

  private initTransporter() {
    if (this.resend) {
      console.log("[Email] Resend API is configured. SMTP transport will be used only as fallback.");
      return;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    const portRaw = process.env.SMTP_PORT || "587";
    const secure = process.env.SMTP_SECURE === "true";

    if (!host || !user || !pass || !from) {
      console.log("[Email] SMTP is not fully configured. Falling back to mock logging.");
      return;
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
      console.warn("[Email] SMTP_PORT is invalid. Falling back to mock logging.");
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    this.fromAddress = from;
    console.log(`[Email] SMTP delivery enabled (${host}:${port}, secure=${secure}).`);
  }

  private initResend() {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "Cropto Deck <onboarding@resend.dev>";
    if (!apiKey) return;

    this.resend = new Resend(apiKey);
    this.resendFrom = from;
    console.log(`[Email] Resend API delivery enabled (from=${from}).`);
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const email: EmailMessage = {
      to,
      subject,
      body,
      timestamp,
    };

    const logEntry = `
${"=".repeat(80)}
TIMESTAMP: ${timestamp}
TO: ${to}
SUBJECT: ${subject}
${"─".repeat(80)}
${body}
${"=".repeat(80)}

`;

    // Log to console
    console.log("\n📧 [EMAIL MOCK]", {
      to,
      subject,
      timestamp,
    });

    let delivered = false;

    // Try Resend API first (if configured)
    if (this.resend && this.resendFrom) {
      try {
        await this.resend.emails.send({
          from: this.resendFrom,
          to,
          subject,
          text: body,
        });
        console.log(`   ✓ Email delivered via Resend API to: ${to}`);
        delivered = true;
      } catch (resendError) {
        console.error(`   ✗ Resend delivery failed for ${to}. Falling back to SMTP/log only.`, resendError);
      }
    }

    // Try real SMTP delivery next (if configured)
    if (!delivered && this.transporter && this.fromAddress) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          text: body,
        });
        console.log(`   ✓ Email delivered via SMTP to: ${to}`);
        delivered = true;
      } catch (smtpError) {
        console.error(`   ✗ SMTP delivery failed for ${to}. Falling back to log only.`, smtpError);
      }
    }

    // Log to file
    try {
      const logFile = this.getLogFileName();
      appendFileSync(logFile, logEntry, "utf8");
      console.log(`   ✓ Email logged to: ${logFile}`);
    } catch (error) {
      console.error("Failed to write email log:", error);
    }
  }

  async sendMarginCallEmail(
    userEmail: string,
    userName: string,
    optionId: string,
    amountRequired: string,
    deadline: Date
  ): Promise<void> {
    const subject = "⚠️ Margin Call - Action Required";
    const body = `
Hello ${userName},

You have received a MARGIN CALL for one of your options.

Option ID: ${optionId}
Amount Required: $${amountRequired}
Deadline: ${deadline.toLocaleString()}

Please log in to your account and top up your collateral to avoid liquidation.

If the required collateral is not added before the deadline, your position will be automatically settled.

Best regards,
Cropto Trading Platform
`;

    await this.sendEmail(userEmail, subject, body);
  }

  async sendLiquidationEmail(
    userEmail: string,
    userName: string,
    optionId: string,
    reason: string
  ): Promise<void> {
    const subject = "🔴 Position Liquidated";
    const body = `
Hello ${userName},

Your option position has been liquidated.

Option ID: ${optionId}
Reason: ${reason}

For more details, please review your account history.

Best regards,
Cropto Trading Platform
`;

    await this.sendEmail(userEmail, subject, body);
  }

  async sendOptionMatchedEmail(
    userEmail: string,
    userName: string,
    optionId: string,
    optionType: string
  ): Promise<void> {
    const subject = "✅ Option Matched";
    const body = `
Hello ${userName},

Your option has been successfully matched!

Option ID: ${optionId}
Type: ${optionType}

You can now view and manage your position in your account.

Best regards,
Cropto Trading Platform
`;

    await this.sendEmail(userEmail, subject, body);
  }

  async sendOptionExercisedEmail(
    userEmail: string,
    userName: string,
    optionId: string,
    pnl: string
  ): Promise<void> {
    const subject = "📊 Option Exercised";
    const body = `
Hello ${userName},

Your option has been exercised.

Option ID: ${optionId}
P&L: $${pnl}

Settlement details are available in your account.

Best regards,
Cropto Trading Platform
`;

    await this.sendEmail(userEmail, subject, body);
  }
}

// Singleton instance
export const emailService = new EmailMockService();
