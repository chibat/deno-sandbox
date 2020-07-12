import { BufReader } from "https://deno.land/std/io/bufio.ts";

const DELIMITER = "\r\n";

export type HeaderValue = string | number;

export type Request = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: URL | string;
  body?: string;
  headers?: Map<string, HeaderValue>;
  proxy?: string; // TODO
};

export type Response = {
  body: string;
  status: number | null;
  headers: Map<string, HeaderValue>;
};

export async function exchange(request: Request): Promise<Response> {
  const url = request.url instanceof URL ? request.url : new URL(request.url);
  const requestMessage = makeRequestMessage(request, url);

  const conn =
    await (url.protocol === "https:"
      ? Deno.connectTls({ hostname: url.hostname, port: 443 })
      : Deno.connect({ hostname: url.hostname, port: 80 }));

  await Deno.writeAll(conn, new TextEncoder().encode(requestMessage));
  const response = await makeResponse(conn);
  conn.close();
  return response;
}

export class Header {
  static readonly CONTENT_LENGTH = "content-length";
  static readonly TRANSFER_ENCODING = "transfer-encoding";
  static readonly HOST = "host";
  static readonly ACCEPT = "accept";
}

function makeRequestMessage(request: Request, url: URL) {
  const headerMap = request.headers ? request.headers : new Map();
  const headerArray = new Array<string>();

  if (!headerMap.has(Header.HOST)) {
    headerMap.set(Header.HOST, url.hostname);
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

  return `${request.method} ${url.href} HTTP/1.1${DELIMITER}` +
    headerArray.join("") +
    DELIMITER +
    (request.body ? request.body : "");
}

async function makeResponse(conn: Deno.Conn) {
  const reader = new BufReader(conn);
  const decoder = new TextDecoder("utf-8");
  let body = "";

  const lineResult = await reader.readLine();
  const status = lineResult
    ? Number.parseInt(decoder.decode((lineResult)?.line).split(" ")[1])
    : null;

  const headers = new Map<string, string>();
  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    if (lineResult.line.length === 0) {
      break;
    }

    const line = decoder.decode(lineResult.line);
    const position = line.indexOf(":");
    const name = line.substring(0, position).trim().toLowerCase();
    const value = line.substring(position + 1).trim();
    headers.set(name, value);
  }

  const value = headers.get(Header.CONTENT_LENGTH);
  const contentLength = value ? Number.parseInt(value, 10) : 0;

  if (contentLength) {
    const buf = new Uint8Array(contentLength);
    await reader.readFull(buf);
    body = decoder.decode(buf);
  } else if (headers.get(Header.TRANSFER_ENCODING) === "chunked") {
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
    const bodyArray = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunkArray) {
      bodyArray.set(chunk, position);
      position += chunk.length;
    }
    body = decoder.decode(bodyArray);
  }
  return {
    status: status,
    body: body,
    headers: headers,
  };
}

// normal
//const url =
//  "https://gist.githubusercontent.com/chibat/b207260420c1b85012036ffc6743f427/raw/16d7a15460df1d40596b2e6a151fd2604ea10afd/hello.txt";

// chunk
const url = "https://github.com/";

const request: Request = { method: "GET", url: url };
const res = await exchange(request);
console.log("Status: " + res.status);
console.log("Body: " + res.body);

// deno run -A http-client.ts
