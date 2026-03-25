import { runQuery } from "./pool"

export async function checkHealth() {
    await runQuery('SELECT 1');
}