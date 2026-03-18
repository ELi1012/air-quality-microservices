

export async function runCronjob(asyncFn: () => void, successMsg, failMsg) {
    const now = Date.now();

    try {
        await asyncFn();
        console.log(`${successMsg} (at ${new Date(now).toUTCString()})`);
        process.exit(0);
    } catch (error) {
        console.error(failMsg, error);
        process.exit(1);
    }
}