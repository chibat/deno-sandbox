import { BufReader } from "https://deno.land/std/io/bufio.ts";

const DELIMITER = "\r\n";

export type HeaderValue = string | number;

export type Request = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: URL | string;
  body?: string;
  headers?: Map<string, HeaderValue>;
  proxy?: URL | string;
};

export type Response = {
  body: string;
  status: number | null;
  headers: Map<string, HeaderValue>;
};

export async function exchange(request: Request): Promise<Response> {

  const endpointUrl = request.url instanceof URL ? request.url : new URL(request.url);

  const proxyUrl = !request.proxy
    ? null
    : request.proxy instanceof URL
    ? request.proxy
    : new URL(request.proxy);

  const connectUrl = proxyUrl ? proxyUrl : endpointUrl;
  const connectTls = connectUrl.protocol === "https:";

  const connectPort = connectUrl.port
    ? Number.parseInt(connectUrl.port)
    : connectTls
    ? 443
    : 80;

  const connectParam = { hostname: connectUrl.hostname, port: connectPort };

  const conn =
    await (connectTls ? Deno.connectTls(connectParam) : Deno.connect(connectParam));

  const reader = new BufReader(conn);

  const endpointTls = endpointUrl.protocol === "https:";
  if (proxyUrl && endpointTls) {
    await connectProxy(endpointUrl, conn, reader);
  }

  const requestMessage = makeRequestMessage(request, endpointUrl);
  console.debug(requestMessage);
  await Deno.writeAll(conn, new TextEncoder().encode(requestMessage));
  const response = await makeResponse(reader);
  conn.close();
  return response;
}

async function connectProxy(url: URL, conn: Deno.Conn, reader: BufReader) {

  const port = url.port ? url.port : url.protocol === "https:" ? 443 : 80;

  const requestLine =
    `CONNECT ${url.hostname}:${port} HTTP/1.1${DELIMITER}${DELIMITER}`;

  console.debug(requestLine);
  await Deno.writeAll(conn, new TextEncoder().encode(requestLine));
  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    if (lineResult.line.length === 0) {
      break;
    }
  }

  // TODO if 200 response, start TLS
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

async function makeResponse(reader: BufReader) {
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
  console.debug(status);
  return {
    status: status,
    body: body,
    headers: headers,
  };
}

