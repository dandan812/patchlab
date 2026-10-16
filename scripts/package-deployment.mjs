import fs from 'node:fs/promises'
import { createWriteStream, createReadStream } from 'node:fs'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

const docker = process.env.DOCKER_BIN || 'docker'
const out = path.resolve('data/deployment-us')
await fs.mkdir(out, { recursive: true })
const images = [
  'patchlab-app:20261002',
  'patchlab-fixture:20261002',
  'public.ecr.aws/docker/library/postgres:17-bookworm'
]
const inspect = images.map(
  (image) => JSON.parse(execFileSync(docker, ['image', 'inspect', image], { encoding: 'utf8' }))[0]
)
const platforms = images.map(
  (image) =>
    JSON.parse(
      execFileSync(docker, ['image', 'inspect', '--platform', 'linux/amd64', image], {
        encoding: 'utf8'
      })
    )[0]
)
if (inspect.some((image) => image.Os !== 'linux' || image.Architecture !== 'amd64'))
  throw new Error('Only Linux/AMD64 images may be delivered')
const envFile = path.join(out, 'deployment.env')
const previous = await fs.readFile(envFile, 'utf8').catch((error) => {
  if (error.code !== 'ENOENT') throw error
  return ''
})
const settings = Object.fromEntries(
  previous
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
)
Object.assign(settings, {
  POSTGRES_PASSWORD: settings.POSTGRES_PASSWORD || randomBytes(24).toString('hex'),
  PATCHLAB_ADMIN_PASSWORD:
    settings.PATCHLAB_ADMIN_PASSWORD || randomBytes(24).toString('base64url'),
  PATCHLAB_SESSION_SECRET: settings.PATCHLAB_SESSION_SECRET || randomBytes(32).toString('hex'),
  PATCHLAB_HOST_DATA: '/opt/patchlab/data',
  PATCHLAB_DOCKER_GID: process.env.PATCHLAB_DOCKER_GID || settings.PATCHLAB_DOCKER_GID
})
if (!/^\d+$/.test(settings.PATCHLAB_DOCKER_GID || ''))
  throw new Error('Set the verified host Docker socket group ID')
const file = path.join(out, 'images.tar.gz')
if (process.argv.includes('--metadata-only')) {
  const saved = JSON.parse(await fs.readFile(path.join(out, 'images.json'), 'utf8'))
  if (inspect.some((image, index) => saved.images[index]?.id !== image.Id))
    throw new Error('Images changed; a new archive is required')
} else {
  const save = spawn(docker, ['image', 'save', '--platform', 'linux/amd64', ...images], {
    stdio: ['ignore', 'pipe', 'inherit']
  })
  const exited = new Promise((resolve, reject) => {
    save.once('error', reject)
    save.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`docker save exited ${code}`))
    )
  })
  await Promise.all([
    pipeline(save.stdout, createGzip({ level: 3 }), createWriteStream(file)),
    exited
  ])
}
// Record both descriptor and config digests; the importer selects the verified
// identifier supported by the target's Docker image store.
const manifests = JSON.parse(
  execFileSync('tar', ['-xOf', file, 'manifest.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
)
const configDigests = images.map((image) => {
  const manifest = manifests.find((item) => item.RepoTags?.includes(image))
  const digest = manifest?.Config?.match(/(?:^|\/)([a-f0-9]{64})(?:\.json)?$/)?.[1]
  if (!digest) throw new Error(`Missing verified image config for ${image}`)
  return `sha256:${digest}`
})
Object.assign(settings, {
  PATCHLAB_APP_IMAGE: platforms[0].Id,
  PATCHLAB_FIXTURE_IMAGE: platforms[1].Id,
  PATCHLAB_POSTGRES_IMAGE: platforms[2].Id
})
await fs.writeFile(
  envFile,
  Object.entries(settings)
    .map(([key, value]) => `${key}=${value}\n`)
    .join(''),
  { mode: 0o600 }
)
await fs.writeFile(path.join(out, 'admin-password.txt'), `${settings.PATCHLAB_ADMIN_PASSWORD}\n`, {
  mode: 0o600
})
const hash = createHash('sha256')
for await (const chunk of createReadStream(file)) hash.update(chunk)
const digest = hash.digest('hex')
await fs.writeFile(`${file}.sha256`, `${digest}  images.tar.gz\n`)
await fs.writeFile(
  path.join(out, 'images.json'),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      images: inspect.map((image, index) => ({
        tag: images[index],
        id: image.Id,
        platformDigest: platforms[index].Id,
        configDigest: configDigests[index],
        os: image.Os,
        architecture: image.Architecture
      })),
      archive: { name: 'images.tar.gz', bytes: (await fs.stat(file)).size, sha256: digest }
    },
    null,
    2
  ) + '\n'
)
console.log(`Verified deployment archive: ${file}`)
console.log('Credentials generated in protected deployment.env; values are not printed.')
