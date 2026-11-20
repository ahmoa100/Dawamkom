// Recover missing PDF ToUnicode mappings only when the embedded Unicode cmap
// contains a complete, unambiguous Arabic-Indic digit set. Explicit PDF maps win.
export function recoverArabicIdentityMap(mappings,charCodeToGlyphId){
 const digits=new Map(mappings.filter(m=>m.charCode>=0x660&&m.charCode<=0x669).map(m=>[m.charCode,m.glyphId]));
 if(digits.size!==10||new Set(digits.values()).size!==10)return null;
 const reverse=new Map();
 for(const {charCode,glyphId} of mappings){
  if(!Number.isInteger(charCode)||charCode<32||charCode>0x10ffff||(charCode>=0xd800&&charCode<=0xdfff)||(charCode>=0xe000&&charCode<=0xf8ff)||!glyphId)continue;
  // Prefer base Unicode characters over presentation forms and compatibility aliases.
  if(!reverse.has(glyphId)||charCode<reverse.get(glyphId))reverse.set(glyphId,charCode);
 }
 const recovered=new Map();
 for(const [charCode,glyphId] of charCodeToGlyphId){const unicode=reverse.get(glyphId);if(unicode!==undefined)recovered.set(charCode,String.fromCodePoint(unicode));}
 return recovered.size?recovered:null;
}
