import { createConnection } from "node:net";
import type { SmtpProbeStatus } from "./type.js";

interface SmtpResponse {
  code: number;
  message: string;
}

export interface SmtpProbeInput {
  email: string;
  mxRecords: string[];
  timeoutMs: number;
  heloDomain: string;
  mailFrom: string;
  maxMxHosts: number;
  catchAllCheck: boolean;
}

export interface SmtpProbeOutput {
  status: SmtpProbeStatus;
  host?: string;
  code?: number;
  response?: string;
}

function parseAddress(email: string): { local: string; domain: string } {
  const atIndex = email.lastIndexOf("@");
  return { local: email.slice(0, atIndex), domain: email.slice(atIndex + 1) };
}

async function probeHost(
  host: string,
  input: SmtpProbeInput,
): Promise<SmtpProbeOutput> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: 25 });
    socket.setEncoding("utf8");
    socket.setTimeout(input.timeoutMs);

    let buffer = "";
    let active = true;

    const finish = (output: SmtpProbeOutput) => {
      if (!active) return;
      active = false;
      socket.destroy();
      resolve(output);
    };

    const onTimeout = () =>
      finish({
        status: "unverifiable",
        host,
        response: `SMTP probe timeout after ${input.timeoutMs}ms`,
      });

    socket.once("timeout", onTimeout);
    socket.once("error", (error) =>
      finish({ status: "unverifiable", host, response: error.message }),
    );

    const readResponse = (): Promise<SmtpResponse> =>
      new Promise((resolveResponse, rejectResponse) => {
        const onData = (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) return;
          const last = lines[lines.length - 1]!;
          const match = /^(\d{3})([ -])(.*)$/.exec(last);
          if (!match || match[2] !== " ") return;
          buffer = "";
          socket.off("data", onData);
          resolveResponse({
            code: Number(match[1]),
            message: lines.join(" | "),
          });
        };
        socket.on("data", onData);
        socket.once("error", rejectResponse);
        socket.once("timeout", () => rejectResponse(new Error("SMTP_TIMEOUT")));
      });

    const sendCommand = async (
      command: string,
      accept: number[],
    ): Promise<SmtpResponse> => {
      socket.write(`${command}\r\n`);
      const response = await readResponse();
      if (!accept.includes(response.code)) {
        throw new Error(`${response.code}:${response.message}`);
      }
      return response;
    };

    socket.once("connect", async () => {
      try {
        const greeting = await readResponse();
        if (greeting.code !== 220) {
          finish({
            status: "unverifiable",
            host,
            code: greeting.code,
            response: greeting.message,
          });
          return;
        }

        await sendCommand(`EHLO ${input.heloDomain}`, [250]);
        await sendCommand(`MAIL FROM:<${input.mailFrom}>`, [250]);
        const rcpt = await sendCommand(`RCPT TO:<${input.email}>`, [250, 251, 252, 450, 451, 452, 550, 551, 552, 553, 554]);

        if (rcpt.code >= 550) {
          finish({
            status: "not_exists",
            host,
            code: rcpt.code,
            response: rcpt.message,
          });
          return;
        }

        if (rcpt.code >= 450) {
          finish({
            status: "unverifiable",
            host,
            code: rcpt.code,
            response: rcpt.message,
          });
          return;
        }

        if (input.catchAllCheck) {
          const { domain } = parseAddress(input.email);
          const randomLocal = `probe-${Math.random().toString(36).slice(2, 14)}`;
          const catchAllRcpt = await sendCommand(
            `RCPT TO:<${randomLocal}@${domain}>`,
            [250, 251, 252, 450, 451, 452, 550, 551, 552, 553, 554],
          );
          if (catchAllRcpt.code < 450) {
            finish({
              status: "catch_all",
              host,
              code: catchAllRcpt.code,
              response: catchAllRcpt.message,
            });
            return;
          }
        }

        finish({
          status: "exists",
          host,
          code: rcpt.code,
          response: rcpt.message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        finish({
          status: "unverifiable",
          host,
          response: message,
        });
      } finally {
        if (!socket.destroyed) {
          socket.write("QUIT\r\n");
        }
      }
    });
  });
}

export async function probeSmtpMailbox(
  input: SmtpProbeInput,
): Promise<SmtpProbeOutput> {
  const hosts = input.mxRecords.slice(0, Math.max(1, input.maxMxHosts));
  let lastUnverifiable: SmtpProbeOutput = { status: "unverifiable" };
  for (const host of hosts) {
    const result = await probeHost(host, input);
    if (result.status !== "unverifiable") return result;
    lastUnverifiable = result;
  }
  return lastUnverifiable;
}
