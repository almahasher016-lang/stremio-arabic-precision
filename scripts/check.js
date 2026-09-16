import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {VERSION} from '../src/version.js';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(pkg.version!==VERSION){console.error('Version mismatch');process.exit(1);}
const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
if(!readme.startsWith(`# Arabic Precision Subtitles — v${VERSION}\n`)||!readme.trimEnd().endsWith(`## Version: ${VERSION}`)){console.error('README header/footer version mismatch');process.exit(1);}
let count=0;
async function visit(dir){for(const name of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,name.name);if(name.isDirectory())await visit(path);
  else if(name.name.endsWith('.js')){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);count++;}
}}
await visit(new URL('../src/',import.meta.url).pathname);await visit(new URL('../scripts/',import.meta.url).pathname);await visit(new URL('../test/',import.meta.url).pathname);
console.log(`Syntax verified in ${count} JavaScript files; package, runtime and README versions match (${VERSION}).`);
