import {effectivePeriodIds,periodBounds,isFlexiblePeriod} from './work-schedule.js';

export function applyPunchCorrection(workspace, person, request, now=Date.now()) {
  const day=request.date;
  const ranges=effectivePeriodIds(workspace,person,day).map(id=>workspace.workPeriods.find(p=>p.id===id))
    .filter(Boolean).map(period=>({...periodBounds(period,day),period}));
  const starts=new Set(ranges.map(r=>r.start));
  const logs=workspace.punches.filter(p=>p.staffId===person.id &&
    (p.shiftStart==null?p.date===day:starts.has(p.shiftStart)||(!ranges.length&&new Date(p.shiftStart+10800000).toISOString().slice(0,10)===day))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  const changes=[];
  for(const [kind,value] of [['in',request.proposedIn],['out',request.proposedOut]]) {
    if(!value)continue;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Choose at least one valid proposed time.');
    const existing=kind==='in'?logs.find(p=>p.kind===kind):logs.findLast(p=>p.kind===kind);
    let timestamp=Date.parse(day+'T'+value+':00+03:00');
    const range=ranges.find(r=>r.start===existing?.shiftStart) ?? [...ranges].sort((a,b)=>
      Math.abs((kind==='in'?a.start:a.end)-timestamp)-Math.abs((kind==='in'?b.start:b.end)-timestamp))[0];
    if(kind==='out' && range && range.end>Date.parse(day+'T00:00:00+03:00')+86400000 && timestamp<range.start)
      timestamp+=86400000;
    if(!Number.isFinite(timestamp)||timestamp>now)throw Error('Correction time cannot be in the future.');
    const entry={...(existing??{}),staffId:person.id,kind,time:new Date(timestamp).toISOString(),
      date:new Date(timestamp+10800000).toISOString().slice(0,10),correctionRequestId:request.id};
    if(range)Object.assign(entry,{shiftStart:range.start,shiftEnd:range.end,flexible:isFlexiblePeriod(range.period)});
    entry.correctionHistory=[...(existing?.correctionHistory??[]),{requestId:request.id,at:new Date(now).toISOString(),
      previous:existing?{time:existing.time,date:existing.date,shiftStart:existing.shiftStart??null,shiftEnd:existing.shiftEnd??null,flexible:Boolean(existing.flexible)}:null}];
    changes.push({existing,entry});
  }
  if(!changes.length)return; // Older requests may have a note without proposed times.
  const proposed=logs.map(p=>changes.find(c=>c.existing===p)?.entry??p).concat(changes.filter(c=>!c.existing).map(c=>c.entry));
  const arrival=proposed.find(p=>p.kind==='in'),departure=proposed.findLast(p=>p.kind==='out');
  if(arrival&&departure && (arrival.shiftStart==null||departure.shiftStart==null||arrival.shiftStart===departure.shiftStart) && Date.parse(departure.time)<=Date.parse(arrival.time))
    throw Error('Clock-out must be after clock-in.');
  for(const {existing,entry} of changes) {
    if(existing)workspace.punches[workspace.punches.indexOf(existing)]=entry;
    else workspace.punches.push(entry);
  }
  workspace.punches.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
