import { register } from "node:module";

register("./testLoader.js", new URL("./", import.meta.url));
