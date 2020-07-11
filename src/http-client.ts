import { BufReader } from "https://deno.land/std/io/bufio.ts";

class Header {
  static readonly CONTENT_LENGTH = "content-length";
  static readonly TRANSFER_ENCODING = "transfer-encoding";

  readonly name: string;
  readonly value: string;

  constructor(line: string) {
    const position = line.indexOf(":");
    this.name = line.substring(0, position).trim().toLowerCase();
    this.value = line.substring(position + 1).trim();
  }
}

export type Response = {
  body: string | null;
  contentLength: number | null;
  transferEncoding: string | null;
};

export async function request(hostname: string, path: string): Promise<Response> {
  const conn = await Deno.connectTls({ hostname: hostname, port: 443 });
  await Deno.writeAll(
    conn,
    new TextEncoder().encode(`
GET ${path} HTTP/1.1
Host: ${hostname}
Accept: */*

`),
  );

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
  conn.close();
  return new Promise<Response>((resolve, _reject) =>
    resolve(
      {
        body: body,
        contentLength: contentLength,
        transferEncoding: transferEncoding,
      },
    )
  );
}

// normal
const hostname = "gist.githubusercontent.com";
const path =
  "/chibat/b207260420c1b85012036ffc6743f427/raw/16d7a15460df1d40596b2e6a151fd2604ea10afd/hello.txt";

// chunk
//const hostname = "github.com";
//const path = "/";

const res = await request(hostname, path);
console.log("Body: " + res.body);

// deno run -A http-client.ts
