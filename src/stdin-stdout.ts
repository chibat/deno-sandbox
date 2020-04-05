const encoder = new TextEncoder();
const decoder = new TextDecoder();
const buf = new Uint8Array(1024);
Deno.stdout.writeSync(encoder.encode('What your name ? : '));
Deno.stdin.readSync(buf);
Deno.stdout.writeSync(encoder.encode('Hello World ! ' + decoder.decode(buf)));
