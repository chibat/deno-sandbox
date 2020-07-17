

const params = new URLSearchParams();

params.append("aaa", "bbb");
params.append("aaa", "ddd");

console.log(params.toString());

const url = new URL("https://host/path");
url.searchParams.append("bbb", "ccc");
url.searchParams.append("bbb", "ccc");
console.log(url.searchParams.toString());


