import { app } from "./app";
import { initSchema } from "./db";

const PORT = Number(process.env.PORT) || 4000;

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Legal Ledger API listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema", err);
    process.exit(1);
  });
