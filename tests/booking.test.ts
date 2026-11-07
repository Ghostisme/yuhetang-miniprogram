import assert from 'node:assert/strict'
import test from 'node:test'
import {day, mergeMessages, RequestScope, subscriptionIds} from '../src/utils/booking'

test('booking date follows China time across midnight and month boundaries', () => {
  assert.equal(day(0, Date.parse('2026-11-30T16:01:00Z')), '2026-12-01')
  assert.equal(day(7, Date.parse('2026-12-28T15:59:00Z')), '2027-01-04')
})

test('switching stores or leaving the page invalidates old asynchronous responses', () => {
  const scope = new RequestScope()
  const firstStore = scope.next()
  const secondStore = scope.next()
  assert.equal(scope.valid(firstStore), false)
  assert.equal(scope.valid(secondStore), true)
  assert.equal(scope.snapshot(), secondStore)
  scope.cancel()
  assert.equal(scope.valid(secondStore), false)
})

test('subscription request uses at most three distinct nonempty template IDs', () => {
  assert.deepEqual(subscriptionIds([' first ', '', 'first', 'second', 'third', 'fourth']), ['first', 'second', 'third'])
  assert.deepEqual(subscriptionIds(undefined), [])
  assert.deepEqual(subscriptionIds(' template '), ['template'])
})

test('polling overlap and out of order chat responses do not duplicate messages', () => {
  const old = [{id: 'b', seq: 2, delivery: 'PENDING'}, {id: 'a', seq: 1, delivery: 'SENT'}]
  const incoming = [{id: 'c', seq: 3, delivery: 'SENT'}, {id: 'b', seq: 2, delivery: 'SENT'}]
  assert.deepEqual(mergeMessages(old, incoming), [old[1], incoming[1], incoming[0]])
  assert.equal(old[0].delivery, 'PENDING')
})
