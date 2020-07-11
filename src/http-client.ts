import { BufReader } from "https://deno.land/std/io/bufio.ts";

const HEADER_CONTENT_LENGTH = "content-length: ";

async function request(hostname: string, path: string) {
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
    let lineResult = await reader.readLine();
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
  console.log("Content-Length: " + contentLength);

  if (contentLength) {
    const buf = new Uint8Array(contentLength);
    await reader.read(buf);
    const body = decoder.decode(buf);
    return body;
  }

  conn.close();
}

const hostname = "gist.githubusercontent.com";
const path =
  "/chibat/b207260420c1b85012036ffc6743f427/raw/16d7a15460df1d40596b2e6a151fd2604ea10afd/hello.txt";
const body = await request(hostname, path);
console.log("Body: " + body);

// deno run -A http-client.ts
