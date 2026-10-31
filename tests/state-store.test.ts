import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend, mutateState, readState } from '../src/lib/state-store';
import { reserveAnalysis } from '../src/lib/server';

test('concurrent CAS updates retain every successful write and cleanup does not reset allowance', async () => {
  const backend=memoryBackend();
  await mutateState(s=>{s.submitted=4;s.sessions.expired={expires:1,count:1,busy:false};},backend);
  await Promise.all(Array.from({length:30},()=>mutateState(s=>{s.submitted++;},backend)));
  const {state}=await backend.read();
  assert.equal(state.submitted,34);assert.equal(state.sessions.expired,undefined);
  const {version}=await backend.read();
  await mutateState(s=>{s.submitted++;},backend);
  assert.equal(await backend.write(state,version),false);
});

test('simultaneous submissions cannot exceed the global cap or duplicate a session', async () => {
  const previous=process.env.MAX_LIVE_ANALYSES;process.env.MAX_LIVE_ANALYSES='3';
  try {
    await mutateState(s=>{s.submitted=0;s.sessions={};for(let i=0;i<10;i++)s.sessions['s'+i]={expires:Date.now()+60_000,count:0,busy:false};});
    const results=await Promise.allSettled(Array.from({length:10},(_,i)=>reserveAnalysis('s'+i)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
    assert.equal((await readState()).submitted,3);
    await mutateState(s=>{s.submitted=0;s.sessions={one:{expires:Date.now()+60_000,count:0,busy:false}};});
    const duplicate=await Promise.allSettled([reserveAnalysis('one'),reserveAnalysis('one')]);
    assert.equal(duplicate.filter(r=>r.status==='fulfilled').length,1);
    const state=await readState();assert.equal(state.submitted,1);assert.equal(state.sessions.one.count,1);
  } finally {if(previous===undefined)delete process.env.MAX_LIVE_ANALYSES;else process.env.MAX_LIVE_ANALYSES=previous;}
});
