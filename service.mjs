// @ts-check
import node from "@prisma/composer/node";
import { compute } from "@prisma/composer-prisma-cloud";

export default compute({
  name: "digital-twin-cyber-war",
  deps: {},
  build: node({ module: import.meta.url, dir: "server", entry: "index.js", dependencies: "external" }),
});
