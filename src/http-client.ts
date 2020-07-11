import { BufReader } from "https://deno.land/std/io/bufio.ts";

const HEADER_CONTENT_LENGTH = "content-length: ";

async function request(hostname: string, path: string): Promise<string> {
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
  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    if (lineResult.line.length === 0) {
      break;
    }
    const header = decoder.decode(lineResult.line);
    if (header.toLowerCase().startsWith(HEADER_CONTENT_LENGTH)) {
      contentLength = Number.parseInt(
        header.substring(HEADER_CONTENT_LENGTH.length),
      );
    }
  }
  // console.log("Content-Length: " + contentLength);

  if (contentLength) {
    const buf = new Uint8Array(contentLength);
    await reader.readFull(buf);
    const body = decoder.decode(buf);
    conn.close();
    return new Promise((resolve, _reject) => resolve(body));
  }

  // chunk

  const chunkArray: Array<Uint8Array> = [];
  while (true) {
    const lineResult = await reader.readLine();
    if (lineResult == null) {
      break;
    }
    const line = decoder.decode(lineResult.line).trim();
    if (line === "0") {
      conn.close();
      break;
    }
    // console.log("### 16 " + line);
    const chunkSize = Number.parseInt(line, 16);
    if (isNaN(chunkSize)) {
       console.error(chunkSize);
       break;
    }
    // console.log("### chunk size: " + chunkSize);
    const chunk = new Uint8Array(chunkSize);
    await reader.readFull(chunk);
    chunkArray.push(chunk);
    // console.log("### debug03 " + chunk);
    await reader.readLine();
  }

  const size = chunkArray.map(chunk => chunk.length).reduce((arg1, arg2) => arg1 + arg2);
  const bodyUint8Array = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunkArray) {
    bodyUint8Array.set(chunk, position);
    position += chunk.length;
  }
  const body = decoder.decode(bodyUint8Array);
  return new Promise<string>((resolve, _reject) => resolve(body));
}

// normal
//const hostname = "gist.githubusercontent.com";
//const path = "/chibat/b207260420c1b85012036ffc6743f427/raw/16d7a15460df1d40596b2e6a151fd2604ea10afd/hello.txt";

// chunk
const hostname = "github.com";
const path = "/";

const body: string = await request(hostname, path);
console.log("Body: " + body);

// deno run -A http-client.ts
