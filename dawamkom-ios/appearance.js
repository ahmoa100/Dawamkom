export function nativeThemeMessage(url, message) {
  try {
    if (new URL(url).origin !== 'https://www.dawamkom.net') return null;
  } catch { return null; }
  return message?.type === 'appearance' && ['light','dark'].includes(message.theme) ? message.theme : null;
}

export const nativeAppearance = {
  dark: {background:'#111d22', barStyle:'light-content', text:'#eef8f8'},
  light: {background:'#dce5da', barStyle:'dark-content', text:'#244b3e'},
};
