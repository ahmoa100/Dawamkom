import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {employeeRequest, employeeWorkspaces} from './api';
import {punchTiming} from './punch-timing';

const colors = {background:'#111e24', panel:'#192d34', line:'#34505a', white:'#e7f2f4', muted:'#acc4cb', mint:'#80ccae', teal:'#216677'};
const isPreview = process.env.EXPO_PUBLIC_DAWAMKOM_ORIGIN === 'https://www.eazyabcworld2.com';
const previewManagerEmail = 'manager@cedar.example';
const icon = require('./assets/icon.png');
const fingerprint = require('./assets/fingerprint.png');
const formatTime = value => value ? new Intl.DateTimeFormat('ar-SA', {
  timeZone:'Asia/Riyadh', hour:'2-digit', minute:'2-digit',
}).format(new Date(value)) : '—';
const duration = minutes => Number.isFinite(minutes) ? Math.floor(minutes / 60) + ' س ' + minutes % 60 + ' د' : '—';

function Action({children, onPress, disabled}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({pressed}) => [styles.action, (pressed || disabled) && styles.dimmed]}>{children}</Pressable>;
}
function Heading({children}) { return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>; }
function Copy({children}) { return <Text style={styles.copy}>{children}</Text>; }
function Metric({label, value}) {
  return <View style={styles.metric}><Copy>{label}</Copy><Text style={styles.value}>{value}</Text></View>;
}

export default function App() {
  return <SafeAreaProvider><SafeAreaView style={styles.screen} edges={['top','bottom']}>
    <StatusBar barStyle="light-content" />
    <View style={styles.header}><Image source={icon} style={styles.logo}/><Heading>دوامكم</Heading></View>
    <EmployeeApp/>
  </SafeAreaView></SafeAreaProvider>;
}

