import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const envFile = path.join(root, '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
const modelApiType = process.env.MODEL_API_TYPE || 'chat-completions'
if (modelApiType !== 'responses' && modelApiType !== 'chat-completions') {
  throw new Error('MODEL_API_TYPE must be responses or chat-completions')
}
const keyFile = process.env.MODEL_API_KEY_FILE?.trim()
const apiKey =
  process.env.MODEL_API_KEY?.trim() ||
  (keyFile ? fs.readFileSync(path.resolve(root, keyFile), 'utf8').trim() : undefined)
export const config = {
  root,
  data: path.resolve(root, process.env.PATCHLAB_DATA || 'data'),
  host: process.env.PATCHLAB_HOST || '127.0.0.1',
  port: Number(process.env.PATCHLAB_PORT || 4310),
  databaseUrl: process.env.DATABASE_URL,
  sandbox: process.env.PATCHLAB_SANDBOX || 'local',
  image: process.env.PATCHLAB_SANDBOX_IMAGE || 'patchlab-fixture:local',
  hostData: process.env.PATCHLAB_HOST_DATA,
  instanceId: process.env.PATCHLAB_INSTANCE_ID || 'default',
  cgroupParent: process.env.PATCHLAB_CGROUP_PARENT || '',
  model: process.env.MODEL_ID,
  apiKey,
  baseUrl: process.env.MODEL_BASE_URL,
  modelApiType
}
