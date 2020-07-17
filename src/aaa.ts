

const params = new URLSearchParams();

params.append("aaa", "bbb");
params.append("aaa", "ddd");

console.log(params.toString());

const url = new URL("https://host/path");
url.searchParams.append("bbb", "ccc");
url.searchParams.append("bbb", "ccc");
console.log(url.searchParams.toString());

const headers = new Headers();
headers.append("nnn", "vvvv");
headers.append("nnn", "vvvv");
headers.forEach((value, key, p) => {
  console.log(`${key}: ${value}`);
  p.forEach((value2, key2) => {
    console.log(`${key2}: ${value2}`);
  });
});


