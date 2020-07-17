import { BufReader } from "https://deno.land/std@0.61.0/io/bufio.ts";
import { encode } from "https://deno.land/std@0.61.0/encoding/base64.ts";

export type PasswordCredential = {
  name: string;
  password: string;
}

export type Proxy = {
  hostname: string;
  port: number;
  credentials?: PasswordCredential;
};

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export type Request = {
  method?: Method;
  url: URL | string;
  body?: string | URLSearchParams;
  headers?: Headers;
  credentials?: PasswordCredential;
};

export class Response {
  readonly body?: string;
  readonly status?: number | null;
  readonly headers?: Headers;
  constructor(init: {body?: string, status?: number | null, headers?: Headers}) {
    this.body = init.body;
    this.status = init.status;
    this.headers = init.headers;
  }
  json<T>(reviver?: ((this: any, key: string, value: any) => any) | undefined): T {
    return this.body ? JSON.parse(this.body, reviver) : null;
  }
};

const DELIMITER = "\r\n";

export async function exchange(
  request: Request,
  proxy?: Proxy,
): Promise<Response> {

  const endpointUrl = request.url instanceof URL
    ? request.url
    : new URL(request.url);

  const connectTls = !proxy && endpointUrl.protocol === "https:";
  const connectHostname = proxy ? proxy.hostname : endpointUrl.hostname;

  const connectPort = proxy
    ? proxy.port
    : endpointUrl.port
    ? Number.parseInt(endpointUrl.port)
    : (endpointUrl.protocol === "https:")
    ? 443
    : 80;

  const connectParam = { hostname: connectHostname, port: connectPort };

  let conn =
    await (connectTls
      ? Deno.connectTls(connectParam)
      : Deno.connect(connectParam));

  let reader = new BufReader(conn);
  const endpointTls = endpointUrl.protocol === "https:";

  if (proxy && endpointTls) {
    conn = await connectProxy(endpointUrl, conn, reader, proxy);
    reader = new BufReader(conn);
  }

  const requestMessage = makeRequestMessage(request, endpointUrl);
  console.debug(requestMessage);
  await Deno.writeAll(conn, new TextEncoder().encode(requestMessage));
  const response = await makeResponse(reader);
  conn.close();
  return response;
}

function getPath(url: URL) {
  return url.pathname + url.search + url.hash
}

// for TLS
async function connectProxy(
  endpointUrl: URL,
  conn: Deno.Conn,
  reader: BufReader,
  proxy: Proxy,
): Promise<Deno.Conn> {

  const port = endpointUrl.port ? endpointUrl.port : 443;
  const headers = new Headers();
  headers.set("Host", `${endpointUrl.hostname}:${port} HTTP/1.1`);
  headers.set("Proxy-Connection", `Keep-Alive`);
  if (proxy.credentials) {
    headers.set("Proxy-Authorization", `Basic ${encode(proxy.credentials.name + ":" + proxy.credentials.password)}`);
  }

  const headerArray = new Array<string>();
  headers.forEach((value, key) =>
    headerArray.push(`${key}: ${value}${DELIMITER}`)
  );
  
  const connectRequest = `CONNECT ${endpointUrl.hostname}:${port} HTTP/1.1${DELIMITER}` +
    headerArray.join("") +
    DELIMITER;

  console.debug(connectRequest);
  const decoder = new TextDecoder("utf-8");
  await Deno.writeAll(conn, new TextEncoder().encode(connectRequest));

  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    if (lineResult.line.length === 0) {
      break;
    }
    console.debug(decoder.decode(lineResult.line));
  }

  // TODO if 200 response, start TLS
  return (Deno as any).startTls(
    conn,
    { hostname: endpointUrl.hostname, port: port },
  ); // TODO unstable
}

export class Header {
  static readonly CONTENT_LENGTH = "content-length";
  static readonly TRANSFER_ENCODING = "transfer-encoding";
  static readonly HOST = "host";
  static readonly ACCEPT = "accept";
  static readonly AUTHORIZATION = "authorization";
}

function makeRequestMessage(request: Request, url: URL, proxy?: Proxy) {

  const method = request.method ? request.method : "GET";
  const headers = request.headers ? request.headers : new Headers();
  const headerArray = new Array<string>();
  const bodyString = request.body ? request.body.toString() : "";

  if (!headers.has(Header.HOST)) {
    headers.set(Header.HOST, url.hostname);
  }
  if (!headers.has(Header.ACCEPT)) {
    headers.set(Header.ACCEPT, "*/*");
  }
  if (!headers.has(Header.CONTENT_LENGTH) && bodyString) {
    const requestBodyLength = (new Blob([bodyString])).size;
    headers.set(Header.CONTENT_LENGTH, requestBodyLength.toString());
  }
  if (!headers.has(Header.AUTHORIZATION) && request.credentials) {
    headers.set(Header.AUTHORIZATION, `Basic ${encode(request.credentials.name + ":" + request.credentials.password)}${DELIMITER}`);
  }
  headers.forEach((value, key) =>
    headerArray.push(`${key}: ${value}${DELIMITER}`)
  );

  const uri = proxy && url.protocol === "http:" ? url.href : getPath(url);

  return `${method} ${uri} HTTP/1.1${DELIMITER}` +
    headerArray.join("") +
    DELIMITER +
    bodyString;
}

async function makeResponse(reader: BufReader): Promise<Response> {
  const decoder = new TextDecoder("utf-8");
  let body = "";

  const lineResult = await reader.readLine();
  const status = lineResult
    ? Number.parseInt(decoder.decode((lineResult)?.line).split(" ")[1])
    : null;

  const headers = new Headers();
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
    console.debug(line);
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
  return new Response({
    status: status,
    body: body,
    headers: headers,
  });
}