function EmployeeApp() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [matches,setMatches] = useState([]);
  const [workspace,setWorkspace] = useState(null);
  const [session,setSession] = useState(null);
  const [tab,setTab] = useState('home');
  const [team,setTeam] = useState(false);
  const [busy,setBusy] = useState(false);
  const [needsRefresh,setNeedsRefresh] = useState(false);
  const [message,setMessage] = useState('');
  const [clock,setClock] = useState(Date.now());
  const busyRef = useRef(false);
  useEffect(() => {
    const timer=setInterval(() => setClock(Date.now()),1000);
    return () => clearInterval(timer);
  },[]);
  const run = async action => {
    if (busyRef.current) return;
    busyRef.current=true;
    setBusy(true);
    setMessage('');
    try { await action(); }
    catch (error) { setMessage(error.message || 'تعذّر إكمال الإجراء.'); }
    finally { busyRef.current=false; setBusy(false); }
  };
  const reload = async () => {
    const result=await employeeRequest(workspace,'session');
    if (!result.ok) throw new Error(result.error || 'تعذّر تحميل الحساب.');
    setNeedsRefresh(false);
    setSession({...result, clockOffset:Number.isFinite(result.serverNow) ? result.serverNow-Date.now() : 0});
  };
  const lookup = (address = email) => run(async () => {
    const normalizedEmail = address.trim().toLowerCase();
    setEmail(normalizedEmail);
    setMatches([]);
    const choices = await employeeWorkspaces(normalizedEmail);
    if (!choices.length) throw new Error(isPreview
      ? 'هذا البريد غير موجود في النسخة التجريبية. استخدم بريد المدير التجريبي أدناه.'
      : 'لم نجد حساب موظف لهذا البريد.');
    setMatches(choices);
    if (choices.length===1) setWorkspace(choices[0]);
  });
  const login = () => run(async () => {
    const result=await employeeRequest(workspace,'login',{email:email.trim().toLowerCase(),password});
    if (!result.approved) throw new Error(result.changeRequired ? 'هذا الجهاز يحتاج اعتمادًا من حسابك الحالي.' : result.error || 'تعذّر تسجيل الدخول.');
    setPassword('');
    await reload();
  });
  const logout = () => run(async () => {
    const result=await employeeRequest(workspace,'logout',{});
    if (!result.ok) throw new Error(result.error || 'تعذّر تسجيل الخروج.');
    setSession(null); setWorkspace(null); setMatches([]); setTab('home'); setTeam(false); setPassword('');
  });

  if (!session) return <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <Heading>{workspace?.name || 'تسجيل الدخول'}</Heading>
    {isPreview && <Copy>نسخة تجريبية لحسابات الاختبار.</Copy>}
    {!workspace && <TextInput style={styles.input} value={email} onChangeText={value=>{setEmail(value);setMatches([]);}} autoCapitalize="none"
      autoCorrect={false} editable={!busy} autoComplete="email" keyboardType="email-address" placeholder="البريد الإلكتروني" placeholderTextColor={colors.muted} accessibilityLabel="البريد الإلكتروني"/>}
    {workspace && <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry
      autoComplete="current-password" placeholder="كلمة المرور" placeholderTextColor={colors.muted} accessibilityLabel="كلمة المرور"/>}
    {!workspace && matches.map(item=><Action key={item.prefix} disabled={busy} onPress={()=>setWorkspace(item)}><Text style={styles.actionText}>{item.name}</Text></Action>)}
    <Action disabled={busy || (workspace ? !password : !email.trim())} onPress={workspace ? login : () => lookup()}>
      <Text style={styles.actionText}>{workspace ? 'دخول' : 'متابعة'}</Text>
    </Action>
    {workspace && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setWorkspace(null);setPassword('');setMessage('');}}><Copy>تغيير البريد</Copy></Pressable>}
    {isPreview && !workspace && <Action disabled={busy} onPress={() => lookup(previewManagerEmail)}>
      <Text style={styles.actionText}>استخدام بريد المدير التجريبي</Text>
    </Action>}
    {busy && <ActivityIndicator color={colors.mint}/>}
    {!!message && <Copy>{message}</Copy>}
  </ScrollView>;

  const now=clock+session.clockOffset;
  const timing=punchTiming(session.punchWindows ?? [],now,session.nextPunch,session.openShiftStart,session.lastFlexiblePunch);
  const punch=()=>run(async () => {
    let coords={};
    if (!session.punchFromAnywhere && session.hasLocations) {
      const permission=await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الموقع ثم حاول مرة أخرى.');
      const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const {latitude,longitude,accuracy}=position.coords;
      coords={latitude,longitude,accuracy};
    }
    let result;
    setNeedsRefresh(true);
    try { result=await employeeRequest(workspace,'punch',{kind:timing.kind,...coords}); }
    catch { throw new Error('تعذّر تأكيد الحفظ. راجع سجل الحضور قبل إعادة المحاولة.'); }
    if (result.status>=500) throw new Error('تعذّر تأكيد الحفظ. راجع سجل الحضور قبل إعادة المحاولة.');
    if (!result.ok) {
      setNeedsRefresh(false);
      throw new Error(result.error || 'لم تُسجّل البصمة.');
    }
    if (!result.saved) throw new Error('تعذّر تأكيد الحفظ. راجع سجل الحضور قبل إعادة المحاولة.');
    setMessage(result.outsideTimeWindow ? 'حُفظت البصمة خارج الوقت المسموح.' : 'تم حفظ البصمة.');
    try { await reload(); }
    catch { setMessage('تم حفظ البصمة. حدّث السجل قبل تسجيل بصمة أخرى.'); }
  });
  const recent=session.recentPunches ?? [];
  const todayPunches=recent.filter(item => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh'}).format(new Date(item.time))===session.today);
  const tabs=[['home','الرئيسية'],['requests','الطلبات'],['attendance','الحضور'],['account',session.canReviewTeam?'المزيد':'حسابي']];
  return <>
    <ScrollView contentContainerStyle={styles.body}>
      {tab==='home' && <>
        <Heading>أهلًا، {session.name}</Heading><Copy>{session.today}</Copy>
        <View style={styles.hero}>
          <Heading>حضوري اليوم</Heading>
          <Text style={styles.clock}>{formatTime(now)}</Text>
          <View style={styles.row}>
            <Metric label="الحضور" value={formatTime(todayPunches.findLast(item=>item.kind==='in')?.time)}/>
            <Metric label="الانصراف" value={formatTime(todayPunches.find(item=>item.kind==='out')?.time)}/>
            <Metric label="ساعات العمل" value={duration(Number.isFinite(session.flexibleCompletedMilliseconds) && session.flexibleDay ? Math.floor(session.flexibleCompletedMilliseconds/60000) : undefined)}/>
          </View>
          <Action onPress={punch} disabled={busy || needsRefresh || !session.hasLocations || !['in','out'].includes(timing.kind)}>
            <View style={styles.punchLabel}><Image source={fingerprint} style={styles.fingerprint}/>
              <Text style={styles.actionText}>{timing.kind==='out'?'تسجيل الانصراف':'تسجيل الحضور'}</Text></View>
          </Action>
        </View>
      </>}
      {tab==='requests' && <><Heading>الطلبات</Heading>
        {!(session.ownRequests?.length) && <Copy>لا توجد طلبات لعرضها.</Copy>}
        {(session.ownRequests ?? []).map(item=><View key={item.id} style={styles.panel}><Heading>{item.type}</Heading><Copy>{item.status} · {item.date}</Copy></View>)}
      </>}
      {tab==='attendance' && <><Heading>الحضور</Heading>
        {session.canReviewTeam && <View style={styles.row}>
          <Action disabled={!team} onPress={()=>setTeam(false)}><Text style={styles.actionText}>أنا</Text></Action>
          <Action disabled={team} onPress={()=>setTeam(true)}><Text style={styles.actionText}>فريقي</Text></Action>
        </View>}
        {team && session.canReviewTeam ? <TeamAttendance summary={session.teamSummary}/> :
          <Calendar workspace={workspace} today={session.today}/>}
      </>}
      {tab==='account' && <><Heading>حسابي</Heading><Copy>{session.name}</Copy><Copy>{session.company}</Copy>
        <Action onPress={logout} disabled={busy}><Text style={styles.actionText}>تسجيل الخروج</Text></Action>
      </>}
      {tab==='home' && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>run(reload)}><Copy>تحديث السجل</Copy></Pressable>}
      {busy && <ActivityIndicator color={colors.mint}/>}
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text>}
    </ScrollView>
    <View style={styles.nav}>{tabs.map(([key,label])=><Pressable key={key} accessibilityRole="tab"
      accessibilityState={{selected:tab===key}} style={[styles.navItem,tab===key&&styles.navSelected]}
      onPress={()=>{setTab(key);setMessage('');}}><Copy>{label}</Copy></Pressable>)}</View>
  </>;
}

