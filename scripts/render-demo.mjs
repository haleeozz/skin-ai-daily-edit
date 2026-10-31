import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const recording=JSON.parse(fs.readFileSync('qa/demo-recording.json','utf8'));
if(!recording.complete)throw new Error('The recording is incomplete; inspect it before rendering.');
const out='submission/video',clips=[];let total=0,srt='';
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,stdio:'pipe'});
const wrap=text=>text.split('\n').flatMap(line=>{const words=line.split(' '),rows=[''];for(const word of words){if(rows.at(-1).length+word.length>105)rows.push('');rows[rows.length-1]+=(rows.at(-1)?' ':'')+word;}return rows;}).join('\n');
const stamp=seconds=>{const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
for(const [index,scene] of recording.scenes.entries()){
 const length=scene.end-scene.start,duration=scene.id==='analysis'?Math.min(length,scene.voiceDuration+1):length;
 const caption=`${out}/${scene.id}.txt`,clip=`${out}/clip-${index}.mp4`;fs.writeFileSync(caption,wrap(scene.caption));
 const filter=`scale=1920:960,pad=1920:1080:0:0:color=0x18251e,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':textfile='${caption}':fontcolor=white:fontsize=27:line_spacing=7:x=(w-text_w)/2:y=976`;
 run(['-ss',String(scene.start),'-t',String(duration),'-i',recording.rawVideo,'-i',`${out}/${scene.id}.wav`,'-vf',filter,'-af','apad','-t',String(duration),'-r','30','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',clip]);
 clips.push(`file '${path.resolve(clip).replaceAll('\\','/')}'`);
 srt+=`${index+1}\n${stamp(total)} --> ${stamp(total+duration)}\n${scene.caption}\n\n`;total+=duration;
}
fs.writeFileSync(`${out}/clips.txt`,clips.join('\n'));fs.writeFileSync(`${out}/skin-ai-demo.srt`,srt);
run(['-f','concat','-safe','0','-i',`${out}/clips.txt`,'-c','copy','-movflags','+faststart',`${out}/skin-ai-demo.mp4`]);
if(total<60||total>180)throw new Error(`Video duration ${total.toFixed(1)}s is outside the required 1–3 minutes.`);
console.log(JSON.stringify({file:`${out}/skin-ai-demo.mp4`,duration:Math.round(total),narration:'Local Microsoft Zira English voice',processingWaitShortened:true}));
