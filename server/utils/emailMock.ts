import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  timestamp: string;
}

class EmailMockService {
  private logsDir: string;

  constructor() {
    this.logsDir = join(process.cwd(), "logs");
    this.ensureLogsDir();
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
