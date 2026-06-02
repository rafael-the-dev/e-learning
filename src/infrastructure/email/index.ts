// =============================================================================
// EMAIL ABSTRACTION
// Future providers: Resend, SendGrid, SMTP
// =============================================================================

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

// =============================================================================
// CONSOLE EMAIL (development)
// =============================================================================

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log("[email]", {
      to: message.to,
      subject: message.subject,
    });
  }
}

// =============================================================================
// PROVIDER FACTORY
// =============================================================================

function createEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  switch (provider) {
    case "console":
      return new ConsoleEmailProvider();
    // case "resend":
    //   return new ResendEmailProvider(process.env.RESEND_API_KEY!)
    // case "smtp":
    //   return new SmtpEmailProvider(...)
    default:
      return new ConsoleEmailProvider();
  }
}

export const email = createEmailProvider();
