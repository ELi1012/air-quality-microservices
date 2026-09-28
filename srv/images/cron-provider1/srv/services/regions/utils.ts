
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function loadJsonDirectory(dirPath) {
  try {
    // 1. Read all file names in the directory
    const files = await readdir(dirPath);
    console.log(files)
    
    // 2. Filter for JSON files only
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    // 3. Map files to a list of promises that read and parse each file
    const loadPromises = jsonFiles.map(async (file) => {
      const filePath = join(dirPath, file);
      const fileContent = await readFile(filePath, 'utf-8');
      
      return {
        fileName: file,
        data: JSON.parse(fileContent) // Parse string into a JS object
      };
    });

    // 4. Resolve all promises concurrently
    const jsonObjects = await Promise.all(loadPromises);
    return jsonObjects;

  } catch (error) {
    console.error("Error loading JSON files:", error);
  }
}


// if no options: pass an empty {} as options
export const formatUrl = (baseUrl: string, options: Record<string, any>): URL => {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(options).toString()

    return url;
}

/** Fixes MSC Datamart URL
 * by inserting `/aqhi` in the path.
 * 
 * @param currentObsPath 
 * @returns 
 */
export const fixCurrentObservationPath = (currentObsPath: string) => {
    // put 'aqhi' in the path
    return currentObsPath.replace('/air_quality/', '/air_quality/aqhi/');
}

