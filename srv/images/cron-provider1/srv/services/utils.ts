




/**
 * Validates that specific keys exist in process.env
 * @param {string[]} keys - Array of environment variable names to check
 */
export function validateEnvs(keys: string[]) {
  const missing = keys.filter((key) => process.env[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
};


/**
 * Utility function to avoid repetition.
 * Used for PurpleAir API to include API key in request.
 * 
 * @param url Full URL with parameters
 * @param headers Includes the API key 
 * @returns response as JSON
 */
export async function fetch_from_url(url: string, headers: Record<string, any>) {
    const response = await fetch(url, {
        method: "GET",
        headers
    });

    if (!response.ok) {
        let errorDetails;
        try { errorDetails = await response.json(); }
        catch {
            // Fallback if the body isn't JSON (e.g., a string or empty)
            errorDetails = await response.text();
        }

        const errorMessage = typeof errorDetails === 'object' 
            ? JSON.stringify(errorDetails) 
            : errorDetails;

        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
    }

    return await response.json();
}

