"""Local-only word timing for an already generated narration; no API calls."""
from pathlib import Path
import json,os,sys,subprocess
ROOT=Path(__file__).resolve().parent.parent
os.environ['HF_HOME']=str(ROOT/'qa/audio-models')
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING']='1'
sys.path.insert(0,str(ROOT/'qa/audio-tools'))
from faster_whisper import WhisperModel
import numpy as np

audio=ROOT/'submission/video/elevenlabs/megan-narration.mp3'
print('Loading local English timing model.',flush=True)
model=WhisperModel('base.en',device='cpu',compute_type='int8',cpu_threads=4,download_root=str(ROOT/'qa/audio-models'))
decoded=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(audio),'-f','f32le','-ac','1','-ar','16000','pipe:1'],check=True,capture_output=True).stdout
samples=np.frombuffer(decoded,dtype=np.float32)
segments,info=model.transcribe(samples,language='en',beam_size=5,temperature=0,word_timestamps=True,vad_filter=True,condition_on_previous_text=False,initial_prompt='Skin AI. YouCam. Niacinamide. Manufacturer labels. Skincare ingredients.')
words=[]
for index,segment in enumerate(segments):
    words.extend({'text':w.word.strip(),'start':w.start,'end':w.end,'probability':w.probability} for w in segment.words or [])
    print(f'Timed passage {index+1}: {segment.end:.1f}s',flush=True)
target=ROOT/'qa/megan-word-timings.json'
target.write_text(json.dumps({'duration':info.duration,'language':info.language,'words':words},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'words':len(words),'duration':info.duration,'output':str(target)}),flush=True)
