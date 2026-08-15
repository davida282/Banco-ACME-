import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePostgresTool(toolName) {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const configuredPath = process.env[`${toolName.toUpperCase()}_PATH`];
  if (configuredPath && await fileExists(configuredPath)) return configuredPath;

  if (process.platform === 'win32') {
    const postgresRoots = [
      'C:\\Program Files\\PostgreSQL',
      'C:\\Program Files (x86)\\PostgreSQL',
      'D:\\Programs\\PostgreSQL',
      'D:\\Program Files\\PostgreSQL',
    ];
    for (const root of postgresRoots) {
      try {
        const versions = await readdir(root, { withFileTypes: true });
        const versionDirectories = versions
          .filter((entry) => entry.isDirectory())
          .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
        for (const version of versionDirectories) {
          const candidate = path.join(root, version.name, 'bin', `${toolName}${extension}`);
          if (await fileExists(candidate)) return candidate;
        }
      } catch {
        // PostgreSQL puede estar instalado en otra ubicación o no incluir las herramientas de consola.
      }
    }
  }

  return `${toolName}${extension}`;
}

export function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`No se encontró ${path.basename(command)}. Instala las herramientas de línea de comandos de PostgreSQL o configura ${path.basename(command, path.extname(command)).toUpperCase()}_PATH en tu .env.`));
      } else reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} terminó con código ${code}.`));
    });
  });
}

export function connectionArguments() {
  return [
    '--host', process.env.PGHOST ?? 'localhost',
    '--port', String(process.env.PGPORT ?? 5432),
    '--username', process.env.PGUSER ?? 'postgres',
    '--dbname', process.env.PGDATABASE ?? 'Acme Bank',
  ];
}
