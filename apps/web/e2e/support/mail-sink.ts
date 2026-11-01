import { createServer, type Server } from 'node:net';

export interface SunkMessage {
  to: string;
  text: string;
}

/** Undoes quoted-printable soft breaks and escapes, which mail clients apply to long lines. */
function decodeQuotedPrintable(body: string): string {
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * The smallest SMTP server nodemailer will talk to, so a test can read the mail the API sends.
 * It listens on the port from .env; when that is taken (Mailpit running), start() resolves false.
 */
export class MailSink {
  readonly messages: SunkMessage[] = [];
  private server: Server | undefined;

  start(port = Number(process.env.SMTP_PORT ?? 1026)): Promise<boolean> {
    const server = createServer((socket) => {
      let buffer = '';
      let inData = false;
      let recipient = '';
      socket.write('220 impulse-test-sink\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        for (;;) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n');
            if (end === -1) {
              return;
            }
            const raw = buffer.slice(0, end);
            buffer = buffer.slice(end + 5);
            inData = false;
            const split = raw.indexOf('\r\n\r\n');
            this.messages.push({
              to: recipient,
              text: decodeQuotedPrintable(raw.slice(split + 4)),
            });
            socket.write('250 queued\r\n');
            continue;
          }
          const newline = buffer.indexOf('\r\n');
          if (newline === -1) {
            return;
          }
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 2);
          const verb = line.slice(0, 4).toUpperCase();
          if (verb === 'RCPT') {
            recipient = /<([^>]+)>/.exec(line)?.[1] ?? '';
          }
          if (verb === 'DATA') {
            inData = true;
            socket.write('354 go ahead\r\n');
          } else if (verb === 'QUIT') {
            socket.end('221 bye\r\n');
          } else {
            socket.write('250 ok\r\n');
          }
        }
      });
      socket.on('error', () => undefined);
    });
    this.server = server;
    return new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
  }

  async waitFor(to: string, timeoutMs = 10_000): Promise<SunkMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.find((message) => message.to === to);
      if (found) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`No mail arrived for ${to}`);
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }
}
