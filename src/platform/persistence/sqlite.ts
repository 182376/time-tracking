import Database from "@tauri-apps/plugin-sql";

// Low-level DB adapter only.
// Read-model queries should live in shared read repositories.
let dbInstance: Database | null = null;
let dbInstancePromise: Promise<Database> | null = null;

export const getDB = async () => {
  try {
    if (dbInstance) {
      return dbInstance;
    }

    if (!dbInstancePromise) {
      dbInstancePromise = Database.load("sqlite:timetracker.db")
        .then((db) => {
          dbInstance = db;
          return db;
        })
        .catch((error) => {
          dbInstancePromise = null;
          throw error;
        });
    }

    return await dbInstancePromise;
  } catch (error) {
    console.error("Database Load Error:", error);
    throw new Error(
      "DB_INIT_FAILED: " + (error instanceof Error ? error.message : String(error)),
    );
  }
};
