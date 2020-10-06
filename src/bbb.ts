
import request from 'https://cdn.skypack.dev/graphql-request@^2.0.0';
console.log('graphql-request loaded:', request);

const query = `
  {
    Movie(title: "Inception") {
      releaseDate
      actors {
        name
      }
    }
  }
`;

request('https://api.graph.cool/simple/v1/movies', query).then((data: any) => console.log(data));


