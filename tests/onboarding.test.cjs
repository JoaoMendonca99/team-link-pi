const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module'), ts = require('typescript')
Module._extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const original = Module._load
Module._load = function (name, ...args) { return name === '@/lib/supabase/client' ? {} : original.call(this, name, ...args) }
const { essentialProgress, introductionMission, showOnboarding } = require('../src/lib/onboarding.ts')
Module._load = original
const account = patch => ({ goal: 'create', hidden: false, completed_at: null, first_completion: false, missions: { biography: false, photo: false, skills: false, interests: false, create: false, participate: false, connection: false, ...patch } })

test('photo and biography are a single complete requirement with a useful partial-state link', () => {
  for (const flags of [{}, { biography: true }, { photo: true }]) assert.equal(essentialProgress(account(flags)), 0)
  assert.equal(essentialProgress(account({ biography: true, photo: true })), 1)
  assert.equal(introductionMission(account({ biography: true })).anchor, 'profile-photo')
  assert.match(introductionMission(account({ biography: true })).hint, /falta adicionar uma foto/)
  assert.equal(introductionMission(account({ photo: true })).anchor, 'profile-bio')
  assert.match(introductionMission(account({ photo: true })).hint, /falta escrever a biografia/)
})
test('five equal-weight missions reach 0/20/40/60/80/100 percent without optional missions', () => {
  const states = [{}, { biography: true, photo: true }, { biography: true, photo: true, skills: true }, { biography: true, photo: true, skills: true, interests: true }, { biography: true, photo: true, skills: true, interests: true, create: true }, { biography: true, photo: true, skills: true, interests: true, create: true, connection: true }]
  states.forEach((m, count) => { const state = account(m); assert.equal(essentialProgress(state), count); assert.equal(showOnboarding(state), count < 5) })
})
test('the selected project goal is independent and does not change the other missions', () => {
  const state = account({ biography: true, photo: true, skills: true, interests: true, participate: true, connection: true })
  assert.equal(essentialProgress(state), 4)
  assert.equal(essentialProgress({ ...state, goal: 'participate' }), 5)
  assert.equal(state.goal, 'create')
})
test('hidden/completed users leave no guide; explicitly reactivated legacy accounts use current conditions', () => {
  const legacy = { ...account({ create: true, skills: true, interests: true }), hidden: true, completed_at: '2026-11-09T00:00:00Z', first_completion: true }
  assert.equal(showOnboarding(legacy), false)
  assert.equal(showOnboarding({ ...legacy, hidden: false }), true)
  assert.equal(showOnboarding({ ...legacy, hidden: false, missions: { ...legacy.missions, biography: true, photo: true, connection: true } }), false)
})
