// Docker build helper: point the freshly provisioned `sdk` profile at the built harness workspace
// packages (relative links, so the image can live at any path) and clear any stale install.
const fs = require('node:fs')

const link = (dir) => 'link:../../../' + dir
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.dependencies = {
  '@deepseek-ai/dsh-base': link('packages/bundle/base'),
  '@deepseek-ai/dsh-sdk-app': link('packages/bundle/sdk-app'),
  '@deepseek-ai/dsh-subagent-spawn-in-process': link('packages/subagent/spawn-in-process'),
  '@deepseek-ai/dsh-tool-subagent': link('packages/subagent/tool-subagent'),
  '@deepseek-ai/dsh-tools': link('packages/core/tools'),
  '@deepseek-ai/dsh-agent-preset': link('packages/preset/agent-preset'),
  '@deepseek-ai/dsh-agent-preset-registry': link('packages/preset/agent-preset-registry'),
  '@deepseek-ai/dsh-persona': link('packages/preset/persona'),
}
pkg.dsh = {
  profile: {
    bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'],
    patchReload: 'startup',
  },
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2))
fs.rmSync('node_modules', { recursive: true, force: true })
fs.rmSync('pnpm-lock.yaml', { force: true })
