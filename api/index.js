import { createRequestHandler } from "@react-router/node";

const build = await import("../build/server/index.js");

export default createRequestHandler({ build });
