import {effectivePeriodIds,periodBounds,isFlexiblePeriod} from './work-schedule.js';

export function correctionPeriods(workspace, person, day) {
  return effectivePeriodIds(workspace,person,day).map(id=>workspace.workPeriods.find(p=>p.id===id))
    .filter(Boolean).map(period=>({...periodBounds(period,day),period}))
    .sort((a,b)=>a.start-b.start);
}

export function periodPunches(workspace, person, range) {
  return workspace.punches.filter(p=>{
    if(p.staffId!==person.id)return false;
    if(p.shiftStart!=null)return p.shiftStart===range.start;
    const time=Date.parse(p.time);
    return p.kind==='in' ? time>=range.start && time<range.end : time>range.start && time<=range.end;
  }).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}

export function applyPunchCorrection(workspace, person, request, now=Date.now()) {
  const day=request.date;
  const ranges=correctionPeriods(workspace,person,day);
  const starts=new Set(ranges.map(r=>r.start));
  const logs=workspace.punches.filter(p=>p.staffId===person.id &&
    (p.shiftStart==null?p.date===day:starts.has(p.shiftStart)||(!ranges.length&&new Date(p.shiftStart+10800000).toISOString().slice(0,10)===day))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  const changes=[];
  const scoped=request.periodCorrections;
  const groups=scoped ? scoped.map(edit=>{
    const range=ranges.find(r=>r.period.id===edit.periodId && r.start===edit.shiftStart && r.end===edit.shiftEnd);
    if(!range)throw Error('The work schedule changed. Submit a new correction request.');
    return {edit,range,logs:periodPunches(workspace,person,range)};
  }) : [{edit:request,logs}];
  for(const {edit,range:target,logs} of groups) {
    const groupChanges=[];
    for(const [kind,value] of [['in',edit.proposedIn],['out',edit.proposedOut]]) {
      if(!value)continue;
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Choose at least one valid proposed time.');
      const existing=kind==='in'?logs.find(p=>p.kind===kind):logs.findLast(p=>p.kind===kind);
      const originalKey=kind==='in'?'originalIn':'originalOut';
      if(Object.hasOwn(edit,originalKey) && edit[originalKey] !== (existing?.time ?? null))
        throw Error('The recorded punches changed. Submit a new correction request.');
      let timestamp=Date.parse(day+'T'+value+':00+03:00');
      const range=target ?? ranges.find(r=>r.start===existing?.shiftStart) ?? [...ranges].sort((a,b)=>
        Math.abs((kind==='in'?a.start:a.end)-timestamp)-Math.abs((kind==='in'?b.start:b.end)-timestamp))[0];
      if(kind==='out' && range && range.end>Date.parse(day+'T00:00:00+03:00')+86400000 && timestamp<range.start)
        timestamp+=86400000;
      if(!Number.isFinite(timestamp)||timestamp>now)throw Error('Correction time cannot be in the future.');
      const entry={...(existing??{}),staffId:person.id,kind,time:new Date(timestamp).toISOString(),
        date:new Date(timestamp+10800000).toISOString().slice(0,10),correctionRequestId:request.id};
      if(range)Object.assign(entry,{shiftStart:range.start,shiftEnd:range.end,flexible:isFlexiblePeriod(range.period)});
      entry.correctionHistory=[...(existing?.correctionHistory??[]),{requestId:request.id,at:new Date(now).toISOString(),
        previous:existing?{time:existing.time,date:existing.date,shiftStart:existing.shiftStart??null,shiftEnd:existing.shiftEnd??null,flexible:Boolean(existing.flexible)}:null}];
      groupChanges.push({existing,entry});
    }
    if(!groupChanges.length)continue;
    const proposed=logs.map(p=>groupChanges.find(c=>c.existing===p)?.entry??p).concat(groupChanges.filter(c=>!c.existing).map(c=>c.entry));
    if(target)proposed.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
    const arrival=proposed.find(p=>p.kind==='in'),departure=proposed.findLast(p=>p.kind==='out');
    if(arrival&&departure && (arrival.shiftStart==null||departure.shiftStart==null||arrival.shiftStart===departure.shiftStart) && Date.parse(departure.time)<=Date.parse(arrival.time))
      throw Error('Clock-out must be after clock-in.');
    changes.push(...groupChanges);
  }
  if(!changes.length)return; // Older requests may have a note without proposed times.
  for(const {existing,entry} of changes) {
    if(existing)workspace.punches[workspace.punches.indexOf(existing)]=entry;
    else workspace.punches.push(entry);
  }
  workspace.punches.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
