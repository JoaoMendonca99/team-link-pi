const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const output = ts.transpileModule(fs.readFileSync('src/lib/profile-projects.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleState = { exports: {} }
vm.runInNewContext(output, { exports: moduleState.exports, require: () => ({}) })
const { assembleProfileProjects } = moduleState.exports
const project = id => ({ id, title: id })
const member = (project_id, status = 'active', display_role = null) => ({ project_id, status, display_role, joined_at: '2026-05-13', role: 'owner' })

test('created and participating categories are distinct; total is a union of visible IDs', () => {
  const data = assembleProfileProjects([project('a'), project('a')], [project('a'), project('b')], [member('a'), member('b'), member('b')])
  assert.equal(data.created.length, 1)
  assert.equal(data.participating.length, 2)
  assert.equal(data.total, 2)
})

test('ended, pending and inaccessible project memberships do not reveal counts or roles', () => {
  const data = assembleProfileProjects([], [project('a'), project('b')], [member('a', 'left'), member('b', 'pending'), member('private', 'active', 'Cargo privado')])
  assert.equal(data.participating.length, 0)
  assert.equal(data.total, 0)
})

test('the displayed job title never falls back to a permission level', () => {
  const data = assembleProfileProjects([], [project('a'), project('b')], [member('a', 'active', ' Documentação '), member('b')])
  assert.equal(data.participating[0].displayRole, 'Documentação')
  assert.equal(data.participating[1].displayRole, null)
})
