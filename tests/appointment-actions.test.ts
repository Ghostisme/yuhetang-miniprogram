import assert from 'node:assert/strict'
import test from 'node:test'
import type {Appointment} from '../src/types'
import {appointmentActions,deadlineLabel,stampAppointments} from '../src/utils/appointment-actions'

const server='2026-11-09T10:00:00+08:00',deadline='2026-11-09T11:00:00+08:00',received=100000
function booking(patch:Partial<Appointment>={}){return {...{id:'fixture',status:'CONFIRMED',customerActions:{canCancel:true,canReschedule:true,canWithdrawReschedule:false,deadline,serverTime:server,reason:''},clientReceivedAt:received},...patch} as Appointment}
test('server time controls the cutoff despite a phone clock in a different year',()=>{
  const b=booking();assert.equal(appointmentActions(b,received).canCancel,true)
  assert.equal(appointmentActions(b,received+3599999).canReschedule,true)
  assert.equal(appointmentActions(b,received+3600000).canCancel,false)
  assert.equal(appointmentActions(b,received+3600001).canReschedule,false)
  assert.equal(appointmentActions(b,received-10000).canCancel,true)
})
test('old or missing policies never expose self-service actions, including zero hour cutoffs',()=>{
  for(const b of [booking({customerActions:undefined}),booking({clientReceivedAt:undefined}),booking({customerActions:{canCancel:true,canReschedule:true,canWithdrawReschedule:false,deadline:server,serverTime:server,reason:''}})]){
    const a=appointmentActions(b,received);assert.equal(a.canCancel,false);assert.equal(a.canReschedule,false)
  }
  for(const status of ['CANCELLED','ARRIVED','COMPLETED','REJECTED','NO_SHOW'])assert.equal(appointmentActions(booking({status}),received).canCancel,false)
})
test('pending reschedule retains the original booking and permits only withdrawal until expiry',()=>{
  const b=booking({customerActions:{canCancel:true,canReschedule:false,canWithdrawReschedule:true,deadline,serverTime:server,reason:''},rescheduleRequest:{status:'PENDING',expiresAt:'2026-11-09T12:00:00+08:00'} as Appointment['rescheduleRequest']})
  const a=appointmentActions(b,received);assert.equal(a.pending,true);assert.equal(a.canReschedule,false);assert.equal(a.canWithdrawReschedule,true)
  assert.equal(appointmentActions(b,received+3600000).canCancel,false)
  assert.equal(appointmentActions(b,received+3600000).canWithdrawReschedule,true)
  const expired=appointmentActions(b,received+7200000);assert.equal(expired.pending,false);assert.equal(expired.canWithdrawReschedule,false)
})
test('an API receipt gets one timestamp without mutating the original response',()=>{
  const original=booking({clientReceivedAt:undefined}),[stamped]=stampAppointments([original],received)
  assert.equal(original.clientReceivedAt,undefined);assert.equal(stamped.clientReceivedAt,received);assert.equal(appointmentActions(stamped,received).canCancel,true)
})

test('deadlines always display Shanghai time for UTC or offset API responses',()=>{
  assert.equal(deadlineLabel('2026-11-09T05:00:00Z'),'2026-11-09 13:00')
  assert.equal(deadlineLabel('2026-11-09T13:00:00+08:00'),'2026-11-09 13:00')
  assert.equal(deadlineLabel('invalid'),'')
})
