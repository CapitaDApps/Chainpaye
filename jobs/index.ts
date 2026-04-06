import Agenda from "agenda";
import { config } from "./config";
import { definitions } from "./definitions";

export const agenda = new Agenda({
  db: { address: config.database, collection: "jobs" },
  processEvery: "1 minute",
  maxConcurrency: 50,
});

agenda.on("ready", async () => {
  console.log("Agenda live and ready!");
});
agenda.on("error", (err) => console.log("Agenda: An error occurred", err));

definitions();
