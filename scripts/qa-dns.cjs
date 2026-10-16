const dns = require('node:dns')
const net = require('node:net')

const address = process.env.PATCHLAB_QA_RESOLVED_IP
if (address) {
  if (!net.isIPv4(address) || process.env.PATCHLAB_QA_REMOTE !== '1') {
    throw new Error(
      'The QA-only DNS override requires an IPv4 address and remote verification mode'
    )
  }
  const host = new URL(process.env.PATCHLAB_QA_WEB).hostname
  const original = dns.lookup
  const originalPromise = dns.promises.lookup
  // Restrict the workaround to the tested hostname. TLS still authenticates
  // the original hostname; no OS DNS setting or certificate check is changed.
  dns.lookup = function (hostname, options, callback) {
    if (hostname !== host) return original.apply(this, arguments)
    const done = typeof options === 'function' ? options : callback
    if (options && typeof options === 'object' && options.all) {
      process.nextTick(done, null, [{ address, family: 4 }])
    } else {
      process.nextTick(done, null, address, 4)
    }
  }
  dns.promises.lookup = async function (hostname, options = {}) {
    if (hostname !== host) return originalPromise.apply(this, arguments)
    if (options.family === 6) {
      throw Object.assign(new Error('The verified QA mapping has no IPv6 address'), {
        code: 'ENOTFOUND'
      })
    }
    return options.all ? [{ address, family: 4 }] : { address, family: 4 }
  }
}
