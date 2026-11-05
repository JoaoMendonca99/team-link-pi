const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const exports = {}
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  vm.runInNewContext(outputText, { exports, require: () => ({}) }, { filename: file })
  return exports
}
const { dashboardGoals, goalsByDeadline } = load('src/lib/activities.ts')
const { lockDialogScroll } = load('src/lib/dialog-scroll-lock.ts')
const goal = (id, due_at, actual = 0, extra = {}) => ({ id, title: id, due_at, kind: 'numeric', target: 10, actual, period_id: 'current', ...extra })
const ids = list => Array.from(list, g => g.id)

test('dashboard: pending first, chronological deadlines, missing deadlines last within each group', () => {
  const goals = [goal('done-no-date', null, 10), goal('pending-no-date', null, 5), goal('done-old', '2026-01-01', 10), goal('pending-future', '2027-01-01'), goal('pending-late', '2026-02-01')]
  const original = ids(goals)
  assert.deepEqual(ids(dashboardGoals(goals, [], [])), ['pending-late', 'pending-future', 'pending-no-date', 'done-old', 'done-no-date'])
  assert.deepEqual(ids(goals), original, 'sorting cannot mutate the workspace snapshot')
})
test('all goals: dates alone determine order, with deterministic name/ID ties', () => {
  const goals = [goal('z', null), goal('b', '2026-11-01', 0, { title: 'Igual' }), goal('a', '2026-11-01', 10, { title: 'Igual' }), goal('c', '2026-12-01')]
  assert.deepEqual(ids([...goals].sort(goalsByDeadline)), ['a', 'b', 'c', 'z'])
})
test('task-based completion and deadline edits reorder without changing progress or crossing periods', () => {
  const stages = [{ id: 'todo', kind: 'todo' }, { id: 'done', kind: 'done' }]
  const goals = [goal('tasks', '2026-01-01', 0, { kind: 'tasks' }), goal('numeric', '2026-12-01')]
  const tasks = [{ goal_id: 'tasks', period_id: 'current', stage_id: 'done' }, { goal_id: 'tasks', period_id: 'history', stage_id: 'todo' }]
  assert.deepEqual(ids(dashboardGoals(goals, tasks, stages)), ['numeric', 'tasks'])
  tasks[0].stage_id = 'todo'
  assert.deepEqual(ids(dashboardGoals(goals, tasks, stages)), ['tasks', 'numeric'])
  goals[0].due_at = '2027-01-01'
  assert.deepEqual(ids(dashboardGoals(goals, tasks, stages)), ['numeric', 'tasks'])
})

function viewport() {
  const values = new Map(), priorities = new Map()
  const style = {
    getPropertyValue: name => values.get(name) || '',
    getPropertyPriority: name => priorities.get(name) || '',
    setProperty(name, value, priority = '') {
      for (const property of name === 'overflow' ? ['overflow-x', 'overflow-y'] : [name]) { values.set(property, value); priorities.set(property, priority) }
    },
    removeProperty(name) { for (const property of name === 'overflow' ? ['overflow-x', 'overflow-y'] : [name]) { values.delete(property); priorities.delete(property) } },
  }
  return { style, clientWidth: 980, ownerDocument: { defaultView: { innerWidth: 1000 } } }
}
for (const order of [[0, 1], [1, 0]]) test(`overlapping dialogs restore only after the last closes (${order})`, () => {
  const root = viewport()
  root.style.setProperty('overflow-x', 'clip')
  root.style.setProperty('overflow-y', 'scroll', 'important')
  root.style.setProperty('scrollbar-gutter', 'stable both-edges')
  const release = [lockDialogScroll(root), lockDialogScroll(root)]
  release[order[0]]()
  assert.equal(root.style.getPropertyValue('overflow-y'), 'hidden')
  release[order[1]]()
  assert.equal(root.style.getPropertyValue('overflow-x'), 'clip')
  assert.equal(root.style.getPropertyValue('overflow-y'), 'scroll')
  assert.equal(root.style.getPropertyPriority('overflow-y'), 'important')
  assert.equal(root.style.getPropertyValue('scrollbar-gutter'), 'stable both-edges')
})
test('repeated cleanup and modal replacement leave no residual inline styles', () => {
  const root = viewport()
  for (let i = 0; i < 10; i++) {
    const first = lockDialogScroll(root), next = lockDialogScroll(root)
    first(); first()
    assert.equal(root.style.getPropertyValue('overflow-y'), 'hidden')
    next(); next()
    assert.equal(root.style.getPropertyValue('overflow-x'), '')
    assert.equal(root.style.getPropertyValue('overflow-y'), '')
    assert.equal(root.style.getPropertyValue('scrollbar-gutter'), '')
  }
})
