// Confirms, from the host, that Postgres and Redis answer with the right protocol.
// Plain Node (node:net), no database library. Exit code != 0 on failure.
import net from "node:net";

const HOST = "127.0.0.1";
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 2000;

// Postgres SSLRequest: length (8) + code 80877103. The server answers 1 byte, "S" or "N".
const POSTGRES_SSL_REQUEST = Buffer.from([
  0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f,
]);

const checks = [
  {
    name: "Postgres",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    request: POSTGRES_SSL_REQUEST,
    accepts: (reply) =>
      reply.length >= 1 && (reply[0] === 0x53 || reply[0] === 0x4e),
  },
  {
    name: "Redis",
    port: Number(process.env.REDIS_PORT ?? 6379),
    request: Buffer.from("PING\r\n"),
    accepts: (reply) => reply.toString().startsWith("+PONG"),
  },
];

function probe({ port, request, accepts }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: HOST, port });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error("timeout")));
    socket.once("connect", () => socket.write(request));
    socket.once("data", (reply) => {
      socket.destroy();
      if (accepts(reply)) {
        resolve();
      } else {
        reject(new Error("unexpected response"));
      }
    });
    socket.once("error", reject);
    socket.once("close", () =>
      reject(new Error("connection closed without a response")),
    );
  });
}

async function check(target) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await probe(target);
      console.log(`${target.name}: answered on ${HOST}:${target.port}`);
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  console.error(
    `${target.name}: no answer on ${HOST}:${target.port} (${lastError.message})`,
  );
  return false;
}

const results = await Promise.all(checks.map(check));
process.exit(results.every(Boolean) ? 0 : 1);
