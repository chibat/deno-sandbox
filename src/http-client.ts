import { BufReader } from "https://deno.land/std/io/bufio.ts";

const DELIMITER = "\r\n";

export type HeaderValue = string | number;

export type Request = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: URL;
  body?: string;
  headers?: Map<string, HeaderValue>;
  proxy?: string; // TODO
};

export type Response = {
  body: string | null;
  contentLength: number | null;
  transferEncoding: string | null;
};

export async function exchange(request: Request): Promise<Response> {

  const requestMessage = makeRequestMessage(request);

  const conn =
    await (request.url.protocol === "https:"
      ? Deno.connectTls({ hostname: request.url.hostname, port: 443 })
      : Deno.connect({ hostname: request.url.hostname, port: 80 }));

  await Deno.writeAll(conn, new TextEncoder().encode(requestMessage));
  const response = await makeResponse(conn);
  conn.close();
  return response;
}

class Header {
  static readonly CONTENT_LENGTH = "content-length";
  static readonly TRANSFER_ENCODING = "transfer-encoding";
  static readonly HOST = "host";
  static readonly ACCEPT = "accept";

  readonly name: string;
  readonly value: string;

  constructor(line: string) {
    const position = line.indexOf(":");
    this.name = line.substring(0, position).trim().toLowerCase();
    this.value = line.substring(position + 1).trim();
  }
}

function makeRequestMessage(request: Request) {
  const headerMap = request.headers ? request.headers : new Map();
  const headerArray = new Array<string>();

  if (!headerMap.has(Header.HOST)) {
    headerMap.set(Header.HOST, request.url.hostname);
  }
  if (!headerMap.has(Header.ACCEPT)) {
    headerMap.set(Header.ACCEPT, "*/*");
  }
  if (!headerMap.has(Header.CONTENT_LENGTH) && request.body) {
    const requestBodyLength = (new Blob([request.body])).size;
    headerMap.set(Header.CONTENT_LENGTH, requestBodyLength);
  }
  headerMap.forEach((value, key) =>
    headerArray.push(`${key}: ${value}${DELIMITER}`)
  );

  return `${request.method} ${request.url.href} HTTP/1.1${DELIMITER}` +
    headerArray.join("") +
    DELIMITER +
    (request.body ? request.body : "");
}

async function makeResponse(conn: Deno.Conn) {
  const reader = new BufReader(conn);
  const decoder = new TextDecoder("utf-8");
  let contentLength: number = 0;
  let transferEncoding: string | null = null;
  let body = "";

  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    if (lineResult.line.length === 0) {
      break;
    }
    const header = new Header(decoder.decode(lineResult.line));
    if (header.name === Header.CONTENT_LENGTH) {
      contentLength = Number.parseInt(header.value, 10);
    }
    if (header.name === Header.TRANSFER_ENCODING) {
      transferEncoding = header.value;
    }
  }
  // console.log("Content-Length: " + contentLength);

  if (contentLength) {
    const buf = new Uint8Array(contentLength);
    await reader.readFull(buf);
    body = decoder.decode(buf);
  } else if (transferEncoding === "chunked") {
    // chunk

    const chunkArray: Array<Uint8Array> = [];
    while (true) {
      const lineResult = await reader.readLine();
      if (lineResult == null) {
        break;
      }
      const line = decoder.decode(lineResult.line).trim();
      if (line === "0") {
        break;
      }
      const chunkSize = Number.parseInt(line, 16);
      if (isNaN(chunkSize)) {
        console.error(chunkSize);
        break;
      }
      const chunk = new Uint8Array(chunkSize);
      await reader.readFull(chunk);
      chunkArray.push(chunk);
      await reader.readLine();
    }

    const size = chunkArray.map((chunk) => chunk.length).reduce((arg1, arg2) =>
      arg1 + arg2
    );
    const bodyUint8Array = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunkArray) {
      bodyUint8Array.set(chunk, position);
      position += chunk.length;
    }
    body = decoder.decode(bodyUint8Array);
  }
  return {
        body: body,
        contentLength: contentLength,
        transferEncoding: transferEncoding,
  };
}

// normal
//const url = new URL(
//  "https://gist.githubusercontent.com/chibat/b207260420c1b85012036ffc6743f427/raw/16d7a15460df1d40596b2e6a151fd2604ea10afd/hello.txt",
//);

// chunk
const url = new URL("https://github.com/");

const request: Request = { method: "GET", url: url };
const res = await exchange(request);
console.log("Body: " + res.body);

// deno run -A http-client.ts
