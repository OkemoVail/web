import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const nodeFs = { copyFile, mkdir, rename, rm, writeFile };

export async function acceptMediaTransaction(options) {
  const {
    mediaNames,
    stagedDir,
    deployedDir,
    configPath,
    nextConfig,
    validate,
    fs = nodeFs,
  } = options;
  const transactionDir = join(dirname(stagedDir), 'media-transaction');
  const movedOld = [];
  const movedNew = [];

  await fs.rm(transactionDir, { recursive: true, force: true });
  await fs.mkdir(transactionDir, { recursive: true });
  for (const name of mediaNames) await fs.copyFile(join(stagedDir, name), join(transactionDir, `${name}.new`));
  await validate(transactionDir);

  try {
    for (const name of mediaNames) {
      const deployed = join(deployedDir, name);
      const backup = join(transactionDir, `${name}.old`);
      await fs.rename(deployed, backup);
      movedOld.push([deployed, backup]);
    }
    for (const name of mediaNames) {
      const next = join(transactionDir, `${name}.new`);
      const deployed = join(deployedDir, name);
      await fs.rename(next, deployed);
      movedNew.push(deployed);
    }
    await validate(deployedDir);
    const configTemp = `${configPath}.tmp`;
    await fs.writeFile(configTemp, `${JSON.stringify(nextConfig, null, 2)}\n`);
    await fs.rename(configTemp, configPath);
  } catch (error) {
    for (const deployed of movedNew.reverse()) await fs.rm(deployed, { force: true });
    for (const [deployed, backup] of movedOld.reverse()) await fs.rename(backup, deployed);
    // The live config is untouched until the final atomic rename. If that rename
    // fails, the old config remains in place; do not risk replacing it in rollback.
    throw error;
  } finally {
    // After a successful rename this path is absent; after failure it is only the new config.
    await fs.rm(`${configPath}.tmp`, { force: true });
    await fs.rm(transactionDir, { recursive: true, force: true });
  }
}
