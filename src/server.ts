import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

const start = async () => {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`API running on port ${env.PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
