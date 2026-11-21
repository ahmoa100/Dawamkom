import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('native upload camera and photo selection have iOS privacy purpose descriptions',()=>{
 const config=JSON.parse(readFileSync(new URL('../dawamkom-ios/app.json',import.meta.url),'utf8')).expo;
 for(const key of ['NSCameraUsageDescription','NSPhotoLibraryUsageDescription'])assert.ok(typeof config.ios.infoPlist[key]==='string'&&config.ios.infoPlist[key].trim().length>20,key+' must explain the upload use case to avoid privacy termination');
 assert.equal(config.ios.bundleIdentifier,'net.dawamkom.app');
});
test('approved vector artwork supplies opaque high-resolution native and web icons',()=>{
 assert.equal(readFileSync(new URL('../public/dawamkom-logo.svg',import.meta.url),'utf8'),readFileSync(new URL('../design/brand/dawamkom-logo.svg',import.meta.url),'utf8'));
 for(const [file,size] of [['dawamkom-ios/assets/icon.png',1024],['public/app-icon-512.png',512],['public/app-icon-192.png',192],['public/apple-touch-icon.png',180]]){
  const png=readFileSync(new URL('../'+file,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);assert.equal(png[25],2,'Icons must be opaque RGB');
 }
});
