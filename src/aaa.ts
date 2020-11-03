// denow run --allow-read --allow-run aaa.ts


const cmd = ["help"];
Deno.exit((await Deno.run({cmd: [Deno.execPath()].concat(cmd)}).status()).code);
