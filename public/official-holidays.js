export const officialHolidays = {
  adha: 'Eid al-Adha', fitr: 'Eid al-Fitr', foundation: 'Founding Day', national: 'National Day',
};
export const holidayDefaultDays={adha:4,fitr:4,foundation:1,national:1};
const calendarCache=new Map(),dayMs=86400000;
const iso=time=>new Date(time).toISOString().slice(0,10);
const hijri=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
export function automaticHolidayCalendar(year) {
  if(calendarCache.has(year))return calendarCache.get(year);
  const dates={adha:[],fitr:[],foundation:[year+'-02-22'],national:[year+'-09-23']};
  for(let time=Date.UTC(year,0,1)-dayMs;time<Date.UTC(year+1,0,1);time+=dayMs){
    const parts=Object.fromEntries(hijri.formatToParts(time).map(p=>[p.type,p.value]));
    if(Number(parts.month)===9&&Number(parts.day)===29&&iso(time+dayMs).startsWith(String(year)))dates.fitr.push(iso(time+dayMs));
    if(Number(parts.month)===12&&Number(parts.day)===9&&iso(time).startsWith(String(year)))dates.adha.push(iso(time));
  }
  const result={year,dates,source:'Umm al-Qura calendar',updatedAt:null};calendarCache.set(year,result);return result;
}
export function holidayCalendarSnapshot(year){return Object.fromEntries([year-1,year,year+1].map(y=>[y,automaticHolidayCalendar(y)]));}
export function holidayOccurrences(workspace,id,year,branchId){
  const settings=holidaySettings(workspace,branchId)[id],calendar=workspace.officialHolidayCalendar?.[year]??automaticHolidayCalendar(year);
  const manual=settings.startOverrides?.[year];
  return (manual?[manual]:(calendar.dates[id]??[])).map(start=>({id,name:officialHolidays[id],start,end:iso(Date.parse(start)+((settings.days??holidayDefaultDays[id])-1)*dayMs),days:settings.days??holidayDefaultDays[id],manual:Boolean(manual)}));
}
export function officialHolidaysOn(workspace,person,date){
  const settings=holidaySettings(workspace,person?.branchId),year=Number(date.slice(0,4));
  return Object.keys(officialHolidays).flatMap(id=>settings[id].enabled?[...holidayOccurrences(workspace,id,year-1,person?.branchId),...holidayOccurrences(workspace,id,year,person?.branchId)].filter(h=>h.start<=date&&date<=h.end):[]);
}
export async function refreshHolidayCalendar(year,fetcher=fetch){
  const base=automaticHolidayCalendar(year),years=new Set();
  for(const time of [Date.UTC(year,0,1),Date.UTC(year,11,31)])years.add(Number(hijri.formatToParts(time).find(p=>p.type==='year').value));
  const dates={...base.dates,adha:[],fitr:[]};
  for(const hy of years)for(const [id,day,month,offset] of [['fitr',29,9,1],['adha',9,12,0]]){
    const response=await fetcher('https://api.aladhan.com/v1/hToG/'+day+'-'+month+'-'+hy+'?calendarMethod=UAQ',{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Holiday calendar unavailable');
    const data=(await response.json()).data,g=data?.gregorian;
    if(data?.hijri?.method!=='UAQ'||Number(data.hijri.day)!==day||Number(data.hijri.month.number)!==month||Number(data.hijri.year)!==hy)throw Error('Invalid holiday calendar');
    const value=String(g?.year)+'-'+String(g?.month?.number).padStart(2,'0')+'-'+String(g?.day).padStart(2,'0'),time=Date.parse(value+'T00:00:00Z');
    if(!Number.isFinite(time)||iso(time)!==value)throw Error('Invalid holiday date');
    const start=iso(time+offset*dayMs);if(start.startsWith(String(year)))dates[id].push(start);
  }
  if(!dates.adha.length||!dates.fitr.length)throw Error('Incomplete holiday calendar');
  const result={year,dates,source:'AlAdhan · Umm al-Qura',updatedAt:new Date().toISOString()};calendarCache.set(year,result);return result;
}
export function holidaySettings(workspace, branchId) {
  return Object.fromEntries(Object.keys(officialHolidays).map(id => [id, {
    enabled: false, days: null, ...workspace.officialHolidaySettings?.[id],
    ...(branchId ? workspace.branchOfficialHolidaySettings?.[branchId]?.[id] : {}),
    startOverrides:{...workspace.officialHolidaySettings?.[id]?.startOverrides,...(branchId?workspace.branchOfficialHolidaySettings?.[branchId]?.[id]?.startOverrides:{})},
  }]));
}