const dateLabel = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory', month:'long', year:'numeric', timeZone:'UTC'});
const calendarStatus = {complete:'حضور مكتمل', issue:'سجل يحتاج مراجعة', pending:'غير مكتمل', off:'لا يلزم الحضور'};
const calendarTone = {complete:'#205c4a', issue:'#733d48', pending:'#584c32', off:'#344951'};

function Calendar({workspace,today}) {
  const [month,setMonth] = useState(today.slice(0,7));
  const [selected,setSelected] = useState(today);
  const [days,setDays] = useState([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    let current=true;
    setLoading(true);
    setError('');
    employeeRequest(workspace,'calendar?month='+encodeURIComponent(month)).then(result=>{
      if(!current)return;
      if(!result.ok) throw new Error(result.error || 'تعذّر تحميل التقويم.');
      setDays(result.days ?? []);
    }).catch(()=>{
      if(current){setDays([]);setError('تعذّر تحميل التقويم.');}
    }).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[workspace,month]);
  const first = new Date(month+'-01T00:00:00Z');
  const move = offset=>{
    const target=new Date(first);
    target.setUTCMonth(first.getUTCMonth()+offset);
    const next=target.toISOString().slice(0,7);
    setMonth(next);
    setSelected(next===today.slice(0,7)?today:next+'-01');
  };
  const day=days.find(item=>item.date===selected);
  const cells=[...Array.from({length:first.getUTCDay()},()=>null),...days];
  return <View style={styles.calendar}>
    <View style={styles.calendarHeader}>
      <Action onPress={()=>move(-1)}><Text style={styles.actionText}>›</Text></Action>
      <Heading>{dateLabel.format(first)}</Heading>
      <Action onPress={()=>move(1)}><Text style={styles.actionText}>‹</Text></Action>
    </View>
    {loading ? <ActivityIndicator color={colors.mint}/> : error ? <Copy>{error}</Copy> : <>
      <View style={styles.calendarWeek}>{['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(label=>
        <View key={label} style={styles.calendarCell}><Copy>{label}</Copy></View>)}</View>
      {Array.from({length:Math.ceil(cells.length/7)},(_,week)=><View key={week} style={styles.calendarWeek}>
        {Array.from({length:7},(_,index)=>{
          const item=cells[week*7+index];
          return item ? <Pressable key={item.date} accessibilityRole="button" accessibilityState={{selected:item.date===selected}}
            accessibilityLabel={item.date+' '+(calendarStatus[item.status]||'')} onPress={()=>setSelected(item.date)}
            style={[styles.calendarCell,styles.calendarDay,{backgroundColor:calendarTone[item.status]||colors.panel},
              item.date===selected&&styles.calendarSelected]}><Text style={styles.dayNumber}>{Number(item.date.slice(-2))}</Text></Pressable> :
            <View key={'empty'+index} style={styles.calendarCell}/>;
        })}
      </View>)}
      {day && <View style={styles.panel}>
        <Heading>ملخص {day.date}</Heading>
        <Copy>{(day.officialHoliday ?? []).join(' · ') || (day.leave?'إجازة معتمدة':calendarStatus[day.status])}</Copy>
        {day.periods?.map((period,index)=><Copy key={index}>{period.name} · {period.start} – {period.end}</Copy>)}
        <View style={styles.row}>
          <Metric label="أول حضور" value={formatTime(day.punches?.find(item=>item.kind==='in')?.time)}/>
          <Metric label="آخر انصراف" value={formatTime(day.punches?.findLast(item=>item.kind==='out')?.time)}/>
          <Metric label="مدة العمل" value={duration(day.workedMinutes)}/>
        </View>
      </View>}
    </>}
  </View>;
}

function TeamAttendance({summary}) {
  const staff=new Map();
  for(const row of [...(summary?.scheduledShifts??[]),...(summary?.punches??[])]) {
    const person=staff.get(row.staffId) ?? {name:row.nameAr||row.name,shifts:new Map()};
    const key=row.shiftStart??row.scheduledStart??null;
    const shift=person.shifts.get(key) ?? {row,punches:[]};
    if(row.time) shift.punches.push(row);
    person.shifts.set(key,shift);
    staff.set(row.staffId,person);
  }
  if (!staff.size) return <Copy>لا توجد سجلات حضور لهذا اليوم.</Copy>;
  const people=[...staff.entries()].sort(([,a],[,b])=>a.name.localeCompare(b.name,'ar'));
  return people.map(([id,person])=>{
    const shifts=[...person.shifts.entries()].sort(([a],[b])=>(a??Infinity)-(b??Infinity));
    const day=summary.workedMinutesByStaff?.[id];
    return <View key={id} style={styles.panel}><Heading>{person.name}</Heading>
      {shifts.map(([key,shift],index)=>{
        const punches=shift.punches.sort((a,b)=>a.time.localeCompare(b.time));
        return <View key={String(key)} style={styles.shift}>
          {shifts.length>1 && index===shifts.length-1 && <View style={styles.dayTotal}>
            <Metric label="إجمالي اليوم" value={duration(day)}/>
          </View>}
          <Copy>{shift.row.periodName || 'فترة الدوام'} · {formatTime(shift.row.scheduledStart)} – {formatTime(shift.row.scheduledEnd)}</Copy>
          <View style={styles.row}>
            <Metric label="حضور" value={formatTime(punches.find(item=>item.kind==='in')?.time)}/>
            <Metric label="انصراف" value={formatTime(punches.findLast(item=>item.kind==='out')?.time)}/>
            <Metric label="إجمالي" value={duration(shifts.length>1 ? summary.workedMinutesByShift?.[id]?.[key] : day)}/>
          </View>
        </View>;
      })}
    </View>;
  });
}

const styles=StyleSheet.create({
  screen:{backgroundColor:colors.background,flex:1},
  header:{padding:14,flexDirection:'row-reverse',alignItems:'center',gap:10,backgroundColor:colors.panel,borderBottomWidth:1,borderColor:colors.line},
  logo:{width:40,height:40,borderRadius:10},
  body:{padding:14,gap:12},
  heading:{color:colors.white,fontSize:19,fontWeight:'700',textAlign:'right'},
  copy:{color:colors.muted,fontSize:14,textAlign:'right'},
  input:{color:colors.white,backgroundColor:colors.panel,borderColor:colors.line,borderWidth:1,borderRadius:11, minHeight:48,paddingHorizontal:12,textAlign:'right'},
  action:{backgroundColor:colors.teal,borderRadius:12,minHeight:48,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  actionText:{color:colors.white,fontSize:16,fontWeight:'700'},
  dimmed:{opacity:.65},
  hero:{backgroundColor:'#245054',padding:14,borderRadius:21,gap:12},
  clock:{fontSize:38,fontWeight:'700',color:colors.white,textAlign:'right'},
  row:{flexDirection:'row-reverse',gap:7},
  metric:{flexGrow:1,flexBasis:0,backgroundColor:colors.background,borderRadius:10,padding:8,gap:4},
  value:{color:colors.white,fontWeight:'700',textAlign:'right'},
  punchLabel:{flexDirection:'row-reverse',alignItems:'center',gap:8},
  fingerprint:{width:28,height:28},
  panel:{backgroundColor:colors.panel,borderColor:colors.line,borderWidth:1,borderRadius:16,padding:12,gap:8},
  shift:{gap:7},
  calendar:{gap:7},
  calendarHeader:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},
  calendarWeek:{flexDirection:'row-reverse',gap:4},
  calendarCell:{flex:1,alignItems:'center',justifyContent:'center'},
  calendarDay:{minHeight:40,borderRadius:10,borderWidth:2,borderColor:'transparent'},
  calendarSelected:{borderColor:colors.mint},
  dayNumber:{color:colors.white,fontSize:15},
  dayTotal:{alignItems:'center'},
  nav:{flexDirection:'row-reverse',backgroundColor:colors.panel,borderColor:colors.line,borderTopWidth:1},
  navItem:{flex:1,minHeight:54,alignItems:'center',justifyContent:'center',borderTopWidth:3,borderColor:'transparent'},
  navSelected:{borderColor:colors.mint},
});
