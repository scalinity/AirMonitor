import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

// PiHost's secrets.sh stores both values in the login keychain under account "pihost".
const KEYCHAIN_ACCOUNT = 'pihost'
const MQTT_USER = 'pihost-remote'

async function readKeychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await run('/usr/bin/security', [
      'find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', service, '-w'
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function getMqttCredentials(): Promise<{ username: string; password: string } | null> {
  const password = await readKeychain('pihost mqtt password')
  return password ? { username: MQTT_USER, password } : null
}

export function getAirdbToken(): Promise<string | null> {
  return readKeychain('pihost airdb token')
}
