"""Match the approved script to local word timings and prepare short subtitles."""
from pathlib import Path
import json,re,difflib,math
ROOT=Path(__file__).resolve().parent.parent
recording=json.loads((ROOT/'qa/demo-recording.json').read_text())
timings=json.loads((ROOT/'qa/megan-word-timings.json').read_text())
titles=['A clearer starting point.','Your skin has context.','Your photo. Your permission.','YouCam analysis.','Understand what you see.','Evidence behind each option.','Your ingredients. Your boundaries.','A routine you can keep.','Less guesswork. More understanding.']
aliases={'80':'eighty','30':'thirty','6':'six','3':'three','2':'two','ucam':'youcam','ucom':'youcam'}
def norm(value):
    value=re.sub(r'[^a-z0-9]','',value.lower())
    return aliases.get(value,value)
expected=[];starts=[]
for scene in recording['scenes']:
    starts.append(len(expected))
    expected.extend({'text':word,'scene':scene['id']} for word in scene['text'].split())
heard=[w for w in timings['words'] if norm(w['text'])]
match=difflib.SequenceMatcher(None,[norm(w['text']) for w in expected],[norm(w['text']) for w in heard],autojunk=False)
mapped={}
for block in match.get_matching_blocks():
    for offset in range(block.size):mapped[block.a+offset]=heard[block.b+offset]
coverage=len(mapped)/len(expected)
print(json.dumps({'scriptWords':len(expected),'recognizedWords':len(heard),'matched':len(mapped),'coverage':round(coverage,4),'unmatched':[w['text'] for i,w in enumerate(expected) if i not in mapped]}),flush=True)
if coverage<0.90:raise RuntimeError('Transcript requires review before creating synchronized captions.')
# Interpolate only the few unmatched proper names/punctuation variants, bounded
# by real neighboring word timings. Caption text always remains the exact script.
for i,word in enumerate(expected):
    if i in mapped:word.update(start=mapped[i]['start'],end=mapped[i]['end']);continue
    left=max((k for k in mapped if k<i),default=-1)
    right=min((k for k in mapped if k>i),default=len(expected))
    t0=mapped[left]['end'] if left>=0 else 0
    t1=mapped[right]['start'] if right<len(expected) else timings['duration']
    step=max(0.01,(t1-t0)/(right-left-1))
    word.update(start=t0+step*(i-left-1),end=t0+step*(i-left))

boundaries=[0]
for i in starts[1:]:boundaries.append(round(((expected[i-1]['end']+expected[i]['start'])/2)*30)/30)
duration=math.ceil((timings['duration']+1.2)*30)/30
boundaries.append(duration)
chapters=[]
for i,scene in enumerate(recording['scenes']):
    chapters.append({'id':scene['id'],'title':titles[i],'start':boundaries[i],'end':boundaries[i+1],'sourceStart':scene['start'],'sourceDuration':scene['end']-scene['start']})

cues=[];current=[]
def flush():
    if not current:return
    text=' '.join(w['text'] for w in current)
    cues.append({'start':max(0,current[0]['start']-0.04),'end':current[-1]['end']+0.13,'text':text})
    current.clear()
for i,word in enumerate(expected):
    proposed=' '.join(w['text'] for w in current+[word])
    if current and (len(proposed)>72 or word['start']-current[-1]['end']>0.45 or word['end']-current[0]['start']>3.8):flush()
    current.append(word)
    if re.search(r'[.!?]$',word['text']) and len(' '.join(w['text'] for w in current))>=22:flush()
flush()
for i,cue in enumerate(cues):
    next_start=cues[i+1]['start'] if i+1<len(cues) else duration
    cue['end']=min(next_start-0.025,max(cue['end'],cue['start']+0.85))
    if cue['end']<=cue['start']:raise RuntimeError('Invalid subtitle interval')
def wrap(text):
    if len(text)<=44:return text
    positions=[m.start() for m in re.finditer(' ',text)]
    split=min(positions,key=lambda n:abs(n-len(text)/2))
    return text[:split]+r'\N'+text[split+1:]
def ass_time(s):
    n=round(s*100)
    return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def srt_time(s):
    n=round(s*1000)
    return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Narration,Segoe UI Semibold,32,&H002D3526,&H002D3526,&H00F2F4F1,&H00F2F4F1,0,0,0,0,100,100,0.1,0,1,0,0,2,220,220,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for cue in cues:ass+=f"Dialogue: 0,{ass_time(cue['start'])},{ass_time(cue['end'])},Narration,,0,0,0,,{{\\fad(70,100)}}{wrap(cue['text'])}\n"
out=ROOT/'submission/video/elevenlabs'
(out/'megan-subtitles.ass').write_text(ass,encoding='utf-8-sig')
(out/'megan-subtitles.srt').write_text(''.join(f"{i+1}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{wrap(c['text']).replace(chr(92)+'N',chr(10))}\n\n" for i,c in enumerate(cues)),encoding='utf-8')
plan={'rawVideo':recording['rawVideo'],'duration':duration,'narrationDuration':timings['duration'],'alignmentCoverage':coverage,'chapters':chapters,'cues':cues}
(ROOT/'qa/megan-edit-plan.json').write_text(json.dumps(plan,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'chapters':len(chapters),'subtitleCues':len(cues),'duration':duration,'longestCueCharacters':max(len(c['text']) for c in cues)}),flush=True)
