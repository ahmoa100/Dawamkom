// Saudi IBAN: SA + check digits + two-digit bank identifier + account.
const banks = {
  '05':['مصرف الإنماء','Alinma Bank'], '10':['البنك الأهلي السعودي','Saudi National Bank'],
  '15':['بنك البلاد','Bank Albilad'], '20':['بنك الرياض','Riyad Bank'],
  '30':['البنك العربي الوطني','Arab National Bank'],
  '40':['البنك الأهلي السعودي (سامبا سابقًا)','Saudi National Bank (formerly Samba)'],
  '45':['البنك السعودي الأول','Saudi Awwal Bank'],
  '50':['البنك السعودي الأول (الأول سابقًا)','Saudi Awwal Bank (formerly Alawwal)'],
  '55':['البنك السعودي الفرنسي','Banque Saudi Fransi'], '60':['بنك الجزيرة','Bank AlJazira'],
  '65':['البنك السعودي للاستثمار','Saudi Investment Bank'], '80':['مصرف الراجحي','Al Rajhi Bank'],
  '90':['بنك الخليج الدولي','Gulf International Bank'],
};
export function normalizeIban(value) {
  return String(value ?? '').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
    .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/\s/g,'').toUpperCase();
}
export function validSaudiIban(value) {
  const iban=normalizeIban(value);
  if (!/^SA\d{22}$/.test(iban) || Number(iban.slice(2,4))<2 || Number(iban.slice(2,4))>98) return false;
  const digits=iban.slice(4)+'2810'+iban.slice(2,4);
  let remainder=0;
  for (const digit of digits) remainder=(remainder*10+Number(digit))%97;
  return remainder===1;
}
export function ibanBank(value,language='ar') {
  const iban=normalizeIban(value);
  if (!/^SA\d{4}/.test(iban)) return '';
  const bank=banks[iban.slice(4,6)];
  return bank ? bank[language==='en'?1:0] : '';
}
