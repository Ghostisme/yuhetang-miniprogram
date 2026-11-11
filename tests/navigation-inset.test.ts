import assert from 'node:assert/strict'
import { test } from 'node:test'
import { navigationInset } from '../src/utils/navigation-inset'
test('custom navigation uses actual capsule bounds once, in physical pixels', () => {
  assert.equal(navigationInset(54, { top: 58, bottom: 90, height: 32 }), 98)
  assert.equal(navigationInset(20, { top: 24, bottom: 56, height: 32 }), 64)
})
test('invalid simulator capsule bounds fall back to status plus one toolbar', () => {
  assert.equal(navigationInset(44, { top: 0, bottom: 0, height: 0 }), 88)
  assert.equal(navigationInset(Number.NaN), 64)
})
