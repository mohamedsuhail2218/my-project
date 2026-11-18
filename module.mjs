// @ts-check
import { module } from "@prisma/composer";
import digitalTwinCyberWarService from "./service.mjs";

export default module("netpulse-ai", ({ provision }) => {
  provision(digitalTwinCyberWarService, { id: "digitaltwincyberwar" });
});
