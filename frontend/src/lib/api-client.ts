import { client } from '@/client/client.gen';
import * as sdk from '@/client/sdk.gen';
import * as types from '@/client/types.gen';

client.setConfig({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  credentials: 'include',
  throwOnError: true,
});

export { client, sdk, types };
