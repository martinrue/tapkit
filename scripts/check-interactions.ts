import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electron from 'electron';

await build({ entryPoints: ['test/native-interactions.ts'], outfile: '.artifacts/native-interactions.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define: { __dirname: JSON.stringify(resolve('dist')) } });
for (const args of [[], ['--restore']]) {
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(electron as unknown as string, ['.artifacts/native-interactions.cjs', ...args], { stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
  if (code) { process.exitCode = code; break; }
}
