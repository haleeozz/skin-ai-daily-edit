// Reuses verified live footage. No provider calls or new speech generations.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(fs.readFileSync('qa/megan-edit-plan.json','utf8'));
const out='submission/video/elevenlabs';
fs.mkdirSync('qa/video-fonts',{recursive:true});
if(!fs.existsSync('qa/video-fonts/seguisb.ttf'))fs.copyFileSync('C:/Windows/Fonts/seguisb.ttf','qa/video-fonts/seguisb.ttf');
const muxOnly=process.argv.includes('--mux-only');
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe',windowsHide:true,maxBuffer:2_000_000});
const font='C\\:/Windows/Fonts/segoeui.ttf',serif='C\\:/Windows/Fonts/georgiai.ttf';
const draw=(file,size,x,y,color='0x26352d',face=font)=>`drawtext=fontfile='${face}':textfile='${file}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
const textFile=(name,text)=>{const file=`${out}/${name}.txt`;fs.writeFileSync(file,text);return file;};
const chapters=[];
for(const [i,chapter] of plan.chapters.entries()){
 const duration=chapter.end-chapter.start,clip=`${out}/chapter-${i}.mp4`;
 if(muxOnly){
  const existing=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',clip],{encoding:'utf8',windowsHide:true}).trim());
  if(Math.abs(existing-duration)>0.08)throw new Error('Existing chapter does not match this edit plan.');
  chapters.push(`file '${path.resolve(clip).replaceAll('\\','/')}'`);continue;
 }
 const title=textFile(`title-${i}`,chapter.title),count=textFile(`count-${i}`,`${String(i+1).padStart(2,'0')} / 09`);
 console.log('Rendering chapter:',chapter.id);
 let graph,args;
 if(chapter.id==='finish'){
  const brand=textFile('brand','SKIN  /  AI'),a=textFile('end-a','Less guesswork.'),b=textFile('end-b','More understanding.'),url=textFile('end-url','skin-ai-daily-edit.vercel.app');
  graph=[draw(brand,38,'(w-text_w)/2',315),draw(a,66,'(w-text_w)/2',416,'0x26352d',serif),draw(b,66,'(w-text_w)/2',497,'0x68796d',serif),draw(url,23,'(w-text_w)/2',625,'0x526158'),'fade=t=in:st=0:d=0.3:color=0xf2f4f1'].join(',');
  args=['-f','lavfi','-i',`color=c=0xf2f4f1:s=1920x1080:r=30:d=${duration}`,'-vf',graph];
 }else{
  const used=Math.min(chapter.sourceDuration,duration);
  graph=`[0:v]trim=duration=${used},setpts=PTS-STARTPTS,scale=1728:864:flags=lanczos,tpad=stop_mode=clone:stop_duration=${Math.max(0,duration-used)+0.1}[app];`+
   `color=c=0xf2f4f1:s=1920x1080:r=30:d=${duration}[canvas];`+
   `[canvas]drawbox=x=102:y=79:w=1728:h=864:color=0x26352d@0.055:t=fill[shadow];`+
   `[shadow][app]overlay=x=96:y=72,drawbox=x=95:y=71:w=1730:h=866:color=0xdce2dd:t=1,${draw(title,24,96,28,'0x526158',serif)},${draw(count,17,'1824-text_w',32,'0x68796d')}`;
  if(chapter.id==='analysis')graph+=','+draw(textFile('wait-note','Processing wait shortened'),15,'1824-text_w',951,'0x68796d');
  if(chapter.id==='sources')graph+=','+draw(textFile('names-note','Product names omitted in recording · Full labels in the app'),15,'1824-text_w',951,'0x68796d');
  graph+='[v]';
  args=['-ss',String(chapter.sourceStart),'-t',String(used),'-i',plan.rawVideo,'-filter_complex',graph,'-map','[v]'];
 }
 run([...args,'-an','-t',String(duration),'-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',clip]);
 chapters.push(`file '${path.resolve(clip).replaceAll('\\','/')}'`);
}
fs.writeFileSync(`${out}/chapters.txt`,chapters.join('\n'));
run(['-f','concat','-safe','0','-i',`${out}/chapters.txt`,'-c','copy',`${out}/picture.mp4`]);
run(['-i',`${out}/picture.mp4`,'-i',`${out}/megan-narration.mp3`,'-vf',`ass=${out}/megan-subtitles.ass:fontsdir=qa/video-fonts`,'-af','loudnorm=I=-16:TP=-1.5:LRA=11,apad','-ar','48000','-t',String(plan.duration),'-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','submission/video/skin-ai-demo-megan.mp4']);
console.log(JSON.stringify({file:'submission/video/skin-ai-demo-megan.mp4',seconds:plan.duration,narrator:'ElevenLabs Megan',alignedWordCoverage:plan.alignmentCoverage,providerTasksCreated:0}));
