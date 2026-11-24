import {roleIsAdministrator,managesBranch} from './branch-roles.js';
export const rolePermissionGroups=[
 ['الدخول','Sign-in',[
  ['anyBrowser','الدخول من أي متصفح','Sign in from any browser']]],
 ['الموظفون','Employees',[
  ['staffCreate','إضافة موظف','Add employees'],['staffEdit','تعديل بيانات الموظفين','Edit employees'],['staffRemove','إنهاء أو حذف الموظف','Remove employees'],['staffAccess','إرسال التفعيل واستعادة كلمة المرور','Employee activation and recovery']]],
 ['الحضور والدوام','Attendance',[
  ['periods','إضافة الفترات وتعديلها وحذفها','Manage work periods'],['schedules','إسناد الفترات وطرق الحضور','Assign schedules and attendance methods']]],
 ['الطلبات والمتابعة','Requests and follow-up',[
  ['requests','قبول الطلبات ورفضها ضمن سلسلة الموافقات','Approve and reject assigned requests'],['tasks','مركز المتابعة — استلام وإسناد وإغلاق المهام','Follow-up centre — receive, assign and close tasks']]],
 ['محفظة المستندات','Document wallet',[
  ['documents','عرض ورفع وتجديد وحذف جميع مستندات المنشأة','View, upload, renew and delete all company documents']]],
 ['مسير الرواتب والتقارير','Payroll and reports',[
  ['payrollEdit','إعداد المسير وتعديل الإضافات والخصومات','Prepare and edit payroll'],['payrollApprove','اعتماد المسير','Approve payroll'],['payrollExport','تصدير مسير الرواتب','Export payroll'],['payrollPayment','تحديث بيانات الدفع','Update payment details'],['reports','تصدير تقارير الحضور','Export attendance reports']]],
 ['الإعدادات','Settings',[
  ['requestsSettings','إعدادات الطلبات والإجازات الرسمية','Request and holiday settings'],['approvalChains','تعديل سلسلة الموافقات','Edit approval chains'],['notifications','إعدادات الإشعارات والرسائل والعبارات','Notification and message settings']]],
];
export const rolePermissionKeys=rolePermissionGroups.flatMap(g=>g[2].map(p=>p[0]));
export function permissionsFor(workspace,role){
 const defaults=role==='Manager';
 const saved=workspace.rolePermissions?.[role]?.values??{};
 return Object.fromEntries(rolePermissionKeys.map(key=>[key,typeof saved[key]==='boolean'?saved[key]:defaults&&!['approvalChains','documents'].includes(key)]));
}
export const hasRolePermission=(workspace,person,key)=>Boolean(person&&permissionsFor(workspace,person.role)[key]);
export const eligibleRequestApprover=(workspace,person)=>person?.status==='Active'&&hasRolePermission(workspace,person,'requests');
export const approvalRoleStep=role=>'role:'+role;
export const approvalRole=step=>typeof step==='string'&&step.startsWith('role:')?step.slice(5):null;
export const eligibleApprovalRoles=workspace=>(workspace.staffRoles??[]).filter(role=>permissionsFor(workspace,role).requests);
export function approvalStepMembers(workspace,request,step=request.approvalSteps?.[request.approvalIndex]){
 const role=approvalRole(step),applicant=workspace.staff.find(p=>p.id===request.staffId);
 return workspace.staff.filter(person=>eligibleRequestApprover(workspace,person)&&person.id!==request.staffId&&
  (role?person.role===role&&managesBranch(person,applicant?.branchId):person.id===step)).map(person=>person.id);
}
export const canDistributePermissions=(workspace,person)=>Boolean(person&&workspace.rolePermissions?.[person.role]?.managePermissions===true);
export const hasAdministration=(workspace,person)=>Boolean(person&&(person.role==='Manager'||canDistributePermissions(workspace,person)||workspace.rolePermissions?.[person.role]?.administrator===true||rolePermissionKeys.some(key=>key!=='anyBrowser'&&hasRolePermission(workspace,person,key))));
export function updateRolePermissions(workspace,body){
 if(!(workspace.staffRoles??['Manager','Employee']).includes(body.role)||!body.values||Array.isArray(body.values)||typeof body.values!=='object'||
   Object.keys(body.values).length!==rolePermissionKeys.length||Object.keys(body.values).some(key=>!rolePermissionKeys.includes(key)||typeof body.values[key]!=='boolean'))throw Error('Choose valid role permissions.');
 if(body.administrator!==undefined&&typeof body.administrator!=='boolean')throw Error('Choose valid role permissions.');
 if(body.managePermissions!==undefined&&typeof body.managePermissions!=='boolean')throw Error('Choose valid role permissions.');
 const previous=workspace.rolePermissions?.[body.role];
 if(body.expectedVersion!==(previous?.version??0))throw Error('Permissions changed. Reload and try again.');
 if(permissionsFor(workspace,body.role).anyBrowser&&!body.values.anyBrowser){
  for(const person of workspace.staff.filter(p=>p.role===body.role&&p.account)){
   delete person.account.managerSessions;
   delete person.account.managerSessionExpirations;
  }
 }
 workspace.rolePermissions??={};
 workspace.rolePermissions={...workspace.rolePermissions,[body.role]:{administrator:body.administrator??roleIsAdministrator(workspace,body.role),managePermissions:body.managePermissions??previous?.managePermissions??false,values:{...body.values},version:(previous?.version??0)+1,updatedAt:new Date().toISOString()}};
}
export function actionPermission(path,body={}){
 if(path.startsWith('/api/documents'))return 'documents';
 if(path==='/api/approval-chains')return 'approvalChains';
 if(path==='/api/staff')return 'staffCreate';
 if(['/api/staff/update','/api/staff/enrich','/api/staff/assign-direct-manager','/api/leave-balances/adjust'].includes(path))return 'staffEdit';
 if(path==='/api/staff/remove')return 'staffRemove';
 if(['/api/staff/password','/api/staff/recovery-link','/api/staff/activation-link'].includes(path))return 'staffAccess';
 if(path.startsWith('/api/work-periods'))return 'periods';
 if(['/api/work-assignments','/api/work-schedule','/api/attendance-methods','/api/locations','/api/locations/anywhere','/api/locations/branch'].includes(path))return 'schedules';
 if(path==='/api/decision')return 'requests';
 if(path.startsWith('/api/follow-up/'))return 'tasks';
 if(path==='/api/payroll')return body.operation==='approve'?'payrollApprove':body.operation==='export'?'payrollExport':['bank','payment'].includes(body.operation)?'payrollPayment':'payrollEdit';
 if(path==='/api/issued-reports')return 'reports';
 if(['/api/request-preferences','/api/official-holidays','/api/leave-types','/api/leave-types/status','/api/leave-preferences'].includes(path))return 'requestsSettings';
 if(['/api/notification-preferences','/api/notification-settings','/api/attendance-report-settings','/api/encouragement-settings'].includes(path))return body.key==='display'?null:'notifications';
 return null;
}
export function authorizeRoleAction(workspace,person,path,body){
 const key=actionPermission(path,body);
 if(key&&!hasRolePermission(workspace,person,key))throw Error('This action is not allowed by your role permissions.');
}
