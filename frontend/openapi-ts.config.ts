import { defineConfig } from '@hey-api/openapi-ts';

// Default to the FastAPI local docs URL
const OPENAPI_URL = process.env.OPENAPI_SCHEMA_URL || 'http://localhost:8000/openapi.json';

export default defineConfig({
  input: OPENAPI_URL,
  output: 'src/client', // This creates the full SDK folder
  plugins: [
    '@hey-api/schemas', // Generates JSON schemas for validation if needed
    {
      name: '@hey-api/typescript',
      enums: 'typescript', // Converts Python Enums to TS Enums
    },
    {
      name: '@hey-api/sdk',
      transformer: true, // Enables the SDK methods (e.g., UserService.getUsers)
    },
    {
      name: '@hey-api/transformers',
      dates: true, // Automatically converts ISO strings from Neon/Python into JS Date objects
    },
  ],
});